// =============================================================================
// modules/pos/actions.ts — Server Actions per le mappature POS (settings UI).
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { getErrorMessage } from '@/lib/errors';
import { formField, type ActionState } from '@/lib/utils';
import * as service from './service';

export async function upsertPosMappingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await service.upsertPosMapping({
      source: formField(formData, 'source') || 'pos:mipos',
      posItemId: formField(formData, 'posItemId'),
      posItemName: formField(formData, 'posItemName'),
      recipeId: formField(formData, 'recipeId'),
      portionsPerUnit: formField(formData, 'portionsPerUnit') || '1',
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
  revalidatePath('/settings/pos');
  revalidatePath('/sales');
  return { status: 'success', message: 'Mappatura salvata.' };
}
