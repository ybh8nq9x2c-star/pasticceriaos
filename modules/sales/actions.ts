// =============================================================================
// modules/sales/actions.ts
// Server Actions per il dominio vendite (deduzione magazzino al momento vendita).
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { getErrorMessage } from '@/lib/errors';
import { formField, type ActionState } from '@/lib/utils';
import * as service from './service';

function revalidateSales() {
  revalidatePath('/sales');
  revalidatePath('/inventory');
  revalidatePath('/inventory/movements');
  revalidatePath('/dashboard');
}

/**
 * Registra una vendita manuale e deduce il magazzino. Le righe arrivano come
 * JSON nel campo nascosto `lines` (il form client gestisce le righe dinamiche).
 */
export async function recordSaleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let lines: unknown;
  try {
    lines = JSON.parse(formField(formData, 'lines') || '[]');
  } catch {
    return { status: 'error', error: 'Righe vendita non valide.' };
  }

  try {
    const summary = await service.ingestSale('manual', {
      externalSaleId: formField(formData, 'externalSaleId'),
      source: 'manual',
      soldAt: formField(formData, 'soldAt'),
      notes: formField(formData, 'notes'),
      lines,
    });

    revalidateSales();

    const msg =
      summary.linesNeedingAttention > 0
        ? `Vendita registrata. ${summary.linesDeducted}/${summary.linesTotal} righe dedotte — ${summary.linesNeedingAttention} da collegare.`
        : `Vendita registrata: magazzino aggiornato (${summary.movementsCreated} movimenti).`;
    return { status: 'success', message: msg };
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
}

/** Storna una vendita (movimenti inversi; la storia non viene modificata). */
export async function reverseSaleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await service.reverseSale({ saleId: formField(formData, 'saleId') });
    revalidateSales();
    return { status: 'success', message: 'Vendita stornata: magazzino ripristinato.' };
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
}

/** Collega un prodotto POS a una ricetta (deduzione automatica delle vendite future). */
export async function linkProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await service.linkProduct({
      source: formField(formData, 'source') || 'manual',
      externalProductRef: formField(formData, 'externalProductRef'),
      recipeId: formField(formData, 'recipeId'),
    });
    revalidateSales();
    return { status: 'success', message: 'Prodotto collegato alla ricetta.' };
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
}
