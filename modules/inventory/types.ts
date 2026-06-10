// =============================================================================
// modules/inventory/types.ts
// Tipi dominio: movimenti e livelli di inventario.
// =============================================================================

import type { UnitOfMeasure } from '@/lib/database.types';

export type MovementType =
  | 'purchase_receipt'
  | 'production_usage'
  | 'waste'
  | 'manual_adjustment'
  | 'initial_stock'
  | 'return_to_supplier';

export interface InventoryLevel {
  id: string;
  organizationId: string;
  ingredientProductId: string;
  ingredientName: string;   // join da ingredient_products
  unit: UnitOfMeasure;
  currentQuantity: number;
  minThreshold: number;
  updatedAt: string;
}

export interface InventoryMovement {
  id: string;
  organizationId: string;
  ingredientProductId: string;
  ingredientName: string;   // join
  movementType: MovementType;
  quantityDelta: number;
  unit: UnitOfMeasure;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
}

export type AlertLevel = 'out_of_stock' | 'critical' | 'low';

export interface LowStockAlert {
  ingredientProductId: string;
  ingredientName: string;
  supplierName: string | null;
  currentQuantity: number;
  minThreshold: number;
  unit: UnitOfMeasure;
  alertLevel: AlertLevel;
}

// ── Lotti e scadenze (HACCP-lite, migration 028) ─────────────────────────────

export interface IngredientBatch {
  id: string;
  ingredientProductId: string;
  ingredientName: string;
  purchaseOrderId: string | null;
  lotNumber: string | null;
  expiryDate: string;
  quantityReceived: number;
  quantityRemaining: number;
  unit: UnitOfMeasure;
  receivedAt: string;
  notes: string | null;
}

export interface ExpiringBatch {
  batchId: string;
  ingredientProductId: string;
  ingredientName: string;
  lotNumber: string | null;
  expiryDate: string;
  quantityRemaining: number;
  unit: UnitOfMeasure;
  daysToExpiry: number;
  supplierName: string | null;
  suggestedRecipes: string[];
}
