// =============================================================================
// modules/ordering/service.ts
// Business logic per purchase orders.
// =============================================================================

import { requireOrgId } from '@/modules/identity/service';
import { createClient } from '@/lib/supabase/server';
import { AuthError, BusinessRuleError, mapSupabaseError } from '@/lib/errors';
import { dispatchOrderToSupplier } from '@/lib/order-dispatch';
import * as repo from './repository';
import * as reportingRepo from '@/modules/reporting/repository';
import { createOrderSchema, updateOrderSchema, changeStatusSchema } from './schemas';
import type {
  PurchaseOrder,
  PurchaseOrderListItem,
  OrderStatusEvent,
  OrderStatus,
} from './types';
import type { CreateOrderInput, UpdateOrderInput, ChangeStatusInput } from './schemas';

// ---------------------------------------------------------------------------
// State machine: allowed transitions
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft:     ['sent', 'cancelled'],
  sent:      ['confirmed', 'cancelled'],
  confirmed: ['received', 'cancelled'],
  received:  [],
  cancelled: [],
};

function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new BusinessRuleError(
      `Transizione non consentita: ${from} → ${to}.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listOrders(): Promise<PurchaseOrderListItem[]> {
  const orgId = await requireOrgId();
  return repo.listOrders(orgId);
}

export async function getOrder(id: string): Promise<PurchaseOrder> {
  return repo.getOrderById(id);
}

export async function getOrderHistory(id: string): Promise<OrderStatusEvent[]> {
  return repo.listStatusHistory(id);
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createOrder(raw: unknown): Promise<PurchaseOrder> {
  const orgId = await requireOrgId();
  const input: CreateOrderInput = createOrderSchema.parse(raw);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthError();

  const order = await repo.insertOrder(orgId, input);

  // Ogni ordine nasce con la sua history: (null -> draft).
  await repo.appendStatusHistory(order.id, null, 'draft', user.id);

  return order;
}

export async function updateOrder(id: string, raw: unknown): Promise<PurchaseOrder> {
  const input: UpdateOrderInput = updateOrderSchema.parse(raw);

  const existing = await repo.getOrderById(id);

  if (existing.status !== 'draft') {
    throw new BusinessRuleError(
      'Solo gli ordini in bozza possono essere modificati.',
    );
  }

  await repo.patchOrder(id, {
    supplierId:   input.supplierId,
    orderDate:    input.orderDate,
    expectedDate: input.expectedDate || null,
    notes:        input.notes,
  });

  if (input.lineItems && input.lineItems.length > 0) {
    await repo.deleteOrderLineItems(id);
    await repo.insertOrderLineItems(id, input.lineItems);
  }

  return repo.getOrderById(id);
}

export async function changeOrderStatus(
  id: string,
  raw: unknown,
): Promise<PurchaseOrder> {
  const input: ChangeStatusInput = changeStatusSchema.parse(raw);
  const existing = await repo.getOrderById(id);

  assertTransition(existing.status, input.status);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthError();

  // Ricezione = write-path TRANSAZIONALE (RPC 019): inserisce i movimenti
  // purchase_receipt per ogni riga, aggiorna quantity_received, rinfresca il
  // prezzo cache su ingredient_products, porta lo stato a 'received' e scrive la
  // history — tutto atomicamente. Niente scritture parziali su fallimento.
  if (input.status === 'received') {
    const { error } = await supabase.rpc('receive_purchase_order', { p_order_id: id });
    if (error) throw mapSupabaseError(error);
    return repo.getOrderById(id);
  }

  // Altre transizioni: solo stato + history (nessun effetto su magazzino).
  const patchFields: Parameters<typeof repo.patchOrder>[1] = {
    status: input.status,
  };

  let historyNotes = input.notes;

  if (input.status === 'sent') {
    patchFields.sentAt = new Date().toISOString();
    // Canale di invio reale, con fallback ESPLICITO se non configurato.
    const dispatch = await dispatchOrderToSupplier({
      orderId:       existing.id,
      supplierName:  existing.supplierName,
      supplierEmail: existing.supplierEmail,
      orderDate:     existing.orderDate,
      expectedDate:  existing.expectedDate,
      notes:         existing.notes,
      lines: existing.lineItems.map((li) => ({
        name:      li.ingredientName,
        quantity:  li.quantity,
        unit:      li.unitSnapshot,
        unitPrice: li.unitPriceSnapshot,
      })),
    });
    historyNotes = [input.notes, dispatch.detail].filter(Boolean).join(' — ');
  }

  await repo.patchOrder(id, patchFields);
  await repo.appendStatusHistory(
    id,
    existing.status,
    input.status,
    user.id,
    historyNotes,
  );

  return repo.getOrderById(id);
}

export async function cancelOrder(id: string, notes?: string): Promise<void> {
  const existing = await repo.getOrderById(id);
  assertTransition(existing.status, 'cancelled');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthError();

  await repo.patchOrder(id, { status: 'cancelled' });
  await repo.appendStatusHistory(id, existing.status, 'cancelled', user.id, notes);
}

// ---------------------------------------------------------------------------
// A1 — Auto-draft ordini dal fabbisogno reale di un piano
// ---------------------------------------------------------------------------

export interface DraftFromShortageResult {
  createdOrderIds: string[];
  /** Ingredienti in shortage senza fornitore in anagrafica: da ordinare a mano. */
  skippedIngredients: string[];
}

/**
 * Genera UNA bozza d'ordine reale PER FORNITORE partendo dalle shortage del
 * piano. Quantità = shortage reale; prezzo = prezzo corrente ingrediente.
 * L'operatore rivede le bozze in /orders (sono draft: modificabili).
 */
export async function createDraftOrdersFromShortage(planId: string): Promise<DraftFromShortageResult> {
  const orgId = await requireOrgId();
  const requirements = await reportingRepo.listIngredientRequirements(orgId, planId);
  const shortages = requirements.filter((r) => r.estimatedShortage > 0);

  if (shortages.length === 0) {
    throw new BusinessRuleError('Il piano non ha shortage: nessun ordine da generare.');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthError();

  // Raggruppa per fornitore (ingredienti senza fornitore -> skipped, espliciti).
  const bySupplier = new Map<string, typeof shortages>();
  const skipped: string[] = [];
  for (const s of shortages) {
    if (!s.supplierId) {
      skipped.push(s.ingredientName);
      continue;
    }
    const arr = bySupplier.get(s.supplierId) ?? [];
    arr.push(s);
    bySupplier.set(s.supplierId, arr);
  }

  const createdOrderIds: string[] = [];
  for (const [supplierId, lines] of bySupplier) {
    const order = await repo.insertOrder(orgId, {
      supplierId,
      orderDate: new Date().toISOString().slice(0, 10),
      expectedDate: '',
      notes: `Bozza generata dal fabbisogno del piano ${lines[0].planDate}.`,
      lineItems: lines.map((l) => ({
        ingredientProductId: l.ingredientProductId,
        quantity: Math.round(l.estimatedShortage * 1000) / 1000,
        unitSnapshot: l.unit,
        unitPriceSnapshot: l.currentUnitPrice,
      })),
    } as CreateOrderInput);
    await repo.appendStatusHistory(order.id, null, 'draft', user.id, 'Generato automaticamente da shortage piano');
    createdOrderIds.push(order.id);
  }

  return { createdOrderIds, skippedIngredients: skipped };
}
