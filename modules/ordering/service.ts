// =============================================================================
// modules/ordering/service.ts
// Business logic per purchase orders.
// =============================================================================

import { requireOrgId } from '@/modules/identity/service';
import { createClient } from '@/lib/supabase/server';
import { BusinessRuleError, mapSupabaseError, NotFoundError } from '@/lib/errors';
import { dispatchOrderToSupplier } from '@/lib/order-dispatch';
import { getLowStockAlerts } from '@/modules/inventory/service';
import { listIngredients } from '@/modules/catalog/service';
import * as repo from './repository';
import * as reportingRepo from '@/modules/reporting/repository';
import { createOrderSchema, updateOrderSchema, changeStatusSchema } from './schemas';
import type {
  PurchaseOrder,
  PurchaseOrderListItem,
  OrderStatusEvent,
  OrderStatus,
  DispatchOutcome,
} from './types';
import type { CreateOrderInput, UpdateOrderInput, ChangeStatusInput } from './schemas';

// ---------------------------------------------------------------------------
// State machine: allowed transitions
// ---------------------------------------------------------------------------

// La ricezione NON è una transizione dell'ordering: la merce entra a magazzino
// solo dal goods receipt engine, che porta l'ordine a 'received' lato DB. Nessun
// path applicativo qui può scrivere 'received'.
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft:     ['sent', 'cancelled'],
  sent:      ['confirmed', 'cancelled'],
  confirmed: ['cancelled'],
  // 'partial' è scritto SOLO dal goods receipt engine; da qui nessuna transizione
  // (il resto si riceve dai receipts, che porteranno l'ordine a 'received').
  partial:   [],
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

/** Difesa in profondità (oltre alla RLS): l'ordine deve essere dell'org corrente. */
async function assertOrderInOrg(order: PurchaseOrder): Promise<void> {
  const orgId = await requireOrgId();
  if (order.organizationId !== orgId) throw new NotFoundError('Ordine d\'acquisto');
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listOrders(): Promise<PurchaseOrderListItem[]> {
  const orgId = await requireOrgId();
  return repo.listOrders(orgId);
}

export async function getOrder(id: string): Promise<PurchaseOrder> {
  const order = await repo.getOrderById(id);
  await assertOrderInOrg(order);
  return order;
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

  // Guard "niente doppia verità": un fornitore COLLEGATO a BakeryOS non deve mai
  // produrre un ordine standard email/manuale. Il canale corretto è l'ordine
  // condiviso dal catalogo (marketplace). La UI già instrada lì; questo è il
  // confine lato write-path. NB: vale solo per la creazione interattiva — le
  // bozze da auto-riordino chiamano repo.insertOrder direttamente.
  await assertSupplierNotConnected(orgId, input.supplierId);

  // Header + righe + history iniziale (null -> draft) in UNA transazione (RPC).
  // Nessun ordine può più nascere senza la sua riga di history.
  return repo.insertOrder(orgId, input);
}

/** True se il fornitore locale è collegato a BakeryOS con connessione ATTIVA. */
async function isSupplierConnected(orgId: string, supplierId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: sup } = await supabase
    .from('suppliers')
    .select('supplier_org_id')
    .eq('id', supplierId)
    .maybeSingle();
  const supplierOrgId = (sup as { supplier_org_id: string | null } | null)?.supplier_org_id ?? null;
  if (!supplierOrgId) return false; // solo-email: PO standard corretto

  const { data: conn } = await supabase
    .from('supplier_customer_connections')
    .select('id')
    .eq('customer_org_id', orgId)
    .eq('supplier_org_id', supplierOrgId)
    .eq('status', 'active')
    .maybeSingle();
  return conn !== null;
}

async function assertSupplierNotConnected(orgId: string, supplierId: string): Promise<void> {
  if (await isSupplierConnected(orgId, supplierId)) {
    throw new BusinessRuleError(
      'Questo fornitore è collegato a BakeryOS: crea un ordine condiviso dal suo catalogo, non un ordine email/manuale.',
    );
  }
}

