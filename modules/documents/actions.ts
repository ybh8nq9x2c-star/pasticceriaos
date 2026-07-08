// =============================================================================
// modules/documents/actions.ts
// Server Actions thin: FormData -> Zod (nel service) -> revalidate.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getErrorMessage } from '@/lib/errors';
import type { ActionState } from '@/lib/utils';
import * as service from './service';

export async function createDocumentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let documentId: string;
  try {
    const rawLines = formData.get('lines');
    const lines = rawLines ? JSON.parse(rawLines as string) : [];
    const file = formData.get('file');
    documentId = await service.createDocument(
      {
        supplierId:      formData.get('supplierId'),
        purchaseOrderId: formData.get('purchaseOrderId'),
        documentType:    formData.get('documentType'),
        documentNumber:  formData.get('documentNumber'),
        documentDate:    formData.get('documentDate'),
        dueDate:         formData.get('dueDate'),
        totalAmount:     formData.get('totalAmount') as string | null,
        notes:           formData.get('notes'),
        lines,
      },
      file instanceof File ? file : null,
    );
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
  revalidatePath('/documents');
  revalidatePath('/dashboard');
  redirect(`/documents/${documentId}`);
}

export async function runMatchingAction(
  documentId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const purchaseOrderId = (formData.get('purchaseOrderId') as string) || undefined;
    const result = await service.matchDocumentToOrder(documentId, purchaseOrderId);
    revalidatePath(`/documents/${documentId}`);
    revalidatePath('/documents');
    revalidatePath('/dashboard');
    // P1-F: mostra il VALORE prodotto dalla verifica, non solo lo stato.
    const priceNote =
      result.pricesUpdated > 0
        ? ` Prezzi d'acquisto aggiornati per ${result.pricesUpdated} ingredient${result.pricesUpdated === 1 ? 'e' : 'i'}: il food cost ora usa i prezzi veri.`
        : '';
    return {
      status: 'success',
      message:
        result.status === 'matched'
          ? `Documento verificato: nessuna anomalia.${priceNote}`
          : `Verifica eseguita: ${result.anomaliesCount} differenze da controllare.`,
    };
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
}

export async function resolveAnomalyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await service.resolveAnomaly({ anomalyId: formData.get('anomalyId') });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
  revalidatePath('/documents');
  revalidatePath('/dashboard');
  return { status: 'success', message: 'Anomalia risolta.' };
}

export async function archiveDocumentAction(documentId: string): Promise<ActionState> {
  try {
    await service.archiveDocument(documentId);
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
  revalidatePath('/documents');
  return { status: 'success', message: 'Documento archiviato.' };
}

export async function supplierUploadDocumentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await service.supplierUploadDocument({
      marketplaceOrderId: formData.get('marketplaceOrderId'),
      documentType:       formData.get('documentType'),
      documentNumber:     formData.get('documentNumber'),
      documentDate:       formData.get('documentDate'),
      totalAmount:        formData.get('totalAmount') as string | null,
      notes:              formData.get('notes'),
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
  revalidatePath('/supplier/orders');
  return { status: 'success', message: 'Documento inviato al cliente.' };
}
