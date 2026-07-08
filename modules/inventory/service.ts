// =============================================================================
// modules/inventory/service.ts
// Business logic per inventory movements e livelli.
// =============================================================================

import { requireOrgId, requireSession } from '@/modules/identity/service';
import { createClient } from '@/lib/supabase/server';
import { AuthError, BusinessRuleError } from '@/lib/errors';
import type { UnitOfMeasure } from '@/lib/database.types';
import * as repo from './repository';
import {
  createMovementSchema,
  updateThresholdSchema,
  adjustStockSchema,
  recordFinishedGoodsWasteSchema,
  initialStockSchema,
  createBatchSchema,
} from './schemas';
import type { InventoryLevel, InventoryMovement, LowStockAlert, IngredientBatch, ExpiringBatch } from './types';
import type { CreateMovementInput, UpdateThresholdInput, AdjustStockInput,
  RecordFinishedGoodsWasteInput, InitialStockInput, CreateBatchInput } from './schemas';

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

// Movimenti operativi in uscita soggetti alla guardia "no stock sotto zero".
// manual_adjustment è ESCLUSO di proposito: la rettifica è l'eccezione esplicita
// (atterra sempre a un conteggio reale >= 0, con motivo).
const GUARDED_OUTBOUND: CreateMovementInput['movementType'][] = [
  'production_usage',
  'waste',
  'return_to_supplier',
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
  const normalized = normalizeSign(input);

  // Guardia verità del magazzino: un movimento operativo in uscita non può
  // portare la giacenza sotto zero. La rettifica (manual_adjustment) è esente.
  if (GUARDED_OUTBOUND.includes(normalized.movementType) && normalized.quantityDelta < 0) {
    const level = await repo.getLevelByIngredient(orgId, normalized.ingredientProductId);
    const current = level?.currentQuantity ?? 0;
    if (current + normalized.quantityDelta < 0) {
      throw new BusinessRuleError(
        `Stock insufficiente${level ? ` per ${level.ingredientName}` : ''}: disponibili ${current} ${normalized.unit}, ` +
          `l'operazione ne toglie ${Math.abs(normalized.quantityDelta)}. Registra prima un carico o usa la rettifica del magazzino.`,
      );
    }
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthError();

  return repo.insertMovement(orgId, user.id, normalized);
}

/**
 * P0-3 — Invenduto/scarto PRODOTTI FINITI (fine giornata). Scrive SOLO sul
 * ledger finished_goods_movements ('waste', delta negativo, append-only): le
 * materie prime non c'entrano — quelle si consumano in produzione. La vista
 * teorica (056) sottrae il buttato dalla rimanenza del giorno.
 * Riservata a owner/baker; il viewer è sola lettura.
 */
export async function recordFinishedGoodsWaste(raw: unknown): Promise<void> {
  const session = await requireSession();
  if (session.role === 'viewer') {
    throw new AuthError('Non hai i permessi per registrare l\'invenduto.');
  }
  const input: RecordFinishedGoodsWasteInput = recordFinishedGoodsWasteSchema.parse(raw);

  await repo.insertFinishedGoodsMovement({
    organizationId: session.organizationId,
    recipeId: input.recipeId,
    movementType: 'waste',
    quantityDelta: -input.quantity,
    referenceType: 'manual',
    performedBy: session.userId,
    notes: `${input.reason}${input.note?.trim() ? ` — ${input.note.trim()}` : ''}`,
  });
}

export interface AdjustStockResult {
  previousQuantity: number;
  newQuantity: number;
  delta: number;
  unit: UnitOfMeasure;
}

/**
 * Rettifica al volo: porta lo stock di un ingrediente ESATTAMENTE al conteggio
 * reale. Calcola il delta firmato server-side (su lettura fresca della giacenza)
 * e lo registra come movimento manual_adjustment: il trigger riproietta
 * inventory_levels. Riservata a owner/baker; il viewer è sola lettura.
 */
export async function adjustStockToCount(raw: unknown): Promise<AdjustStockResult> {
  const session = await requireSession();
  if (session.role === 'viewer') {
    throw new AuthError('Non hai i permessi per rettificare il magazzino.');
  }

  const input: AdjustStockInput = adjustStockSchema.parse(raw);

  // Delta calcolato dalla giacenza FRESCA (non da un valore stale del client):
  // così il risultato finale è sempre = conteggio reale, anche con concorrenza.
  const level = await getLevelForIngredient(input.ingredientProductId);
  const previous = level?.currentQuantity ?? 0;
  const unit = level?.unit ?? input.unit;
  const delta = Math.round((input.countedQuantity - previous) * 1000) / 1000;

  if (delta === 0) {
    throw new BusinessRuleError('Lo stock è già allineato al conteggio inserito.');
  }

  await recordMovement({
    ingredientProductId: input.ingredientProductId,
    movementType:        'manual_adjustment',
    quantityDelta:       String(delta),
    unit,
    notes:               `Rettifica inventario: conteggio reale ${input.countedQuantity} ${unit} (prima ${previous} ${unit})`,
  });

  return { previousQuantity: previous, newQuantity: input.countedQuantity, delta, unit };
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
