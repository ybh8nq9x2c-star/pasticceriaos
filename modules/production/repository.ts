// =============================================================================
// modules/production/repository.ts
// Query database per il contesto production.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { mapSupabaseError, NotFoundError } from '@/lib/errors';
import { toCompletionReport } from './completion-report';
import type { ProductionPlan, ProductionPlanListItem, ProductionPlanItem, PlanStatus, WeekTemplateItem } from './types';
import type { CreatePlanInput, UpdatePlanInput, PlanItemInput, SaveWeekTemplateInput } from './schemas';

// ---------------------------------------------------------------------------
// Production Plans
// ---------------------------------------------------------------------------

export async function listPlans(orgId: string): Promise<ProductionPlanListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('production_plans')
    .select('id, plan_date, status, notes, completed_at, created_at, production_plan_items(id)')
    .eq('organization_id', orgId)
    .order('plan_date', { ascending: false });

  if (error) throw mapSupabaseError(error);

  return (data ?? []).map((r) => ({
    id:          r.id,
    planDate:    r.plan_date,
    status:      r.status,
    notes:       r.notes,
    itemsCount:  Array.isArray(r.production_plan_items) ? r.production_plan_items.length : 0,
    completedAt: r.completed_at,
    createdAt:   r.created_at,
  }));
}

export async function getPlanById(id: string): Promise<ProductionPlan> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('production_plans')
    .select(`
      *,
      production_plan_items (
        id,
        recipe_id,
        batch_count,
        notes,
        sort_order,
        recipes ( name, emoji, base_portions )
      )
    `)
    .eq('id', id)
    .single();

  if (error) throw mapSupabaseError(error);
  if (!data) throw new NotFoundError('Piano di produzione');
  return toPlan(data);
}

/**
 * Piano + righe in UNA transazione (RPC save_production_plan, 063). Nuovo piano
 * se planId è null; altrimenti aggiorna testata e (se items != null) sostituisce
 * le righe in bozza preservando le infornate già postate da produzione rapida.
 */
export async function savePlan(args: {
  planId: string | null;
  planDate: string | null;
  notes: string | null;
  items: CreatePlanInput['items'] | null;
}): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('save_production_plan' as never, {
    p_plan_id: args.planId,
    p_plan_date: args.planDate,
    p_notes: args.notes,
    p_items: args.items
      ? args.items.map((item, idx) => ({
          recipe_id: item.recipeId,
          batch_count: item.batchCount,
          notes: item.notes || null,
          sort_order: item.sortOrder ?? idx,
        }))
      : null,
  } as never);
  if (error) throw mapSupabaseError(error);
  return data as unknown as string;
}

/** Produzione rapida sul piano del giorno (RPC quick_produce, 063). */
export async function quickProduceRpc(recipeId: string, batchCount: number): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('quick_produce' as never, {
    p_recipe_id: recipeId,
    p_batch_count: batchCount,
  } as never);
  if (error) throw mapSupabaseError(error);
}

export async function patchPlan(
  id: string,
  fields: {
    planDate?: string;
    notes?: string | null;
    status?: PlanStatus;
    completedAt?: string | null;
  },
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('production_plans')
    .update({
      plan_date:    fields.planDate,
      notes:        fields.notes,
      status:       fields.status,
      completed_at: fields.completedAt,
    })
    .eq('id', id);

  if (error) throw mapSupabaseError(error);
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPlan(row: any): ProductionPlan {
  return {
    id:             row.id,
    organizationId: row.organization_id,
    planDate:       row.plan_date,
    status:         row.status,
    notes:          row.notes,
    completedAt:    row.completed_at,
    completionReport: toCompletionReport(row.completion_report),
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
    items: (row.production_plan_items ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (item: any): ProductionPlanItem => ({
        id:           item.id,
        planId:       row.id,
        recipeId:     item.recipe_id,
        recipeName:   item.recipes?.name ?? '',
        recipeEmoji:  item.recipes?.emoji ?? null,
        batchCount:   item.batch_count,
        basePortions: item.recipes?.base_portions ?? 0,
        totalPortions: item.batch_count * (item.recipes?.base_portions ?? 0),
        notes:        item.notes,
        sortOrder:    item.sort_order,
      }),
    ).sort((a: ProductionPlanItem, b: ProductionPlanItem) => a.sortOrder - b.sortOrder),
  };
}

// ---------------------------------------------------------------------------
// Settimana tipo (production_template_items)
// ---------------------------------------------------------------------------

/** Righe del template settimanale con nome ricetta (solo ricette ancora attive). */
export async function listTemplateItems(orgId: string): Promise<WeekTemplateItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('production_template_items')
    .select('weekday, recipe_id, batch_count, sort_order, recipes(name, is_active)')
    .eq('organization_id', orgId)
    .order('weekday')
    .order('sort_order');
  if (error) throw mapSupabaseError(error);
  return (data ?? [])
    .map((r) => {
      const row = r as unknown as {
        weekday: number;
        recipe_id: string;
        batch_count: number;
        recipes: { name: string; is_active: boolean } | { name: string; is_active: boolean }[] | null;
      };
      const rec = Array.isArray(row.recipes) ? row.recipes[0] : row.recipes;
      return {
        weekday: row.weekday,
        recipeId: row.recipe_id,
        recipeName: rec?.name ?? '',
        batchCount: Number(row.batch_count),
        isActive: rec?.is_active ?? false,
      };
    })
    .filter((r) => r.isActive); // una ricetta disattivata non deve generare piani
}

/** Sostituisce IN BLOCCO la settimana tipo dell'org (delete + insert). */
export async function replaceTemplateItems(orgId: string, input: SaveWeekTemplateInput): Promise<void> {
  const supabase = await createClient();
  const { error: delErr } = await supabase.from('production_template_items').delete().eq('organization_id', orgId);
  if (delErr) throw mapSupabaseError(delErr);
  if (input.items.length === 0) return;
  // Indice per dare un sort_order stabile per giorno.
  const perDay = new Map<number, number>();
  const rows = input.items.map((it) => {
    const i = perDay.get(it.weekday) ?? 0;
    perDay.set(it.weekday, i + 1);
    return { organization_id: orgId, weekday: it.weekday, recipe_id: it.recipeId, batch_count: it.batchCount, sort_order: i };
  });
  const { error: insErr } = await supabase.from('production_template_items').insert(rows);
  if (insErr) throw mapSupabaseError(insErr);
}

/** Tra le date passate, quali hanno GIÀ un piano (così l'applicatore le salta). */
export async function existingPlanDates(orgId: string, dates: string[]): Promise<Set<string>> {
  if (dates.length === 0) return new Set();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('production_plans')
    .select('plan_date')
    .eq('organization_id', orgId)
    .in('plan_date', dates);
  if (error) throw mapSupabaseError(error);
  return new Set((data ?? []).map((p) => p.plan_date as string));
}
