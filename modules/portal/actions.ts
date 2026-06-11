// =============================================================================
// modules/portal/actions.ts
// Server Actions del portale fornitore. L'auth è il token verificato, non la
// sessione Supabase. Thin: validazione minima -> service.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { getErrorMessage } from '@/lib/errors';
import type { ActionState } from '@/lib/utils';
import * as service from './service';

export async function portalConfirmOrderAction(
  token: string,
  orderId: string,
): Promise<ActionState> {
  try {
    await service.portalConfirmOrder(token, orderId);
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
  revalidatePath(`/portal/${token}/orders/${orderId}`);
  revalidatePath(`/portal/${token}/orders`);
  return { status: 'success', message: 'Ordine confermato. La pasticceria è stata avvisata.' };
}

export async function portalReportIssueAction(
  token: string,
  orderId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await service.portalReportIssue(token, orderId, String(formData.get('message') ?? ''));
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
  return { status: 'success', message: 'Segnalazione inviata alla pasticceria.' };
}

export async function portalUploadDocumentAction(
  token: string,
  orderId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const rawTotal = String(formData.get('totalAmount') ?? '').trim();
    const docType = formData.get('documentType');
    if (docType !== 'delivery_note' && docType !== 'invoice') {
      return { status: 'error', error: 'Tipo documento non valido.' };
    }
    const documentDate = String(formData.get('documentDate') ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(documentDate)) {
      return { status: 'error', error: 'Data documento non valida.' };
    }
    await service.portalUploadDocument(token, orderId, {
      file: formData.get('file') as File | null,
      documentType: docType,
      documentNumber: String(formData.get('documentNumber') ?? '').trim() || null,
      documentDate,
      totalAmount: rawTotal === '' ? null : parseFloat(rawTotal.replace(',', '.')),
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
  revalidatePath(`/portal/${token}/orders/${orderId}`);
  return { status: 'success', message: 'Documento inviato alla pasticceria.' };
}
