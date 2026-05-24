// =============================================================================
// modules/ordering/repository.ts
// Query database per il contesto ordering.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { mapSupabaseError, NotFoundError } from '@/lib/errors';
import type {
  PurchaseOrder,
  PurchaseOrderListItem,
  OrderLineItem,
  OrderStatusEvent,
  OrderStatus,
} from './types';
import type { CreateOrderInput, UpdateOrderInput, LineItemInput } from './schemas';

// ---------------------------------------------------------------------------
// Purchase Orders
// ---------------------------------------------------------------------------

export async function listOrders(orgId: string): Promise<PurchaseOrderListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('*, suppliers(name), order_line_items(id, quantity_ordered, unit_price_snapshot)')
    .eq('organization_id', orgId)
    .order('order_date', { ascending: false });

  if (error) throw mapSupabaseError(error);

  return (data ?? []).map((r) => {
    const items = r.order_line_items ?? [];
    const total = items.every(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (i: any) => i.unit_price_snapshot !== null,
    )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? items.reduce((sum: number, i: any) => sum + i.quantity_ordered * i.unit_price_snapshot, 0)
      : null;

    return {
      id:             r.id,
      supplierId:     r.supplier_id,
      supplierName:   r.suppliers?.name ?? '',
      status:         r.status,
      orderDate:      r.order_date,
      expectedDate:   r.expected_date,
      lineItemsCount: items.length,
      totalAmount:    total,
      sentAt:         r.sent_at,
      createdAt:      r.created_at,
    };
  });
}

export async function getOrderById(id: string): Promise<PurchaseOrder> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      suppliers ( name, email ),
      order_line_items (
        id,
        ingredient_product_id,
        quantity_ordered,
        unit,
        unit_price_snapshot,
        ingredient_products ( name )
      )
    `)
    .eq('id', id)
    .single();

  if (error) throw mapSupabaseError(error);
  if (!data) throw new NotFoundError('Ordine d\'acquisto');
  return toOrder(data);
}

export async function insertOrder(
  orgId: string,
  input: CreateOrderInput,
): Promise<PurchaseOrder> {
  const supabase = await createClient();

  const { data: order, error: orderError } = await supabase
    .from('purchase_orders')
    .insert({
      organization_id: orgId,
      supplier_id:     input.supplierId,
      order_date:      input.orderDate,
      expected_date:   input.expectedDate || null,
      notes:           input.notes || null,
      status:          'draft',
    })
    .select()
    .single();

  if (orderError) throw mapSupabaseError(orderError);

  if (input.lineItems.length > 0) {
    const { error: itemsError } = await supabase
      .from('order_line_items')
      .insert(
        input.lineItems.map((item) => ({
          purchase_order_id:     order.id,
          ingredient_product_id: item.ingredientProductId,
          quantity_ordered:      item.quantity,
          unit:                  item.unitSnapshot,
          unit_price_snapshot:   item.unitPriceSnapshot,
        })),
      );

    if (itemsError) throw mapSupabaseError(itemsError);
  }

  return getOrderById(order.id);
}

export async function patchOrder(
  id: string,
  fields: {
    supplierId?: string;
    orderDate?: string;
    expectedDate?: string | null;
    notes?: string | null;
    status?: OrderStatus;
    emailMessageId?: string | null;
    sentAt?: string | null;
  },
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('purchase_orders')
    .update({
      supplier_id:      fields.supplierId,
      order_date:       fields.orderDate,
      expected_date:    fields.expectedDate,
      notes:            fields.notes,
      status:           fields.status,
      email_message_id: fields.emailMessageId,
      sent_at:          fields.sentAt,
    })
    .eq('id', id);

  if (error) throw mapSupabaseError(error);
}

export async function deleteOrderLineItems(orderId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('order_line_items')
    .delete()
    .eq('purchase_order_id', orderId);
  if (error) throw mapSupabaseError(error);
}

export async function insertOrderLineItems(
  orderId: string,
  items: LineItemInput[],
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('order_line_items')
    .insert(
      items.map((item) => ({
        purchase_order_id:     orderId,
        ingredient_product_id: item.ingredientProductId,
        quantity_ordered:      item.quantity,
        unit:                  item.unitSnapshot,
        unit_price_snapshot:   item.unitPriceSnapshot,
      })),
    );
  if (error) throw mapSupabaseError(error);
}

// ---------------------------------------------------------------------------
// Order Status History (append-only)
// ---------------------------------------------------------------------------

export async function appendStatusHistory(
  orderId: string,
  fromStatus: OrderStatus | null,
  toStatus: OrderStatus,
  changedBy: string,
  notes?: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('order_status_history')
    .insert({
      purchase_order_id: orderId,
      from_status:       fromStatus,
      to_status:         toStatus,
      changed_by:        changedBy,
      notes:             notes || null,
    });
  if (error) throw mapSupabaseError(error);
}

export async function listStatusHistory(orderId: string): Promise<OrderStatusEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('order_status_history')
    .select('*')
    .eq('purchase_order_id', orderId)
    .order('changed_at', { ascending: true });

  if (error) throw mapSupabaseError(error);

  return (data ?? []).map((r) => ({
    id:          r.id,
    orderId:     r.purchase_order_id,
    fromStatus:  r.from_status,
    toStatus:    r.to_status,
    notes:       r.notes,
    changedBy:   r.changed_by,
    createdAt:   r.changed_at,
  }));
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toOrder(row: any): PurchaseOrder {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineItems: OrderLineItem[] = (row.order_line_items ?? []).map((li: any) => {
    const lineTotal =
      li.unit_price_snapshot !== null
        ? li.quantity_ordered * li.unit_price_snapshot
        : null;
    return {
      id:                  li.id,
      orderId:             row.id,
      ingredientProductId: li.ingredient_product_id,
      ingredientName:      li.ingredient_products?.name ?? '',
      quantity:            li.quantity_ordered,
      unitSnapshot:        li.unit,
      unitPriceSnapshot:   li.unit_price_snapshot,
      lineTotal,
    };
  });

  const totalAmount = lineItems.every((li) => li.lineTotal !== null)
    ? lineItems.reduce((sum, li) => sum + (li.lineTotal ?? 0), 0)
    : null;

  return {
    id:             row.id,
    organizationId: row.organization_id,
    supplierId:     row.supplier_id,
    supplierName:   row.suppliers?.name ?? '',
    supplierEmail:  row.suppliers?.email ?? '',
    status:         row.status,
    orderDate:      row.order_date,
    expectedDate:   row.expected_date,
    notes:          row.notes,
    emailMessageId: row.email_message_id,
    sentAt:         row.sent_at,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
    lineItems,
    totalAmount,
  };
}
