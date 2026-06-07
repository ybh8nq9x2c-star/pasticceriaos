// =============================================================================
// modules/production/repository.ts
// Query database per il contesto production.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { mapSupabaseError, NotFoundError } from '@/lib/errors';
import type { ProductionPlan, ProductionPlanListItem, ProductionPlanItem, PlanStatus } from './types';
import type { CreatePlanInput, UpdatePlanInput, PlanItemInput } from './schemas';

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

export async function insertPlan(
  orgId: string,
  input: CreatePlanInput,
): Promise<ProductionPlan> {
  const supabase = await createClient();

  const { data: plan, error: planError } = await supabase
    .from('production_plans')
    .insert({
      organization_id: orgId,
      plan_date:       input.planDate,
      notes:           input.notes || null,
      status:          'draft',
    })
    .select()
    .single();

  if (planError) throw mapSupabaseError(planError);

  if (input.items.length > 0) {
    const { error: itemsError } = await supabase
      .from('production_plan_items')
      .insert(
        input.items.map((item, idx) => ({
          production_plan_id:    plan.id,
          recipe_id:  item.recipeId,
          batch_count: item.batchCount,
          notes:      item.notes || null,
          sort_order: item.sortOrder ?? idx,
        })),
      );

    if (itemsError) throw mapSupabaseError(itemsError);
  }

  return getPlanById(plan.id);
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

export async function deletePlanItems(planId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('production_plan_items')
    .delete()
    .eq('production_plan_id', planId);
  if (error) throw mapSupabaseError(error);
}

export async function insertPlanItems(
  planId: string,
  items: PlanItemInput[],
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('production_plan_items')
    .insert(
      items.map((item, idx) => ({
        production_plan_id:    planId,
        recipe_id:  item.recipeId,
        batch_count: item.batchCount,
        notes:      item.notes || null,
        sort_order: item.sortOrder ?? idx,
      })),
    );
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
