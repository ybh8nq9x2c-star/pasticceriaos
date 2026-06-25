// =============================================================================
// modules/reporting/types.ts
// Tipi dominio: report e aggregazioni. Ogni tipo mappa 1:1 una vista SQL reale.
// =============================================================================

import type { UnitOfMeasure, MarketplaceOrderStatus, PlanStatus } from '@/lib/database.types';

// ---------------------------------------------------------------------------
// Fabbisogno ingredienti (da v_ingredient_requirements)
// ---------------------------------------------------------------------------

export interface IngredientRequirement {
  planId: string;
  planDate: string;
  planStatus: PlanStatus;
  ingredientProductId: string;
  ingredientName: string;
  unit: UnitOfMeasure;
  totalRequired: number;
  currentStock: number;
  estimatedShortage: number;
  currentUnitPrice: number | null;
  estimatedShortageCost: number | null;
  supplierId: string | null;
  supplierName: string | null;
}

// ---------------------------------------------------------------------------
// Rimanenza teorica prodotti finiti (da v_finished_goods_daily_theoretical)
// FASE 1 — derivata, read-only. sellableProductId ≡ recipeId.
// ---------------------------------------------------------------------------

export interface FinishedGoodTheoretical {
  sellableProductId: string; // = recipeId (la ricetta è il prodotto vendibile)
  productName: string;
  producedQty: number;
  soldQty: number;
  remainingTheoretical: number; // produced - sold (può essere negativo: mostrato così)
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
  isActive: boolean;         // false = ingrediente disattivato (giacenza residua)
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
  sentAt: string | null;
  lineItemsCount: number;
  totalAmount: number | null;
}

// ---------------------------------------------------------------------------
// Dashboard summary (bakery)
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
    totalPortions: number;
  } | null;
  /** Spesa del mese corrente: somma snapshot righe di ordini RICEVUTI nel mese. */
  monthSpend: number;
  /** Numero ordini ricevuti nel mese corrente. */
  monthOrdersReceived: number;
}

// ---------------------------------------------------------------------------
// Food cost (da v_recipe_costs / v_recipe_cost_breakdown)
// ---------------------------------------------------------------------------

export interface RecipeCost {
  recipeId: string;
  name: string;
  emoji: string | null;
  category: string | null;
  basePortions: number;
  sellPricePerPortion: number | null;
  isActive: boolean;
  ingredientCount: number;
  pricedIngredientCount: number;
  /** Costo batch sommando SOLO gli ingredienti prezzati (parziale se incompleto). */
  batchCost: number | null;
  /** Valorizzato solo se TUTTI gli ingredienti hanno prezzo e unità convertibile. */
  costPerPortion: number | null;
  /** Valorizzato solo se costPerPortion è completo e sell price impostato. */
  marginPct: number | null;
}

export interface RecipeCostLine {
  recipeIngredientId: string;
  ingredientProductId: string;
  ingredientName: string;
  quantity: number;
  unit: UnitOfMeasure;
  priceUnit: UnitOfMeasure;
  unitPrice: number | null;
  lineCost: number | null;
  sortOrder: number;
}

// ---------------------------------------------------------------------------
// Spesa reale (da v_monthly_purchase_spend / v_ingredient_purchase_stats)
// ---------------------------------------------------------------------------

export interface MonthlySpend {
  month: string; // YYYY-MM-01
  ordersReceived: number;
  totalSpend: number;
}

export interface IngredientPurchaseStat {
  ingredientProductId: string;
  ingredientName: string;
  unit: UnitOfMeasure;
  ordersCount: number;
  totalQuantity: number;
  totalSpend: number;
  firstPrice: number | null;
  lastPrice: number | null;
  /** Variazione % tra primo e ultimo prezzo snapshot (null se non calcolabile). */
  priceChangePct: number | null;
  lastReceivedAt: string | null;
}

// ---------------------------------------------------------------------------
// Supplier workspace (da v_marketplace_order_facts e derivate)
// ---------------------------------------------------------------------------

export interface MarketplaceOrderFact {
  orderId: string;
  supplierOrgId: string;
  customerOrgId: string;
  supplierName: string | null;
  customerName: string | null;
  status: MarketplaceOrderStatus;
  createdAt: string;
  submittedAt: string | null;
  deliveredAt: string | null;
  lineCount: number;
  totalValue: number;
}

export interface SupplierDashboardSummary {
  /** Ordini ricevuti (sottomessi, esclusi draft/cancelled). */
  ordersReceived: number;
  /** In attesa di conferma (submitted). */
  ordersPending: number;
  /** In lavorazione (accepted | in_preparation | shipped). */
  ordersInProgress: number;
  /** Evasi (delivered). */
  ordersDelivered: number;
  /** Annullati. */
  ordersCancelled: number;
  activeCustomers: number;
  totalValue: number;
  avgOrderValue: number | null;
}

export interface SupplierMonthlySales {
  month: string;
  ordersCount: number;
  totalValue: number;
  customersCount: number;
}

export interface SupplierProductSales {
  catalogItemId: string | null;
  name: string;
  unit: UnitOfMeasure;
  ordersCount: number;
  totalQuantity: number;
  totalRevenue: number;
  customersCount: number;
  lastOrderedAt: string | null;
}

export interface SupplierCustomerStat {
  customerOrgId: string;
  customerName: string | null;
  ordersCount: number;
  totalValue: number;
  deliveredCount: number;
  lastOrderAt: string | null;
}
