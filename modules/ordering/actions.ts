// =============================================================================
// modules/ordering/actions.ts
// Server Actions per purchase orders.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { getErrorMessage } from '@/lib/errors';
import type { ActionState } from '@/lib/utils';
import * as service from './service';

export async function createOrderAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const rawItems = formData.get('lineItems');
    const lineItems = rawItems ? JSON.parse(rawItems as string) : [];

    await service.createOrder({
      supplierId:   formData.get('supplierId'),
      orderDate:    formData.get('orderDate'),
      expectedDate: formData.get('expectedDate'),
      notes:        formData.get('notes'),
      lineItems,
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  revalidatePath('/orders');
  return { status: 'success', message: 'Ordine creato.' };
}

export async function updateOrderAction(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const rawItems = formData.get('lineItems');
    const lineItems = rawItems ? JSON.parse(rawItems as string) : undefined;

    await service.updateOrder(id, {
      supplierId:   formData.get('supplierId'),
      orderDate:    formData.get('orderDate'),
      expectedDate: formData.get('expectedDate'),
      notes:        formData.get('notes'),
      ...(lineItems !== undefined ? { lineItems } : {}),
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  revalidatePath('/orders');
  revalidatePath(`/orders/${id}`);
  return { status: 'success', message: 'Ordine aggiornato.' };
}

export async function changeOrderStatusAction(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await service.changeOrderStatus(id, {
      status: formData.get('status'),
      notes:  formData.get('notes') ?? undefined,
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  revalidatePath('/orders');
  revalidatePath(`/orders/${id}`);
  return { status: 'success', message: 'Stato ordine aggiornato.' };
}

export async function cancelOrderAction(
  id: string,
  notes?: string,
): Promise<ActionState> {
  try {
    await service.cancelOrder(id, notes);
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  revalidatePath('/orders');
  revalidatePath(`/orders/${id}`);
  return { status: 'success', message: 'Ordine cancellato.' };
}
