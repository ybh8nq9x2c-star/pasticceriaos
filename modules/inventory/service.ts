// =============================================================================
// modules/inventory/service.ts
// Business logic per inventory movements e livelli.
// =============================================================================

import { requireOrgId } from '@/modules/identity/service';
import { createClient } from '@/lib/supabase/server';
import { AuthError } from '@/lib/errors';
import * as repo from './repository';
import {
  createMovementSchema,
  updateThresholdSchema,
  initialStockSchema,
  createBatchSchema,
} from './schemas';
import type { InventoryLevel, InventoryMovement, LowStockAlert, IngredientBatch, ExpiringBatch } from './types';
import type { CreateMovementInput, UpdateThresholdInput, InitialStockInput, CreateBatchInput } from './schemas';

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

export async function listLevels(): Promise<InventoryLevel[]> {
  const orgId = await requireOrgId();
  return repo.listInventoryLevels(orgId);
}

export async function getLevelForIngredient(
  ingredientProductId: string,
): Promise<InventoryLevel | null> {
  const orgId = await requireOrgId();
  return repo.getLevelByIngredient(orgId, ingredientProductId);
}

export async function updateThreshold(raw: unknown): Promise<void> {
  const orgId = await requireOrgId();
  const input: UpdateThresholdInput = updateThresholdSchema.parse(raw);
  await repo.upsertThreshold(orgId, input);
}

// ---------------------------------------------------------------------------
// Movements
// ---------------------------------------------------------------------------

export async function listMovements(
  ingredientProductId?: string,
  limit = 100,
): Promise<InventoryMovement[]> {
  const orgId = await requireOrgId();
  return repo.listMovements(orgId, ingredientProductId, limit);
}

// movement_type → quantity_delta sign convention (must match DB CHECK constraints)
const MUST_BE_NEGATIVE: CreateMovementInput['movementType'][] = [
  'production_usage',
  'waste',
  'return_to_supplier',
];
const MUST_BE_POSITIVE: CreateMovementInput['movementType'][] = [
  'purchase_receipt',
  'initial_stock',
];

function normalizeSign(input: CreateMovementInput): CreateMovementInput {
  let delta = input.quantityDelta;
  if (MUST_BE_NEGATIVE.includes(input.movementType)) {
    delta = -Math.abs(delta);
  } else if (MUST_BE_POSITIVE.includes(input.movementType)) {
    delta = Math.abs(delta);
  }
  // Vincolo DB reference_consistency: reference_type e reference_id vanno
  // valorizzati in coppia. Se ne arriva solo uno, azzera entrambi.
  const hasRef = !!input.referenceType && !!input.referenceId;
  return {
    ...input,
    quantityDelta: delta,
    referenceType: hasRef ? input.referenceType : undefined,
    referenceId:   hasRef ? input.referenceId : undefined,
  };
}

export async function recordMovement(raw: unknown): Promise<InventoryMovement> {
  const orgId = await requireOrgId();
  const input: CreateMovementInput = createMovementSchema.parse(raw);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthError();

  return repo.insertMovement(orgId, user.id, normalizeSign(input));
}

/**
 * Carico iniziale di stock per un ingrediente.
 * Shortcut: crea un movimento di tipo 'initial_stock' con delta positivo.
 */
export async function recordInitialStock(raw: unknown): Promise<InventoryMovement> {
  const orgId = await requireOrgId();
  const input: InitialStockInput = initialStockSchema.parse(raw);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthError();

  const movement: CreateMovementInput = {
    ingredientProductId: input.ingredientProductId,
    movementType:        'initial_stock',
    quantityDelta:       input.quantity,
    unit:                input.unit,
    notes:               input.notes || undefined,
  };

  return repo.insertMovement(orgId, user.id, movement);
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export async function getLowStockAlerts(): Promise<LowStockAlert[]> {
  const orgId = await requireOrgId();
  return repo.listLowStockAlerts(orgId);
}

// ---------------------------------------------------------------------------
// Lotti e scadenze
// ---------------------------------------------------------------------------

/**
 * Registra un lotto ricevuto (lotto fornitore + scadenza). NON crea movimenti:
 * lo stock è già stato caricato dalla ricezione ordine; il lotto è il livello
 * di tracciabilità HACCP sopra il ledger.
 */
export async function recordBatch(raw: unknown): Promise<string> {
  const orgId = await requireOrgId();
  const input: CreateBatchInput = createBatchSchema.parse(raw);

  // supplier_id derivato dall'ordine, se presente.
  let supplierId: string | null = null;
  if (input.purchaseOrderId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from('purchase_orders')
      .select('supplier_id')
      .eq('id', input.purchaseOrderId)
      .maybeSingle();
    supplierId = data?.supplier_id ?? null;
  }

  return repo.insertBatch(orgId, {
    ingredientProductId: input.ingredientProductId,
    purchaseOrderId:     input.purchaseOrderId || null,
    supplierId,
    lotNumber:           input.lotNumber || null,
    expiryDate:          input.expiryDate,
    quantity:            input.quantity,
    unit:                input.unit,
    notes:               input.notes || null,
  });
}

export async function getBatchesForOrder(purchaseOrderId: string): Promise<IngredientBatch[]> {
  const orgId = await requireOrgId();
  return repo.listBatchesForOrder(orgId, purchaseOrderId);
}

/** Lotti in scadenza entro N giorni (default 7) con ricette suggerite. */
export async function getExpiringBatches(withinDays = 7): Promise<ExpiringBatch[]> {
  const orgId = await requireOrgId();
  return repo.listExpiringBatches(orgId, withinDays);
}
