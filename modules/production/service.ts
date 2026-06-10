// =============================================================================
// modules/production/service.ts
// Business logic per production plans.
// =============================================================================

import { requireOrgId } from '@/modules/identity/service';
import { createClient } from '@/lib/supabase/server';
import { BusinessRuleError, mapSupabaseError } from '@/lib/errors';
import * as repo from './repository';
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

export async function cancelPlan(id: string): Promise<void> {
  const existing = await repo.getPlanById(id);

  if (existing.status === 'completed') {
    throw new BusinessRuleError('Non è possibile cancellare un piano già completato.');
  }

  await repo.patchPlan(id, { status: 'cancelled' });
}
