// =============================================================================
// modules/reporting/types.ts
// Tipi dominio: report e aggregazioni.
// =============================================================================

import type { UnitOfMeasure } from '@/lib/database.types';

// ---------------------------------------------------------------------------
// Fabbisogno ingredienti (da v_ingredient_requirements)
// ---------------------------------------------------------------------------

export interface IngredientRequirement {
  planId: string;
  planDate: string;
  ingredientProductId: string;
  ingredientName: string;
  unit: UnitOfMeasure;
  totalRequired: number;
  currentStock: number;
  estimatedShortage: number;
  estimatedShortageCost: number | null;
}

// ---------------------------------------------------------------------------
// Stock full (da v_inventory_stock_full)
// ---------------------------------------------------------------------------

export type StockStatus = 'out_of_stock' | 'critical' | 'low' | 'ok';

export interface InventoryStockFull {
  ingredientProductId: string;
  ingredientName: string;
  supplierName: string | null;
  unit: UnitOfMeasure;
  unitPrice: number | null;
  currentQuantity: number;
  minThreshold: number;
  stockStatus: StockStatus;
  stockValue: number | null; // currentQuantity * unitPrice
}

// ---------------------------------------------------------------------------
// Open Orders (da v_open_orders)
// ---------------------------------------------------------------------------

export interface OpenOrder {
  orderId: string;
  supplierName: string;
  status: string;
  orderDate: string;
  expectedDate: string | null;
  lineItemsCount: number;
  totalAmount: number | null;
}

// ---------------------------------------------------------------------------
// Dashboard summary
// ---------------------------------------------------------------------------

export interface DashboardSummary {
  lowStockCount: number;
  outOfStockCount: number;
  openOrdersCount: number;
  openOrdersTotalValue: number | null;
  activePlansCount: number;
  todayPlan: {
    id: string;
    status: string;
    itemsCount: number;
  } | null;
}
