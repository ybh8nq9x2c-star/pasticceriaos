// =============================================================================
// modules/customers/actions.ts
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getErrorMessage } from '@/lib/errors';
import type { ActionState } from '@/lib/utils';
import * as service from './service';

export async function createCustomerOrderAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const rawItems = formData.get('items');
    const items = rawItems ? JSON.parse(rawItems as string) : [];
    await service.createCustomerOrder({
      customerName:  formData.get('customerName'),
      customerPhone: formData.get('customerPhone'),
      customerEmail: formData.get('customerEmail'),
      pickupDate:    formData.get('pickupDate'),
      pickupTime:    formData.get('pickupTime'),
      notes:         formData.get('notes'),
      depositPaid:   formData.get('depositPaid') as string | null,
      items,
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
  revalidatePath('/customers');
  revalidatePath('/dashboard');
  redirect('/customers');
}

export async function changeCustomerOrderStatusAction(
  orderId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await service.changeCustomerOrderStatus(orderId, { status: formData.get('status') });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
  revalidatePath('/customers');
  revalidatePath('/dashboard');
  return { status: 'success', message: 'Stato aggiornato.' };
}
