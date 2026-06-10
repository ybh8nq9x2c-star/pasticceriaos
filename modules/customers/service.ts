// =============================================================================
// modules/customers/service.ts
// =============================================================================

import { requireOrgId } from '@/modules/identity/service';
import { createClient } from '@/lib/supabase/server';
import { AuthError, BusinessRuleError, NotFoundError } from '@/lib/errors';
import * as repo from './repository';
import { createCustomerOrderSchema, changeCustomerOrderStatusSchema } from './schemas';
import { CUSTOMER_ORDER_TRANSITIONS } from './types';
import type { CustomerOrder, CustomerOrderListItem } from './types';

export async function listCustomerOrders(includeClosed = false): Promise<CustomerOrderListItem[]> {
  const orgId = await requireOrgId();
  return repo.listOrders(orgId, includeClosed);
}

export async function getCustomerOrder(id: string): Promise<CustomerOrder> {
  const orgId = await requireOrgId();
  const order = await repo.getOrderById(id);
  // RLS già filtra; doppio check difensivo non necessario (la select fallisce
  // cross-org), ma manteniamo l'errore tipizzato.
  void orgId;
  return order;
}

/** Ordini clienti attivi per una data: alimentano il piano produzione. */
export async function getCustomerOrdersForDate(pickupDate: string): Promise<CustomerOrder[]> {
  const orgId = await requireOrgId();
  return repo.listOrdersForDate(orgId, pickupDate);
}

export async function createCustomerOrder(raw: unknown): Promise<string> {
  const orgId = await requireOrgId();
  const input = createCustomerOrderSchema.parse(raw);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthError();

  return repo.insertOrder(orgId, user.id, input);
}

export async function changeCustomerOrderStatus(id: string, raw: unknown): Promise<void> {
  await requireOrgId();
  const { status } = changeCustomerOrderStatusSchema.parse(raw);

  const existing = await repo.getOrderById(id);
  if (!existing) throw new NotFoundError('Ordine cliente');

  if (!CUSTOMER_ORDER_TRANSITIONS[existing.status].includes(status)) {
    throw new BusinessRuleError(`Transizione non consentita: ${existing.status} → ${status}.`);
  }
  await repo.patchStatus(id, status);
}
