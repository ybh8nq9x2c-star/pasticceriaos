// =============================================================================
// modules/ordering/service.ts
// Business logic per purchase orders.
// =============================================================================

import { requireOrgId } from '@/modules/identity/service';
import { createClient } from '@/lib/supabase/server';
import { AuthError, BusinessRuleError, mapSupabaseError } from '@/lib/errors';
import { todayISODate } from '@/lib/utils';
import * as repo from './repository';
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
  return repo.insertOrder(orgId, input);
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
  if (input.status === 'sent') {
    patchFields.sentAt = new Date().toISOString();
  }

  await repo.patchOrder(id, patchFields);
  await repo.appendStatusHistory(
    id,
    existing.status,
    input.status,
    user.id,
    input.notes,
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
