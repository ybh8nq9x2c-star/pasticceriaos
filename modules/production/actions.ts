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

// ── Settimana tipo ───────────────────────────────────────────────────────────

export async function saveWeekTemplateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const raw = formData.get('items');
    const items = raw ? JSON.parse(raw as string) : [];
    await service.saveWeekTemplate({ items });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
  revalidatePath('/production/template');
  return { status: 'success', message: 'Settimana tipo salvata.' };
}

export async function applyWeekTemplateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    // "Applica" salva prima le modifiche correnti (se presenti), poi applica:
    // un'unica azione per il pasticcere (niente "ho salvato?" intermedio).
    const raw = formData.get('items');
    if (raw) await service.saveWeekTemplate({ items: JSON.parse(raw as string) });
    const res = await service.applyWeekTemplate();
    revalidatePath('/production');
    revalidatePath('/dashboard');
    const c = res.created.length;
    const s = res.skipped.length;
    if (c === 0) {
      return { status: 'success', message: s > 0 ? `Tutti i giorni avevano già un piano: niente da creare.` : 'Nessun giorno da pianificare.' };
    }
    return {
      status: 'success',
      message: `Creati ${c} pian${c === 1 ? 'o' : 'i'}${s > 0 ? `, ${s} gi${s === 1 ? 'orno' : 'orni'} già pianificat${s === 1 ? 'o' : 'i'} (saltati).` : '.'}`,
    };
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
}
