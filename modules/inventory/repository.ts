// =============================================================================
// modules/inventory/repository.ts
// Query database per il contesto inventory.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { mapSupabaseError, NotFoundError } from '@/lib/errors';
import type { InventoryLevel, InventoryMovement, LowStockAlert } from './types';
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
