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
  revalidatePath('/sales/pos');
  revalidatePath('/sales');
  return { status: 'success', message: 'Mappatura salvata.' };
}

/** Salva la config POS (store/merchant) dal wizard /sales/pos. */
export async function savePosConfigAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await service.savePosConfig({
      provider: formField(formData, 'provider') || 'mipos',
      storeId: formField(formData, 'storeId'),
      merchantCode: formField(formData, 'merchantCode'),
      isActive: formData.get('isActive') !== 'false',
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
  revalidatePath('/sales/pos');
  revalidatePath('/sales');
  return { status: 'success', message: 'Configurazione salvata: la cassa ora risolve la tua organizzazione.' };
}

/** Replay di un evento POS (failed → riesegui; processed+unlinked → relink). */
export async function replayPosEventAction(eventId: string): Promise<ActionState> {
  try {
    const res = await service.replayPosEvent(eventId);
    revalidatePath('/sales/inbox');
    revalidatePath('/sales');
    revalidatePath('/inventory');
    if (res.status === 'nothing_to_do') {
      return {
        status: 'error',
        error: res.stillUnlinked?.length
          ? `Nessuna riga ricollegabile: ${res.stillUnlinked.length} prodott${res.stillUnlinked.length === 1 ? 'o' : 'i'} ancora senza mappatura.`
          : 'Niente da rielaborare per questo evento.',
      };
    }
    return {
      status: 'success',
      message:
        res.status === 'relinked'
          ? `${res.relinkedCount} rig${res.relinkedCount === 1 ? 'a ricollegata' : 'he ricollegate'}: prodotti finiti scalati.`
          : 'Evento rielaborato.',
    };
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
}
