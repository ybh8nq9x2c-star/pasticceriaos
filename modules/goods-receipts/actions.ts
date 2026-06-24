// =============================================================================
// modules/goods-receipts/actions.ts
// Server Actions thin: FormData (null-safe via formField) → service → revalidate.
// Le stesse action servono entrambe le UI (bakery e supplier): i path da
// rinfrescare/redirigere dipendono dal mode del receipt.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getErrorMessage } from '@/lib/errors';
import { formField, type ActionState } from '@/lib/utils';
import * as service from './service';
import type { ReceiptMode } from './types';

function basePath(mode: ReceiptMode): string {
  return mode === 'supplier' ? '/supplier/receipts' : '/receipts';
}

function revalidateReceipt(mode: ReceiptMode, receiptId?: string): void {
  const base = basePath(mode);
  revalidatePath(base);
  if (receiptId) revalidatePath(`${base}/${receiptId}`);
  // il completamento muove lo stock: rinfresca le superfici magazzino
  revalidatePath('/inventory');
  revalidatePath('/inventory/movements');
  revalidatePath('/inventory/batches');
  revalidatePath('/dashboard');
  revalidatePath('/orders');
}

export async function createReceiptAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const mode = (formField(formData, 'mode') === 'supplier' ? 'supplier' : 'bakery') as ReceiptMode;
  let receiptId: string;
  try {
    receiptId = await service.createReceipt({
      mode,
      supplierId: formField(formData, 'supplierId'),
      purchaseOrderId: formField(formData, 'purchaseOrderId'),
      ddtNumber: formField(formData, 'ddtNumber'),
      ddtDate: formField(formData, 'ddtDate'),
      notes: formField(formData, 'notes'),
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
  revalidateReceipt(mode, receiptId);
  redirect(`${basePath(mode)}/${receiptId}`);
}

export async function importDdtAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const mode = (formField(formData, 'mode') === 'supplier' ? 'supplier' : 'bakery') as ReceiptMode;
  const file = formData.get('file');
  let receiptId: string;
  let summary: string;
  try {
    if (!(file instanceof File) || file.size === 0) {
      return { status: 'error', error: 'Seleziona il PDF del DDT da importare.' };
    }
    const result = await service.importDdt(
      { mode, supplierId: formField(formData, 'supplierId') },
      file,
    );
    receiptId = result.receiptId;
    summary = `${result.parsed.lines.length} righe lette · ${result.matchedCount} riconosciute automaticamente`;
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
  revalidateReceipt(mode, receiptId);
  redirect(`${basePath(mode)}/${receiptId}?imported=${encodeURIComponent(summary)}`);
}

export async function registerScanAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState & { outcome?: service.ScanOutcome }> {
  const mode = (formField(formData, 'mode') === 'supplier' ? 'supplier' : 'bakery') as ReceiptMode;
  try {
    const outcome = await service.registerScan({
      receiptId: formField(formData, 'receiptId'),
      code: formField(formData, 'code'),
      qty: formField(formData, 'qty') || '1',
      lotNumber: formField(formData, 'lotNumber'),
      expiryDate: formField(formData, 'expiryDate'),
      gs1Raw: formField(formData, 'gs1Raw'),
    });
    revalidateReceipt(mode, formField(formData, 'receiptId'));
    return {
      status: 'success',
      message:
        outcome.status === 'matched'
          ? `Registrato: ${outcome.productName}`
          : 'Codice non riconosciuto: associa il prodotto dalla riga creata.',
      outcome,
    };
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
}

export async function addManualLineAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const mode = (formField(formData, 'mode') === 'supplier' ? 'supplier' : 'bakery') as ReceiptMode;
  try {
    await service.addManualLine({
      receiptId: formField(formData, 'receiptId'),
      productId: formField(formData, 'productId'),
      rawProductName: formField(formData, 'rawProductName'),
      barcode: formField(formData, 'barcode'),
      sku: formField(formData, 'sku'),
      qtyExpected: formField(formData, 'qtyExpected'),
      qtyReceived: formField(formData, 'qtyReceived') || '0',
      unit: formField(formData, 'unit'),
      lotNumber: formField(formData, 'lotNumber'),
      expiryDate: formField(formData, 'expiryDate'),
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
  revalidateReceipt(mode, formField(formData, 'receiptId'));
  return { status: 'success', message: 'Riga aggiunta.' };
}

export async function updateLineAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const mode = (formField(formData, 'mode') === 'supplier' ? 'supplier' : 'bakery') as ReceiptMode;
  try {
    await service.updateLine({
      lineId: formField(formData, 'lineId'),
      qtyReceived: formField(formData, 'qtyReceived'),
      lotNumber: formField(formData, 'lotNumber'),
      expiryDate: formField(formData, 'expiryDate'),
      discrepancyReason: formField(formData, 'discrepancyReason'),
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
  revalidateReceipt(mode, formField(formData, 'receiptId'));
  return { status: 'success', message: 'Riga aggiornata.' };
}

export async function resolveLineProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const mode = (formField(formData, 'mode') === 'supplier' ? 'supplier' : 'bakery') as ReceiptMode;
  try {
    await service.resolveLineProduct({
      lineId: formField(formData, 'lineId'),
      productId: formField(formData, 'productId'),
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
  revalidateReceipt(mode, formField(formData, 'receiptId'));
  return { status: 'success', message: 'Prodotto associato.' };
}

export async function createProductFromLineAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const mode = (formField(formData, 'mode') === 'supplier' ? 'supplier' : 'bakery') as ReceiptMode;
  try {
    await service.createProductFromLine({
      lineId: formField(formData, 'lineId'),
      name: formField(formData, 'name'),
      unit: formField(formData, 'unit'),
      barcode: formField(formData, 'barcode'),
      sku: formField(formData, 'sku'),
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
  revalidateReceipt(mode, formField(formData, 'receiptId'));
  return { status: 'success', message: 'Prodotto creato e associato.' };
}

export async function completeReceiptAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const mode = (formField(formData, 'mode') === 'supplier' ? 'supplier' : 'bakery') as ReceiptMode;
  const receiptId = formField(formData, 'receiptId') ?? '';
  try {
    const status = await service.completeReceipt(receiptId);
    revalidateReceipt(mode, receiptId);
    return {
      status: 'success',
      message:
        status === 'completed'
          ? 'Ricevimento completato: magazzino aggiornato.'
          : status === 'partial'
            ? 'Carico parziale registrato: restano righe da ricevere.'
            : 'Carico registrato con discrepanze: rivedi le righe segnalate.',
    };
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
}

/** "Ricevuto tutto" 1-tap: riempie ricevuto=atteso sulle righe matchate e completa. */
export async function receiveAllAndCompleteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const mode = (formField(formData, 'mode') === 'supplier' ? 'supplier' : 'bakery') as ReceiptMode;
  const receiptId = formField(formData, 'receiptId') ?? '';
  try {
    const status = await service.receiveAllAndComplete(receiptId);
    revalidateReceipt(mode, receiptId);
    return {
      status: 'success',
      message:
        status === 'completed'
          ? 'Ricevuto tutto: magazzino aggiornato.'
          : 'Carico registrato: alcune righe restano da associare a un prodotto.',
    };
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
}

export async function cancelReceiptAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const mode = (formField(formData, 'mode') === 'supplier' ? 'supplier' : 'bakery') as ReceiptMode;
  const receiptId = formField(formData, 'receiptId') ?? '';
  try {
    await service.cancelReceipt(receiptId);
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
  revalidateReceipt(mode, receiptId);
  redirect(basePath(mode));
}
