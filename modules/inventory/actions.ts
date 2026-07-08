// =============================================================================
// modules/inventory/actions.ts
// Server Actions per inventory.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { getErrorMessage } from '@/lib/errors';
import { formField, type ActionState } from '@/lib/utils';
import * as service from './service';

// NB: tutti i campi testuali passano da formField (null-safe): un campo
// assente nel form deve arrivare a Zod come undefined, mai come null (BUG-02).

export async function recordMovementAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await service.recordMovement({
      ingredientProductId: formField(formData, 'ingredientProductId'),
      movementType:        formField(formData, 'movementType'),
      quantityDelta:       formField(formData, 'quantityDelta'),
      unit:                formField(formData, 'unit'),
      notes:               formField(formData, 'notes'),
      referenceType:       formField(formData, 'referenceType'),
      referenceId:         formField(formData, 'referenceId'),
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  revalidatePath('/inventory');
  return { status: 'success', message: 'Movimento registrato.' };
}

export async function adjustStockAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const res = await service.adjustStockToCount({
      ingredientProductId: formField(formData, 'ingredientProductId'),
      countedQuantity:     formField(formData, 'countedQuantity'),
      unit:                formField(formData, 'unit'),
    });
    revalidatePath('/inventory');
    revalidatePath('/inventory/movements');
    revalidatePath('/dashboard');
    return {
      status: 'success',
      message: `Stock allineato a ${res.newQuantity} ${res.unit}.`,
    };
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
}

export async function recordInitialStockAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await service.recordInitialStock({
      ingredientProductId: formField(formData, 'ingredientProductId'),
      quantity:            formField(formData, 'quantity'),
      unit:                formField(formData, 'unit'),
      notes:               formField(formData, 'notes'),
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  revalidatePath('/inventory');
  return { status: 'success', message: 'Stock iniziale registrato.' };
}

export async function recordBatchAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await service.recordBatch({
      ingredientProductId: formField(formData, 'ingredientProductId'),
      purchaseOrderId:     formField(formData, 'purchaseOrderId'),
      lotNumber:           formField(formData, 'lotNumber'),
      expiryDate:          formField(formData, 'expiryDate'),
      quantity:            formField(formData, 'quantity'),
      unit:                formField(formData, 'unit'),
      notes:               formField(formData, 'notes'),
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  const orderId = formField(formData, 'purchaseOrderId');
  if (orderId) revalidatePath(`/orders/${orderId}`);
  revalidatePath('/inventory/batches');
  revalidatePath('/dashboard');
  return { status: 'success', message: 'Lotto registrato.' };
}

export async function updateThresholdAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await service.updateThreshold({
      ingredientProductId: formField(formData, 'ingredientProductId'),
      minThreshold:        formField(formData, 'minThreshold'),
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  revalidatePath('/inventory');
  return { status: 'success', message: 'Soglia minima aggiornata.' };
}

/** P0-3 — Invenduto/scarto prodotti finiti (dal blocco rimanenze teoriche). */
export async function recordFinishedGoodsWasteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await service.recordFinishedGoodsWaste({
      recipeId: formField(formData, 'recipeId'),
      quantity: formField(formData, 'quantity'),
      reason:   formField(formData, 'reason'),
      note:     formField(formData, 'note'),
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  revalidatePath('/dashboard');
  revalidatePath('/sales');
  revalidatePath('/analytics');
  return { status: 'success', message: 'Invenduto registrato: rimanenza aggiornata.' };
}
