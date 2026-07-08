// =============================================================================
// modules/pos/actions.ts — Server Actions per le mappature POS (settings UI).
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { getErrorMessage } from '@/lib/errors';
import { formField, type ActionState } from '@/lib/utils';
import * as service from './service';

export async function upsertPosMappingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const source = formField(formData, 'source') || 'pos:mipos';
  const posItemId = formField(formData, 'posItemId');
  try {
    await service.upsertPosMapping({
      source,
      posItemId,
      posItemName: formField(formData, 'posItemName'),
      recipeId: formField(formData, 'recipeId'),
      portionsPerUnit: formField(formData, 'portionsPerUnit') || '1',
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  // P0-D: chiudi il cerchio QUI — gli scontrini passati con questo prodotto si
  // ricollegano da soli (replay idempotente). VERITÀ COMPLETA nel messaggio:
  // cosa è stato recuperato (righe, non "vendite") E cosa resta lavoro umano
  // (gli eventi falliti non vengono MAI toccati dall'automatismo).
  let suffix = '';
  if (posItemId) {
    try {
      const r = await service.relinkEventsForRef(source, posItemId);
      if (r.relinked > 0) {
        suffix = ` ${r.relinked} rig${r.relinked === 1 ? 'a di scontrini passati è stata scalata' : 'he di scontrini passati sono state scalate'} dal banco.`;
      } else if (r.failures > 0) {
        suffix = ' Alcuni scontrini passati non si sono ricollegati: riprovali dall\'inbox.';
      }
      if (r.failedRemaining > 0) {
        suffix += ` Restano ${r.failedRemaining} scontrin${r.failedRemaining === 1 ? 'o fallito' : 'i falliti'} nell'inbox: quelli vanno riprovati a mano.`;
      }
    } catch (err) {
      console.error('[pos] auto-relink post-mapping fallito', err);
      suffix = ' Le vendite passate si ricollegano dall\'inbox con "Riprova".';
    }
  }

  revalidatePath('/sales/pos');
  revalidatePath('/sales');
  revalidatePath('/sales/inbox');
  return { status: 'success', message: `Prodotto collegato.${suffix}` };
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