export async function updateOrder(id: string, raw: unknown): Promise<PurchaseOrder> {
  const input: UpdateOrderInput = updateOrderSchema.parse(raw);

  const existing = await repo.getOrderById(id);
  await assertOrderInOrg(existing);

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

  // A) La ricezione NON passa più dagli ordini: è confinata al goods receipt
  // engine, che porta l'ordine a 'received'. Guard esplicito con messaggio chiaro
  // (oltre alla state machine, che comunque non consente più → received).
  if (input.status === 'received') {
    throw new BusinessRuleError(
      'La merce ricevuta si registra dal modulo Ricevimenti: gli ordini non si portano più manualmente a “ricevuto”.',
    );
  }

  const existing = await repo.getOrderById(id);
  await assertOrderInOrg(existing);

  assertTransition(existing.status, input.status);

  // Guard "niente doppia verità" ANCHE all'invio: una bozza verso un fornitore
  // COLLEGATO (es. generata dall'auto-riordino, che bypassa createOrder) non deve
  // partire via email/manuale. Il canale giusto è l'ordine condiviso: la UI del
  // dettaglio bozza offre la conversione con righe precompilate dal catalogo.
  // Vale solo per gli ordini NON specchio (i mirror non transitano mai per 'sent').
  if (input.status === 'sent' && !existing.marketplaceOrderId) {
    if (await isSupplierConnected(existing.organizationId, existing.supplierId)) {
      throw new BusinessRuleError(
        `${existing.supplierName} è collegato a BakeryOS: questa bozza non si invia via email. ` +
          'Aprila e usa "Crea ordine condiviso" per convertirla (righe precompilate dal catalogo).',
      );
    }
  }

  const supabase = await createClient();

  // Invio al fornitore: dispatch ESTERNO (fallibile, mai bloccante) seguito dalla
  // transizione ATOMICA via RPC `mark_order_sent` — status + sent_at +
  // dispatch_outcome + history in UNA transazione (niente buco di audit se una
  // delle scritture fallisce). dispatch_outcome rende lo stato ONESTO: "Inviato"
  // solo se il recapito è attestato, altrimenti "Da inviare a mano".
  if (input.status === 'sent') {
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
    const outcome: DispatchOutcome = dispatch.delivered
      ? 'delivered'
      : dispatch.channel === 'manual'
      ? 'manual'
      : 'failed';
    const note = [input.notes, dispatch.detail].filter(Boolean).join(' — ') || null;

    const { error } = await supabase.rpc('mark_order_sent', {
      p_order_id: id,
      p_outcome:  outcome,
      p_note:     note,
    });
    if (error) throw mapSupabaseError(error);
    return repo.getOrderById(id);
  }

  // Altre transizioni (es. 'confirmed', opzionale): stato + history ATOMICI via
  // RPC `set_order_status` (rifiuta received/sent/draft). Nessun effetto magazzino.
  const { error } = await supabase.rpc('set_order_status', {
    p_order_id:  id,
    p_to_status: input.status,
    p_note:      input.notes || null,
  });
  if (error) throw mapSupabaseError(error);

  return repo.getOrderById(id);
}

export async function cancelOrder(id: string, notes?: string): Promise<void> {
  const existing = await repo.getOrderById(id);
  await assertOrderInOrg(existing);
  assertTransition(existing.status, 'cancelled');

  // Stato + history ATOMICI (RPC). Niente annullamento senza riga di audit.
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_order_status', {
    p_order_id:  id,
    p_to_status: 'cancelled',
    p_note:      notes || null,
  });
  if (error) throw mapSupabaseError(error);
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
 * P1-A — bozze d'ordine dalle SCORTE SOTTO SOGLIA (una per fornitore), stessa
 * meccanica delle bozze da shortage del piano: prima dal magazzino usciva un
 * solo form monofornitore. Quantità = regola canonica 2×soglia. Ingredienti
 * senza fornitore → skipped espliciti (mai bozze mute).
 */
export async function createDraftOrdersFromLowStock(): Promise<DraftFromShortageResult> {
  const orgId = await requireOrgId();

  const alerts = await getLowStockAlerts();
  if (alerts.length === 0) {
    throw new BusinessRuleError('Nessuna scorta sotto soglia: niente da ordinare.');
  }

  const ingredients = await listIngredients();
  const byId = new Map(ingredients.map((i) => [i.id, i]));

  type DraftLine = { ingredientProductId: string; quantity: number; unitSnapshot: string; unitPriceSnapshot: number | null };
  const bySupplier = new Map<string, DraftLine[]>();
  const skipped: string[] = [];
  for (const a of alerts) {
    const quantity = Math.max(0, Math.round((a.minThreshold * 2 - a.currentQuantity) * 1000) / 1000);
    if (quantity <= 0) continue; // già sopra il riordino dopo arrotondamento
    const product = byId.get(a.ingredientProductId);
    if (!product?.supplierId) {
      skipped.push(a.ingredientName);
      continue;
    }
    const arr = bySupplier.get(product.supplierId) ?? [];
    arr.push({
      ingredientProductId: a.ingredientProductId,
      quantity,
      unitSnapshot: a.unit,
      unitPriceSnapshot: product.unitPrice ?? null,
    });
    bySupplier.set(product.supplierId, arr);
  }

  const createdOrderIds: string[] = [];
  for (const [supplierId, lineItems] of bySupplier) {
    const order = await repo.insertOrder(
      orgId,
      {
        supplierId,
        orderDate: new Date().toISOString().slice(0, 10),
        expectedDate: '',
        notes: 'Bozza generata dalle scorte sotto soglia (riordino a 2× la soglia minima).',
        lineItems,
      } as CreateOrderInput,
      'Generato automaticamente dalle scorte sotto soglia',
    );
    createdOrderIds.push(order.id);
  }

  return { createdOrderIds, skippedIngredients: skipped };
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
    // Arrotonda a 3 decimali (precisione DB) e SCARTA le righe che si azzerano:
    // uno shortage trascurabile non deve generare quantity_ordered = 0 (CHECK DB)
    // né un errore sporco. Le righe valide procedono normalmente.
    const lineItems = lines
      .map((l) => ({
        ingredientProductId: l.ingredientProductId,
        quantity: Math.round(l.estimatedShortage * 1000) / 1000,
        unitSnapshot: l.unit,
        unitPriceSnapshot: l.currentUnitPrice,
      }))
      .filter((li) => li.quantity > 0);

    if (lineItems.length === 0) continue; // shortage trascurabile dopo arrotondamento

    const order = await repo.insertOrder(
      orgId,
      {
        supplierId,
        orderDate: new Date().toISOString().slice(0, 10),
        expectedDate: '',
        notes: `Bozza generata dal fabbisogno del piano ${lines[0].planDate}.`,
        lineItems,
      } as CreateOrderInput,
      'Generato automaticamente da shortage piano',
    );
    createdOrderIds.push(order.id);
  }

  return { createdOrderIds, skippedIngredients: skipped };
}
