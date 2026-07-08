// =============================================================================
// modules/inventory/repository.ts
// Query database per il contesto inventory.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { mapSupabaseError, NotFoundError } from '@/lib/errors';
import type { InventoryLevel, InventoryMovement, LowStockAlert, IngredientBatch, ExpiringBatch } from './types';
import type { CreateMovementInput, UpdateThresholdInput } from './schemas';

// ---------------------------------------------------------------------------
// Inventory Levels
// ---------------------------------------------------------------------------

export async function listInventoryLevels(orgId: string): Promise<InventoryLevel[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('inventory_levels')
    .select('*, ingredient_products(name, unit)')
    .eq('organization_id', orgId)
    .order('ingredient_products(name)');

  if (error) throw mapSupabaseError(error);
  return (data ?? []).map(toLevel);
}

export async function getLevelByIngredient(
  orgId: string,
  ingredientProductId: string,
): Promise<InventoryLevel | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('inventory_levels')
    .select('*, ingredient_products(name, unit)')
    .eq('organization_id', orgId)
    .eq('ingredient_product_id', ingredientProductId)
    .single();

  if (error && error.code !== 'PGRST116') throw mapSupabaseError(error);
  if (!data) return null;
  return toLevel(data);
}

export async function upsertThreshold(
  orgId: string,
  input: UpdateThresholdInput,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('inventory_levels')
    .update({ min_threshold: input.minThreshold })
    .eq('organization_id', orgId)
    .eq('ingredient_product_id', input.ingredientProductId);

  if (error) throw mapSupabaseError(error);
}

// ---------------------------------------------------------------------------
// Inventory Movements (append-only)
// ---------------------------------------------------------------------------

export async function listMovements(
  orgId: string,
  ingredientProductId?: string,
  limit = 100,
): Promise<InventoryMovement[]> {
  const supabase = await createClient();
  let query = supabase
    .from('inventory_movements')
    .select('*, ingredient_products(name)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (ingredientProductId) {
    query = query.eq('ingredient_product_id', ingredientProductId);
  }

  const { data, error } = await query;
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map(toMovement);
}

export async function insertMovement(
  orgId: string,
  userId: string,
  input: CreateMovementInput,
): Promise<InventoryMovement> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('inventory_movements')
    .insert({
      organization_id:       orgId,
      ingredient_product_id: input.ingredientProductId,
      movement_type:         input.movementType,
      quantity_delta:        input.quantityDelta,
      unit:                  input.unit,
      notes:                 input.notes || null,
      reference_type:        input.referenceType || null,
      reference_id:          input.referenceId || null,
      performed_by:          userId,
    })
    .select('*, ingredient_products(name)')
    .single();

  if (error) throw mapSupabaseError(error);
  return toMovement(data);
}

// ---------------------------------------------------------------------------
// Lotti ingredienti (HACCP-lite)
// ---------------------------------------------------------------------------

export async function insertBatch(
  orgId: string,
  input: {
    ingredientProductId: string;
    purchaseOrderId: string | null;
    supplierId: string | null;
    lotNumber: string | null;
    expiryDate: string;
    quantity: number;
    unit: string;
    notes: string | null;
  },
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ingredient_batches')
    .insert({
      organization_id:       orgId,
      ingredient_product_id: input.ingredientProductId,
      purchase_order_id:     input.purchaseOrderId,
      supplier_id:           input.supplierId,
      lot_number:            input.lotNumber,
      expiry_date:           input.expiryDate,
      quantity_received:     input.quantity,
      quantity_remaining:    input.quantity,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      unit:                  input.unit as any,
      notes:                 input.notes,
    })
    .select('id')
    .single();
  if (error) throw mapSupabaseError(error);
  return data.id as string;
}

export async function listBatchesForOrder(orgId: string, purchaseOrderId: string): Promise<IngredientBatch[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ingredient_batches')
    .select('*, ingredient_products(name)')
    .eq('organization_id', orgId)
    .eq('purchase_order_id', purchaseOrderId)
    .order('created_at');
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map(toBatch);
}

