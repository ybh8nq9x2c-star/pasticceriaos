// =============================================================================
// modules/production/service.ts
// Business logic per production plans.
// =============================================================================

import { requireOrgId } from '@/modules/identity/service';
import { createClient } from '@/lib/supabase/server';
import { BusinessRuleError, mapSupabaseError } from '@/lib/errors';
import { todayISODate } from '@/lib/utils';
import type { UnitOfMeasure } from '@/lib/database.types';
import * as repo from './repository';
import { aggregateLiveRequirements, type RecipeBomForReq, type LiveRequirement } from './requirements';
import { createPlanSchema, quickProduceSchema, updatePlanSchema } from './schemas';
import type { ProductionPlan, ProductionPlanListItem } from './types';
import type { CreatePlanInput, QuickProduceInput, UpdatePlanInput } from './schemas';

export type { LiveRequirement };

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listPlans(): Promise<ProductionPlanListItem[]> {
  const orgId = await requireOrgId();
  return repo.listPlans(orgId);
}

export async function getPlan(id: string): Promise<ProductionPlan> {
  return repo.getPlanById(id);
}

// ---------------------------------------------------------------------------
// Fabbisogno LIVE (per il piano NON ancora salvato) — Task 1 "produzione live".
// La matematica è in ./requirements (PURA, testata); qui solo l'I/O. Calcolato
// per item EFFIMERI, così la UI mostra il fabbisogno mentre l'utente compone il
// piano, senza step "calcola" intermedio.
// ---------------------------------------------------------------------------

export async function computePlanRequirements(
  items: { recipeId: string; batchCount: number }[],
): Promise<LiveRequirement[]> {
  const orgId = await requireOrgId();

  // Aggrega i batch per ricetta (l'utente può avere righe duplicate).
  const batchByRecipe = new Map<string, number>();
  for (const it of items) {
    if (!it.recipeId || !(it.batchCount > 0)) continue;
    batchByRecipe.set(it.recipeId, (batchByRecipe.get(it.recipeId) ?? 0) + it.batchCount);
  }
  const recipeIds = [...batchByRecipe.keys()];
  if (recipeIds.length === 0) return [];

  const supabase = await createClient();

  const { data: recs, error } = await supabase
    .from('recipes')
    .select('id, recipe_ingredients(quantity, unit, ingredient_products(id, name, unit))')
    .eq('organization_id', orgId)
    .in('id', recipeIds);
  if (error) throw mapSupabaseError(error);

  const recipes: RecipeBomForReq[] = (recs ?? []).map((r) => {
    const rec = r as unknown as {
      id: string;
      recipe_ingredients: {
        quantity: number;
        unit: UnitOfMeasure;
        ingredient_products: { id: string; name: string; unit: UnitOfMeasure } | null;
      }[];
    };
    return {
      id: rec.id,
      ingredients: (rec.recipe_ingredients ?? []).map((ri) => ({
        quantity: Number(ri.quantity),
        unit: ri.unit,
        product: ri.ingredient_products,
      })),
    };
  });

  const productIds = recipes.flatMap((r) => r.ingredients.map((i) => i.product?.id).filter((x): x is string => !!x));
  if (productIds.length === 0) return [];

  const { data: levels, error: lvlErr } = await supabase
    .from('inventory_levels')
    .select('ingredient_product_id, current_quantity')
    .eq('organization_id', orgId)
    .in('ingredient_product_id', [...new Set(productIds)]);
  if (lvlErr) throw mapSupabaseError(lvlErr);
  const stockById = new Map((levels ?? []).map((l) => [l.ingredient_product_id as string, Number(l.current_quantity)]));

  return aggregateLiveRequirements(recipes, batchByRecipe, stockById);
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createPlan(raw: unknown): Promise<ProductionPlan> {
  const orgId = await requireOrgId();
  const input: CreatePlanInput = createPlanSchema.parse(raw);
  return repo.insertPlan(orgId, input);
}

export async function updatePlan(id: string, raw: unknown): Promise<ProductionPlan> {
  const input: UpdatePlanInput = updatePlanSchema.parse(raw);

  // Recupera piano corrente per validazioni stato
  const existing = await repo.getPlanById(id);

  // Regola: non si può modificare un piano completato o cancellato
  if (existing.status === 'completed' || existing.status === 'cancelled') {
    throw new BusinessRuleError(
      `Non è possibile modificare un piano in stato '${existing.status}'.`,
    );
  }

  // INVARIANTE CONTABILE: il completamento passa SOLO da completePlan() (RPC
  // transazionale che scarica il magazzino). Un PATCH a 'completed' qui
  // marcherebbe il piano completo SENZA movimenti production_usage.
  if (input.status === 'completed') {
    throw new BusinessRuleError(
      'Usa l\'azione "Segna come completato": il completamento registra anche i consumi a magazzino.',
    );
  }

  await repo.patchPlan(id, {
    planDate:    input.planDate,
    notes:       input.notes,
    status:      input.status,
    completedAt: null,
  });

  if (input.items && input.items.length > 0) {
    // Items allowed only on draft plans
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(
        'Gli ingredienti possono essere modificati solo su piani in bozza.',
      );
    }
    await repo.deletePlanItems(id);
    await repo.insertPlanItems(id, input.items);
  }

  return repo.getPlanById(id);
}

export async function completePlan(id: string): Promise<void> {
  const existing = await repo.getPlanById(id);

  if (existing.status === 'completed') {
    throw new BusinessRuleError('Il piano è già completato.');
  }
  if (existing.status === 'cancelled') {
    throw new BusinessRuleError('Non è possibile completare un piano cancellato.');
  }

  // Chiusura piano = write-path TRANSAZIONALE (RPC 019): inserisce i movimenti
  // production_usage (negativi) per ogni ingrediente × batch e poi marca il piano
  // 'completed', atomicamente. Niente scarico parziale né doppio scarico al retry.
  const supabase = await createClient();
  const { error } = await supabase.rpc('complete_production_plan', { p_plan_id: id });
  if (error) throw mapSupabaseError(error);
}

/**
 * Scarico produzione RAPIDO: "ho prodotto N infornate di questa ricetta".
 * Si appoggia al path CANONICO (piano di una ricetta → completamento
 * transazionale): inserisce i movimenti production_usage e consuma i lotti FEFO,
 * esattamente come un piano normale. NESSUN secondo write-path di scarico stock.
 * Se il completamento fallisce, il piano-bozza viene annullato (niente bozze orfane).
 */
export async function quickProduce(raw: unknown): Promise<void> {
  const input: QuickProduceInput = quickProduceSchema.parse(raw);

  const plan = await createPlan({
    planDate: todayISODate(),
    notes: 'Scarico produzione rapido',
    items: [{ recipeId: input.recipeId, batchCount: input.batchCount, sortOrder: 0 }],
  });

  try {
    await completePlan(plan.id);
  } catch (err) {
    try {
      await cancelPlan(plan.id);
    } catch {
      // best-effort: il piano resta in bozza, nessuno scarico è avvenuto.
    }
    throw err;
  }
}

export async function cancelPlan(id: string): Promise<void> {
  const existing = await repo.getPlanById(id);

  if (existing.status === 'completed') {
    throw new BusinessRuleError('Non è possibile cancellare un piano già completato.');
  }

  await repo.patchPlan(id, { status: 'cancelled' });
}
