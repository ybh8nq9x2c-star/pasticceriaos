// =============================================================================
// modules/reporting/repository.ts
// Query sulle viste di reporting. Ogni numero esposto qui proviene da una
// vista SQL reale (security_invoker, RLS dell'utente chiamante).
// Nessun fallback statico: gli errori risalgono al service/page.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { mapSupabaseError } from '@/lib/errors';
import type {
  IngredientRequirement,
  InventoryStockFull,
  OpenOrder,
  DashboardSummary,
  RecipeCost,
  RecipeCostLine,
  MonthlySpend,
  IngredientPurchaseStat,
  MarketplaceOrderFact,
  SupplierMonthlySales,
  SupplierProductSales,
  SupplierCustomerStat,
} from './types';

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// ---------------------------------------------------------------------------
// Fabbisogno ingredienti per piano
// ---------------------------------------------------------------------------

export async function listIngredientRequirements(
  orgId: string,
  planId?: string,
): Promise<IngredientRequirement[]> {
  const supabase = await createClient();
  let query = supabase
    .from('v_ingredient_requirements')
    .select('*')
    .eq('organization_id', orgId)
    .order('plan_date')
    .order('ingredient_name');

  if (planId) query = query.eq('production_plan_id', planId);

  const { data, error } = await query;
  if (error) throw mapSupabaseError(error);

  return (data ?? []).map((r) => ({
    planId:                r.production_plan_id,
    planDate:              r.plan_date,
    planStatus:            r.plan_status,
    ingredientProductId:   r.ingredient_product_id,
    ingredientName:        r.ingredient_name,
    unit:                  r.unit,
    totalRequired:         num(r.total_required),
    currentStock:          num(r.current_stock),
    estimatedShortage:     num(r.estimated_shortage),
    currentUnitPrice:      numOrNull(r.current_unit_price),
    estimatedShortageCost: numOrNull(r.estimated_shortage_cost),
    supplierId:            r.supplier_id,
    supplierName:          r.supplier_name,
  }));
}

// ---------------------------------------------------------------------------
// Stock completo
// ---------------------------------------------------------------------------

