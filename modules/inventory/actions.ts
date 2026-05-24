// =============================================================================
// modules/inventory/actions.ts
// Server Actions per inventory.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { getErrorMessage } from '@/lib/errors';
import type { ActionState } from '@/lib/utils';
import * as service from './service';

export async function recordMovementAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await service.recordMovement({
      ingredientProductId: formData.get('ingredientProductId'),
      movementType:        formData.get('movementType'),
      quantityDelta:       formData.get('quantityDelta'),
      unit:                formData.get('unit'),
      notes:               formData.get('notes'),
      referenceType:       formData.get('referenceType'),
      referenceId:         formData.get('referenceId'),
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  revalidatePath('/inventory');
  return { status: 'success', message: 'Movimento registrato.' };
}

export async function recordInitialStockAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await service.recordInitialStock({
      ingredientProductId: formData.get('ingredientProductId'),
      quantity:            formData.get('quantity'),
      unit:                formData.get('unit'),
      notes:               formData.get('notes'),
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  revalidatePath('/inventory');
  return { status: 'success', message: 'Stock iniziale registrato.' };
}

export async function updateThresholdAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await service.updateThreshold({
      ingredientProductId: formData.get('ingredientProductId'),
      minThreshold:        formData.get('minThreshold'),
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  revalidatePath('/inventory');
  return { status: 'success', message: 'Soglia minima aggiornata.' };
}
