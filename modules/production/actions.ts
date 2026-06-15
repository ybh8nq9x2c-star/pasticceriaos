// =============================================================================
// modules/production/actions.ts
// Server Actions per production plans.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { getErrorMessage } from '@/lib/errors';
import type { ActionState } from '@/lib/utils';
import * as service from './service';

export async function createPlanAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const rawItems = formData.get('items');
    const items = rawItems ? JSON.parse(rawItems as string) : [];

    await service.createPlan({
      planDate: formData.get('planDate'),
      notes:    formData.get('notes'),
      items,
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  revalidatePath('/production');
  return { status: 'success', message: 'Piano di produzione creato.' };
}

export async function updatePlanAction(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const rawItems = formData.get('items');
    const items = rawItems ? JSON.parse(rawItems as string) : undefined;

    await service.updatePlan(id, {
      planDate: formData.get('planDate'),
      notes:    formData.get('notes'),
      status:   formData.get('status'),
      ...(items !== undefined ? { items } : {}),
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  revalidatePath('/production');
  revalidatePath(`/production/${id}`);
  return { status: 'success', message: 'Piano aggiornato.' };
}

export async function quickProduceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await service.quickProduce({
      recipeId:   formData.get('recipeId'),
      batchCount: formData.get('batchCount'),
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  revalidatePath('/inventory');
  revalidatePath('/inventory/movements');
  revalidatePath('/dashboard');
  return { status: 'success', message: 'Scarico registrato: magazzino aggiornato.' };
}

export async function completePlanAction(id: string): Promise<ActionState> {
  try {
    await service.completePlan(id);
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  revalidatePath('/production');
  revalidatePath(`/production/${id}`);
  return { status: 'success', message: 'Piano completato.' };
}

export async function cancelPlanAction(id: string): Promise<ActionState> {
  try {
    await service.cancelPlan(id);
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  revalidatePath('/production');
  revalidatePath(`/production/${id}`);
  return { status: 'success', message: 'Piano cancellato.' };
}