export async function listInventoryStockFull(
  orgId: string,
): Promise<InventoryStockFull[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_inventory_stock_full')
    .select('*')
    .eq('organization_id', orgId)
    .order('ingredient_name');

  if (error) throw mapSupabaseError(error);

  return (data ?? []).map((r) => {
    const unitPrice = numOrNull(r.unit_price);
    const currentQuantity = num(r.current_quantity);
    return {
      ingredientProductId: r.ingredient_product_id,
      ingredientName:      r.ingredient_name,
      supplierName:        r.supplier_name ?? null,
      unit:                r.unit,
      unitPrice,
      currentQuantity,
      minThreshold:        num(r.min_threshold),
      stockStatus:         r.stock_status,
      stockValue:          unitPrice !== null ? currentQuantity * unitPrice : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Open Orders
// ---------------------------------------------------------------------------

export async function listOpenOrders(orgId: string): Promise<OpenOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_open_orders')
    .select('*')
    .eq('organization_id', orgId)
    .order('order_date', { ascending: false });

  if (error) throw mapSupabaseError(error);

  return (data ?? []).map((r) => ({
    orderId:        r.order_id,
    supplierName:   r.supplier_name,
    status:         r.status,
    orderDate:      r.order_date,
    expectedDate:   r.expected_date ?? null,
    sentAt:         r.sent_at ?? null,
    lineItemsCount: num(r.line_items_count),
    totalAmount:    numOrNull(r.total_amount),
  }));
}

// ---------------------------------------------------------------------------
// Dashboard Summary (bakery, aggregato)
// ---------------------------------------------------------------------------

export async function getDashboardSummary(
  orgId: string,
  today: string,
): Promise<DashboardSummary> {
  const supabase = await createClient();
  const monthStart = today.slice(0, 8) + '01';

  const [stockResult, openOrdersResult, plansResult, todayPlanResult, monthSpendResult] =
    await Promise.all([
      supabase
        .from('v_low_stock_alerts')
        .select('alert_level')
        .eq('organization_id', orgId),

      supabase
        .from('v_open_orders')
        .select('total_amount')
        .eq('organization_id', orgId),

      supabase
        .from('production_plans')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .in('status', ['draft', 'in_progress']),

      supabase
        .from('production_plans')
        .select('id, status, production_plan_items(batch_count, recipes(base_portions))')
        .eq('organization_id', orgId)
        .eq('plan_date', today)
        .neq('status', 'cancelled')
        .maybeSingle(),

      supabase
        .from('v_monthly_purchase_spend')
        .select('total_spend, orders_received')
        .eq('organization_id', orgId)
        .eq('month', monthStart)
        .maybeSingle(),
    ]);

  if (stockResult.error)      throw mapSupabaseError(stockResult.error);
  if (openOrdersResult.error) throw mapSupabaseError(openOrdersResult.error);
  if (plansResult.error)      throw mapSupabaseError(plansResult.error);
  if (todayPlanResult.error)  throw mapSupabaseError(todayPlanResult.error);
  if (monthSpendResult.error) throw mapSupabaseError(monthSpendResult.error);

  const alerts = stockResult.data ?? [];
  const openOrders = openOrdersResult.data ?? [];

  const totalValue = openOrders.every((o) => o.total_amount !== null)
    ? openOrders.reduce((sum, o) => sum + num(o.total_amount), 0)
    : null;

  // Embed tipizzato: production_plan_items dichiara le FK verso plans e recipes
  // nei tipi, quindi nessun cast è necessario.
  const todayPlanData = todayPlanResult.data;
  const todayItems = todayPlanData?.production_plan_items ?? [];

  return {
    lowStockCount:        alerts.filter((a) => a.alert_level !== 'out_of_stock').length,
    outOfStockCount:      alerts.filter((a) => a.alert_level === 'out_of_stock').length,
    openOrdersCount:      openOrders.length,
    openOrdersTotalValue: totalValue,
    activePlansCount:     plansResult.count ?? 0,
    todayPlan: todayPlanData
      ? {
          id:            todayPlanData.id,
          status:        todayPlanData.status,
          itemsCount:    todayItems.length,
          totalPortions: todayItems.reduce(
            (s, i) => s + num(i.batch_count) * num(i.recipes?.base_portions ?? 0),
            0,
          ),
        }
      : null,
    monthSpend:          num(monthSpendResult.data?.total_spend),
    monthOrdersReceived: num(monthSpendResult.data?.orders_received),
  };
}

// ---------------------------------------------------------------------------
// Food cost
// ---------------------------------------------------------------------------

export async function listRecipeCosts(orgId: string): Promise<RecipeCost[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_recipe_costs')
    .select('*')
    .eq('organization_id', orgId)
    .order('name');

  if (error) throw mapSupabaseError(error);

  return (data ?? []).map((r) => ({
    recipeId:              r.recipe_id,
    name:                  r.name,
    emoji:                 r.emoji,
    category:              r.category,
    basePortions:          num(r.base_portions),
    sellPricePerPortion:   numOrNull(r.sell_price_per_portion),
    isActive:              r.is_active,
    ingredientCount:       num(r.ingredient_count),
    pricedIngredientCount: num(r.priced_ingredient_count),
    batchCost:             numOrNull(r.batch_cost),
    costPerPortion:        numOrNull(r.cost_per_portion),
    marginPct:             numOrNull(r.margin_pct),
  }));
}

export async function getRecipeCost(orgId: string, recipeId: string): Promise<RecipeCost | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_recipe_costs')
    .select('*')
    .eq('organization_id', orgId)
    .eq('recipe_id', recipeId)
    .maybeSingle();

  if (error) throw mapSupabaseError(error);
  if (!data) return null;

  return {
    recipeId:              data.recipe_id,
    name:                  data.name,
    emoji:                 data.emoji,
    category:              data.category,
    basePortions:          num(data.base_portions),
    sellPricePerPortion:   numOrNull(data.sell_price_per_portion),
    isActive:              data.is_active,
    ingredientCount:       num(data.ingredient_count),
    pricedIngredientCount: num(data.priced_ingredient_count),
    batchCost:             numOrNull(data.batch_cost),
    costPerPortion:        numOrNull(data.cost_per_portion),
    marginPct:             numOrNull(data.margin_pct),
  };
}

export async function listRecipeCostBreakdown(
  orgId: string,
  recipeId: string,
): Promise<RecipeCostLine[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_recipe_cost_breakdown')
    .select('*')
    .eq('organization_id', orgId)
    .eq('recipe_id', recipeId)
    .order('sort_order');

  if (error) throw mapSupabaseError(error);

  return (data ?? []).map((r) => ({
    recipeIngredientId:  r.recipe_ingredient_id,
    ingredientProductId: r.ingredient_product_id,
    ingredientName:      r.ingredient_name,
    quantity:            num(r.quantity),
    unit:                r.unit,
    priceUnit:           r.price_unit,
    unitPrice:           numOrNull(r.unit_price),
    lineCost:            numOrNull(r.line_cost),
    sortOrder:           num(r.sort_order),
  }));
}

// ---------------------------------------------------------------------------
// Spesa reale (ordini ricevuti)
// ---------------------------------------------------------------------------

export async function listMonthlySpend(orgId: string, monthsBack = 6): Promise<MonthlySpend[]> {
  const supabase = await createClient();
  const since = new Date();
  since.setMonth(since.getMonth() - (monthsBack - 1));
  const sinceMonth = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-01`;

  const { data, error } = await supabase
    .from('v_monthly_purchase_spend')
    .select('*')
    .eq('organization_id', orgId)
    .gte('month', sinceMonth)
    .order('month');

  if (error) throw mapSupabaseError(error);

  return (data ?? []).map((r) => ({
    month:          r.month,
    ordersReceived: num(r.orders_received),
    totalSpend:     num(r.total_spend),
  }));
}

export async function listIngredientPurchaseStats(
  orgId: string,
  limit = 10,
): Promise<IngredientPurchaseStat[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_ingredient_purchase_stats')
    .select('*')
    .eq('organization_id', orgId)
    .order('total_spend', { ascending: false })
    .limit(limit);

  if (error) throw mapSupabaseError(error);

  return (data ?? []).map((r) => {
    const firstPrice = numOrNull(r.first_price);
    const lastPrice = numOrNull(r.last_price);
    const priceChangePct =
      firstPrice !== null && lastPrice !== null && firstPrice > 0
        ? Math.round(((lastPrice - firstPrice) / firstPrice) * 1000) / 10
        : null;
    return {
      ingredientProductId: r.ingredient_product_id,
      ingredientName:      r.ingredient_name,
      unit:                r.unit,
      ordersCount:         num(r.orders_count),
      totalQuantity:       num(r.total_quantity),
      totalSpend:          num(r.total_spend),
      firstPrice,
      lastPrice,
      priceChangePct,
      lastReceivedAt:      r.last_received_at,
    };
  });
}

// ---------------------------------------------------------------------------
// Supplier workspace
// ---------------------------------------------------------------------------

export async function listSupplierOrderFacts(
  supplierOrgId: string,
): Promise<MarketplaceOrderFact[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_marketplace_order_facts')
    .select('*')
    .eq('supplier_org_id', supplierOrgId)
    .order('created_at', { ascending: false });

  if (error) throw mapSupabaseError(error);

  return (data ?? []).map((r) => ({
    orderId:       r.order_id,
    supplierOrgId: r.supplier_org_id,
    customerOrgId: r.customer_org_id,
    supplierName:  r.supplier_name,
    customerName:  r.customer_name,
    status:        r.status,
    createdAt:     r.created_at,
    submittedAt:   r.submitted_at,
    deliveredAt:   r.delivered_at,
    lineCount:     num(r.line_count),
    totalValue:    num(r.total_value),
  }));
}

export async function listSupplierMonthlySales(
  supplierOrgId: string,
  monthsBack = 6,
): Promise<SupplierMonthlySales[]> {
  const supabase = await createClient();
  const since = new Date();
  since.setMonth(since.getMonth() - (monthsBack - 1));
  const sinceMonth = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-01`;

  const { data, error } = await supabase
    .from('v_supplier_monthly_sales')
    .select('*')
    .eq('supplier_org_id', supplierOrgId)
    .gte('month', sinceMonth)
    .order('month');

  if (error) throw mapSupabaseError(error);

  return (data ?? []).map((r) => ({
    month:          r.month,
    ordersCount:    num(r.orders_count),
    totalValue:     num(r.total_value),
    customersCount: num(r.customers_count),
  }));
}

export async function listSupplierProductSales(
  supplierOrgId: string,
  limit = 10,
): Promise<SupplierProductSales[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_supplier_product_sales')
    .select('*')
    .eq('supplier_org_id', supplierOrgId)
    .order('total_revenue', { ascending: false })
    .limit(limit);

  if (error) throw mapSupabaseError(error);

  return (data ?? []).map((r) => ({
    catalogItemId:  r.catalog_item_id,
    name:           r.name_snapshot,
    unit:           r.unit,
    ordersCount:    num(r.orders_count),
    totalQuantity:  num(r.total_quantity),
    totalRevenue:   num(r.total_revenue),
    customersCount: num(r.customers_count),
    lastOrderedAt:  r.last_ordered_at,
  }));
}

export async function listSupplierCustomerStats(
  supplierOrgId: string,
): Promise<SupplierCustomerStat[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_supplier_customer_stats')
    .select('*')
    .eq('supplier_org_id', supplierOrgId)
    .order('total_value', { ascending: false, nullsFirst: false });

  if (error) throw mapSupabaseError(error);

  return (data ?? []).map((r) => ({
    customerOrgId:  r.customer_org_id,
    customerName:   r.customer_name,
    ordersCount:    num(r.orders_count),
    totalValue:     num(r.total_value),
    deliveredCount: num(r.delivered_count),
    lastOrderAt:    r.last_order_at,
  }));
}
