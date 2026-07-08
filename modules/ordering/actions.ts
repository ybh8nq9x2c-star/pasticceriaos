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

/** A1: genera bozze d'ordine reali, una per fornitore, dalle shortage del piano. */
export async function createDraftsFromShortageAction(planId: string): Promise<ActionState> {
  try {
    const result = await service.createDraftOrdersFromShortage(planId);
    revalidatePath('/orders');
    revalidatePath(`/production/${planId}`);

    const created = result.createdOrderIds.length;
    const skipped = result.skippedIngredients.length;

    // BUG-05: zero bozze NON è un successo. Messaggio actionable, mai "✓ 0".
    if (created === 0) {
      return {
        status: 'error',
        error:
          skipped > 0
            ? `Nessuna bozza creata: ${skipped} ingredient${skipped === 1 ? 'e è' : 'i sono'} senza fornitore ` +
              `(${result.skippedIngredients.join(', ')}). Assegna un fornitore dalla scheda di ogni ingrediente e riprova.`
            : 'Nessuna bozza creata: il piano non ha shortage da riordinare.',
      };
    }

    const skippedNote =
      skipped > 0
        ? ` Attenzione: ${skipped} ingredienti senza fornitore esclusi (${result.skippedIngredients.join(', ')}).`
        : '';
    return {
      status: 'success',
      message: `${created} bozz${created === 1 ? 'a' : 'e'} ordine create.${skippedNote}`,
    };
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
}

/** P1-A — bozze per fornitore dalle scorte sotto soglia (dal magazzino). */
export async function createDraftsFromLowStockAction(): Promise<ActionState> {
  try {
    const result = await service.createDraftOrdersFromLowStock();
    revalidatePath('/orders');
    revalidatePath('/inventory');

    const created = result.createdOrderIds.length;
    const skipped = result.skippedIngredients.length;

    if (created === 0) {
      return {
        status: 'error',
        error:
          skipped > 0
            ? `Nessuna bozza creata: ${skipped} ingredient${skipped === 1 ? 'e è' : 'i sono'} senza fornitore ` +
              `(${result.skippedIngredients.join(', ')}). Assegna un fornitore e riprova.`
            : 'Nessuna bozza creata: le scorte sotto soglia sono già coperte.',
      };
    }

    const skippedNote =
      skipped > 0
        ? ` Attenzione: ${skipped} ingredienti senza fornitore esclusi (${result.skippedIngredients.join(', ')}).`
        : '';
    return {
      status: 'success',
      message: `${created} bozz${created === 1 ? 'a' : 'e'} ordine create, una per fornitore.${skippedNote}`,
    };
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
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
