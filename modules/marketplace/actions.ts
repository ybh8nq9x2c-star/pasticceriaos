// =============================================================================
// modules/marketplace/actions.ts
// Server actions: FormData -> service -> ActionState / redirect.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getErrorMessage } from '@/lib/errors';
import { formField, type ActionState } from '@/lib/utils';
import * as service from './service';

export async function generateKeyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { plaintext } = await service.generateSupplierKey({ label: formData.get('label') });
    revalidatePath('/supplier/keys');
    // plaintext is shown ONCE here; it is never stored or retrievable again.
    return { status: 'success', message: plaintext };
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
}

export async function revokeKeyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await service.revokeSupplierKey({ keyId: formData.get('keyId') });
    revalidatePath('/supplier/keys');
    return { status: 'success', message: 'Chiave revocata.' };
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
}

export async function connectSupplierAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await service.connectSupplier({ key: formData.get('key') });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
  revalidatePath('/marketplace/suppliers');
  return { status: 'success', message: 'Fornitore collegato.' };
}

export async function revokeConnectionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await service.revokeConnection({ connectionId: formData.get('connectionId') });
    revalidatePath('/marketplace/suppliers');
    revalidatePath('/supplier/customers');
    return { status: 'success', message: 'Connessione revocata.' };
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
}

export async function upsertCatalogItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const id = formField(formData, 'id') || undefined;
    // formField: null-safe (campo assente → undefined, mai null). Vedi BUG-01.
    await service.upsertCatalogItem({
      name: formField(formData, 'name'), sku: formField(formData, 'sku'),
      unit: formField(formData, 'unit'), unitPrice: formField(formData, 'unitPrice'),
    }, id);
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
  revalidatePath('/supplier/catalog');
  redirect('/supplier/catalog');
}

export async function deactivateCatalogItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await service.deactivateCatalogItem(formData.get('id') as string);
    revalidatePath('/supplier/catalog');
    return { status: 'success', message: 'Prodotto disattivato.' };
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
}

/** Customer places an order (create draft + submit). `lines` is JSON. */
export async function placeOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let orderId: string;
  try {
    const rawLines = formData.get('lines');
    const lines = rawLines ? JSON.parse(rawLines as string) : [];
    orderId = await service.placeOrder({
      connectionId: formData.get('connectionId'),
      notes: formData.get('notes'),
      idempotencyKey: formData.get('idempotencyKey'),
      lines,
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  // Conversione bozza → ordine condiviso: la bozza PO email d'origine viene
  // ANNULLATA (con nota tracciabile) solo DOPO il place riuscito. Best-effort:
  // se l'annullo fallisce (es. già inviata nel frattempo) l'ordine condiviso
  // resta valido e la bozza resta visibile — mai bloccare il flusso principale.
  const fromDraftId = formData.get('fromDraftId');
  if (typeof fromDraftId === 'string' && fromDraftId) {
    try {
      const { cancelOrder } = await import('@/modules/ordering/service');
      await cancelOrder(fromDraftId, `Convertita in ordine condiviso ${orderId.slice(0, 8)}.`);
      revalidatePath('/orders');
      revalidatePath(`/orders/${fromDraftId}`);
    } catch {
      // la bozza resta: verrà comunque bloccata all'invio (guard fornitore connesso)
    }
  }

  revalidatePath('/marketplace/orders');
  redirect(`/marketplace/orders/${orderId}`);
}

/** Customer registers a delivered marketplace order into inventory (idempotent). */
export async function receiveMarketplaceOrderAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orderId = formData.get('orderId') as string;
  try {
    await service.receiveMarketplaceOrderIntoInventory(orderId);
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
  revalidatePath(`/marketplace/orders/${orderId}`);
  revalidatePath('/inventory');
  revalidatePath('/inventory/movements');
  revalidatePath('/orders');
  revalidatePath('/dashboard');
  return { status: 'success', message: 'Carico registrato a magazzino.' };
}

/** Either side advances the order; the trigger + service enforce who may do what. */
export async function changeOrderStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const orderId = formData.get('orderId') as string;
  try {
    await service.changeOrderStatus({
      orderId, toStatus: formData.get('toStatus'), note: formData.get('note'),
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
  revalidatePath(`/marketplace/orders/${orderId}`);
  revalidatePath(`/supplier/orders/${orderId}`);
  revalidatePath('/supplier');
  revalidatePath('/marketplace/orders');
  return { status: 'success', message: 'Stato aggiornato.' };
}
