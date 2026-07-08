// =============================================================================
// modules/production/actions.ts
// Server Actions per production plans.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getErrorMessage } from '@/lib/errors';
import type { ActionState } from '@/lib/utils';
import { getCustomerOrdersForDate } from '@/modules/customers/service';
import * as service from './service';

// ── Letture on-demand del form piano (P0-1: via le fetch client mute) ─────────
// Contratto ONESTO: o dati, o un errore leggibile — mai [] su failure.

const previewItemsSchema = z
  .array(z.object({ recipeId: z.string().uuid(), batchCount: z.coerce.number().positive() }))
  .max(200);

export type PreviewRequirementsResult =
  | { ok: true; requirements: Awaited<ReturnType<typeof service.computePlanRequirements>> }
  | { ok: false; error: string };

/** Fabbisogno LIVE per un piano non salvato (chiamato debounced dal form). */
export async function previewRequirementsAction(rawItems: unknown): Promise<PreviewRequirementsResult> {
  try {
    const items = previewItemsSchema.parse(rawItems);
    if (items.length === 0) return { ok: true, requirements: [] };
    const requirements = await service.computePlanRequirements(items);
    return { ok: true, requirements };
  } catch (err) {
    return { ok: false, error: getErrorMessage(err) };
  }
}

export interface PlanDateOrder {
  id: string;
  customerName: string;
  pickupTime: string | null;
  items: { recipeId: string | null; recipeName: string | null; description: string; quantity: number }[];
}

export type OrdersForDateResult =
  | { ok: true; orders: PlanDateOrder[] }
  | { ok: false; error: string };

/** Ordini clienti con ritiro nella data scelta (il piano li deve coprire). */
export async function ordersForPlanDateAction(date: string): Promise<OrdersForDateResult> {
  try {
    const parsed = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data non valida').parse(date);
    const orders = await getCustomerOrdersForDate(parsed);
    return {
      ok: true,
      orders: orders.map((o) => ({
        id: o.id,
        customerName: o.customerName,
        pickupTime: o.pickupTime,
        items: o.items.map((i) => ({
          recipeId: i.recipeId,
          recipeName: i.recipeName,
          description: i.description,
          quantity: i.quantity,
        })),
      })),
    };
  } catch (err) {
    return { ok: false, error: getErrorMessage(err) };
  }
}

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
