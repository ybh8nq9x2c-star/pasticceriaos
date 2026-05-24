// =============================================================================
// modules/production/service.ts
// Business logic per production plans.
// =============================================================================

import { requireOrgId } from '@/modules/identity/service';
import { createClient } from '@/lib/supabase/server';
import { AuthError, BusinessRuleError } from '@/lib/errors';
import { todayISODate } from '@/lib/utils';
import * as repo from './repository';
import { insertMovement } from '@/modules/inventory/repository';
import { createPlanSchema, updatePlanSchema } from './schemas';
import type { ProductionPlan, ProductionPlanListItem } from './types';
import type { CreatePlanInput, UpdatePlanInput } from './schemas';

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

  const completedAt =
    input.status === 'completed'
      ? todayISODate()
      : input.status === 'draft' || input.status === 'in_progress'
      ? null
      : existing.completedAt;

  await repo.patchPlan(id, {
    planDate:    input.planDate,
    notes:       input.notes,
    status:      input.status,
    completedAt: completedAt as string | null,
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

  const orgId = await requireOrgId();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthError();

  // Inserisci un inventory_movement production_usage per ogni ingrediente × batch
  for (const item of existing.items) {
    const { data: riRows, error: riError } = await supabase
      .from('recipe_ingredients')
      .select('ingredient_product_id, quantity, unit')
      .eq('recipe_id', item.recipeId);

    if (riError) throw riError;

    for (const ri of riRows ?? []) {
      await insertMovement(orgId, user.id, {
        ingredientProductId: ri.ingredient_product_id,
        movementType:        'production_usage',
        // negativo: DB CHECK richiede quantity_delta < 0 per production_usage
        quantityDelta:       -(ri.quantity * item.batchCount),
        unit:                ri.unit,
        referenceType:       'production_plan',
        referenceId:         id,
      });
    }
  }

  await repo.patchPlan(id, {
    status:      'completed',
    completedAt: new Date().toISOString(),
  });
}

export async function cancelPlan(id: string): Promise<void> {
  const existing = await repo.getPlanById(id);

  if (existing.status === 'completed') {
    throw new BusinessRuleError('Non è possibile cancellare un piano già completato.');
  }

  await repo.patchPlan(id, { status: 'cancelled' });
}