export async function listExpiringBatches(orgId: string, withinDays: number): Promise<ExpiringBatch[]> {
  const supabase = await createClient();
  const limitDate = new Date();
  limitDate.setDate(limitDate.getDate() + withinDays);
  const limitIso = limitDate.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('v_expiring_batches')
    .select('*')
    .eq('organization_id', orgId)
    .lte('expiry_date', limitIso)
    .order('expiry_date');
  if (error) throw mapSupabaseError(error);

  return (data ?? []).map((r) => ({
    batchId:             r.batch_id,
    ingredientProductId: r.ingredient_product_id,
    ingredientName:      r.ingredient_name,
    lotNumber:           r.lot_number,
    expiryDate:          r.expiry_date,
    quantityRemaining:   Number(r.quantity_remaining),
    unit:                r.unit,
    daysToExpiry:        Number(r.days_to_expiry),
    supplierName:        r.supplier_name,
    suggestedRecipes:    r.suggested_recipes ?? [],
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toBatch(row: any): IngredientBatch {
  return {
    id:                  row.id,
    ingredientProductId: row.ingredient_product_id,
    ingredientName:      row.ingredient_products?.name ?? '',
    purchaseOrderId:     row.purchase_order_id,
    lotNumber:           row.lot_number,
    expiryDate:          row.expiry_date,
    quantityReceived:    Number(row.quantity_received),
    quantityRemaining:   Number(row.quantity_remaining),
    unit:                row.unit,
    receivedAt:          row.received_at,
    notes:               row.notes,
  };
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export async function listLowStockAlerts(orgId: string): Promise<LowStockAlert[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_low_stock_alerts')
    .select('*')
    .eq('organization_id', orgId);

  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((r) => ({
    ingredientProductId: r.ingredient_product_id,
    ingredientName:      r.ingredient_name,
    supplierName:        r.supplier_name ?? null,
    currentQuantity:     r.current_quantity,
    minThreshold:        r.min_threshold,
    unit:                r.unit,
    alertLevel:          r.alert_level,
  }));
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toLevel(row: any): InventoryLevel {
  return {
    id:                  row.id,
    organizationId:      row.organization_id,
    ingredientProductId: row.ingredient_product_id,
    ingredientName:      row.ingredient_products?.name ?? '',
    unit:                row.ingredient_products?.unit ?? row.unit,
    currentQuantity:     row.current_quantity,
    minThreshold:        row.min_threshold,
    updatedAt:           row.last_updated_at,
  };
}

/**
 * Movimento sul ledger PRODOTTI FINITI (append-only; RLS fgm_insert per-org;
 * la proiezione finished_goods_levels si aggiorna via trigger, mai da qui).
 */
export async function insertFinishedGoodsMovement(row: {
  organizationId: string;
  recipeId: string;
  movementType: string;
  quantityDelta: number;
  referenceType: string | null;
  performedBy: string | null;
  notes: string | null;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('finished_goods_movements').insert({
    organization_id: row.organizationId,
    recipe_id: row.recipeId,
    movement_type: row.movementType,
    quantity_delta: row.quantityDelta,
    reference_type: row.referenceType,
    performed_by: row.performedBy,
    notes: row.notes,
  } as never);
  if (error) throw mapSupabaseError(error);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toMovement(row: any): InventoryMovement {
  return {
    id:                  row.id,
    organizationId:      row.organization_id,
    ingredientProductId: row.ingredient_product_id,
    ingredientName:      row.ingredient_products?.name ?? '',
    movementType:        row.movement_type,
    quantityDelta:       row.quantity_delta,
    unit:                row.unit,
    referenceType:       row.reference_type,
    referenceId:         row.reference_id,
    notes:               row.notes,
    createdAt:           row.created_at,
    createdBy:           row.performed_by,
  };
}
