// =============================================================================
// modules/customers/repository.ts
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { mapSupabaseError, NotFoundError } from '@/lib/errors';
import type { CustomerOrderStatus } from '@/lib/database.types';
import type { CustomerOrder, CustomerOrderListItem } from './types';
import type { CreateCustomerOrderInput } from './schemas';

const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function insertOrder(
  orgId: string,
  userId: string,
  input: CreateCustomerOrderInput,
): Promise<string> {
  const supabase = await createClient();

  const total = input.items.every((i) => i.unitPrice !== null)
    ? input.items.reduce((s, i) => s + i.quantity * (i.unitPrice ?? 0), 0)
    : null;

  const { data, error } = await supabase
    .from('customer_orders')
    .insert({
      organization_id: orgId,
      customer_name:   input.customerName,
      customer_phone:  input.customerPhone || null,
      customer_email:  input.customerEmail || null,
      pickup_date:     input.pickupDate,
      pickup_time:     input.pickupTime || null,
      notes:           input.notes || null,
      total_amount:    total,
      deposit_paid:    input.depositPaid,
      created_by:      userId,
    })
    .select('id')
    .single();
  if (error) throw mapSupabaseError(error);
  const orderId = data.id as string;

  const { error: itemsErr } = await supabase.from('customer_order_items').insert(
    input.items.map((i, idx) => ({
      customer_order_id: orderId,
      recipe_id:         i.recipeId || null,
      description:       i.description,
      quantity:          i.quantity,
      unit_price:        i.unitPrice,
      notes:             i.notes || null,
      sort_order:        idx,
    })),
  );
  if (itemsErr) throw mapSupabaseError(itemsErr);

  return orderId;
}

export async function listOrders(orgId: string, includeClosed = false): Promise<CustomerOrderListItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from('customer_orders')
    .select('id, customer_name, pickup_date, pickup_time, status, total_amount, customer_order_items(quantity)')
    .eq('organization_id', orgId)
    .order('pickup_date')
    .order('pickup_time', { nullsFirst: false });

  if (!includeClosed) query = query.not('status', 'in', '(delivered,cancelled)');

  const { data, error } = await query;
  if (error) throw mapSupabaseError(error);

  return (data ?? []).map((o) => ({
    id:           o.id,
    customerName: o.customer_name,
    pickupDate:   o.pickup_date,
    pickupTime:   o.pickup_time,
    status:       o.status,
    totalAmount:  numOrNull(o.total_amount),
    itemsCount:   (o.customer_order_items ?? []).length,
    piecesCount:  (o.customer_order_items ?? []).reduce((s: number, i: { quantity: number }) => s + i.quantity, 0),
  }));
}

export async function listOrdersForDate(orgId: string, pickupDate: string): Promise<CustomerOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('customer_orders')
    .select('*, customer_order_items(*, recipes(name))')
    .eq('organization_id', orgId)
    .eq('pickup_date', pickupDate)
    .not('status', 'in', '(delivered,cancelled)')
    .order('pickup_time', { nullsFirst: false });
  if (error) throw mapSupabaseError(error);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((o: any) => toOrder(o));
}

export async function getOrderById(id: string): Promise<CustomerOrder> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('customer_orders')
    .select('*, customer_order_items(*, recipes(name))')
    .eq('id', id)
    .single();
  if (error) throw mapSupabaseError(error);
  if (!data) throw new NotFoundError('Ordine cliente');
  return toOrder(data);
}

export async function patchStatus(id: string, status: CustomerOrderStatus): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('customer_orders')
    .update({ status })
    .eq('id', id);
  if (error) throw mapSupabaseError(error);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toOrder(row: any): CustomerOrder {
  return {
    id:            row.id,
    customerName:  row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    pickupDate:    row.pickup_date,
    pickupTime:    row.pickup_time,
    notes:         row.notes,
    status:        row.status,
    totalAmount:   numOrNull(row.total_amount),
    depositPaid:   numOrNull(row.deposit_paid),
    createdAt:     row.created_at,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: (row.customer_order_items ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order).map((i: any) => ({
      id:          i.id,
      recipeId:    i.recipe_id,
      recipeName:  i.recipes?.name ?? null,
      description: i.description,
      quantity:    i.quantity,
      unitPrice:   numOrNull(i.unit_price),
      notes:       i.notes,
    })),
  };
}
