// =============================================================================
// modules/reporting/repository.ts
// Query sulle viste di reporting.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { mapSupabaseError } from '@/lib/errors';
import type {
  IngredientRequirement,
  InventoryStockFull,
  OpenOrder,
  DashboardSummary,
} from './types';

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
    ingredientProductId:   r.ingredient_product_id,
    ingredientName:        r.ingredient_name,
    unit:                  r.unit,
    totalRequired:         r.total_required,
    currentStock:          r.current_stock,
    estimatedShortage:     r.estimated_shortage,
    estimatedShortageCost: r.estimated_shortage_cost,
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

  return (data ?? []).map((r) => ({
    ingredientProductId: r.ingredient_product_id,
    ingredientName:      r.ingredient_name,
    supplierName:        r.supplier_name ?? null,
    unit:                r.unit,
    unitPrice:           r.unit_price ?? null,
    currentQuantity:     r.current_quantity,
    minThreshold:        r.min_threshold,
    stockStatus:         r.stock_status,
    stockValue:          r.stock_value ?? null,
  }));
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
    lineItemsCount: r.line_items_count,
    totalAmount:    r.total_amount ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Dashboard Summary (aggregated)
// ---------------------------------------------------------------------------

export async function getDashboardSummary(
  orgId: string,
  today: string,
): Promise<DashboardSummary> {
  const supabase = await createClient();

  const [stockResult, openOrdersResult, plansResult, todayPlanResult] =
    await Promise.all([
      // Low/out-of-stock count
      supabase
        .from('v_low_stock_alerts')
        .select('alert_level')
        .eq('organization_id', orgId),

      // Open orders
      supabase
        .from('v_open_orders')
        .select('total_amount')
        .eq('organization_id', orgId),

      // Active plans count
      supabase
        .from('production_plans')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .in('status', ['draft', 'in_progress']),

      // Today's plan
      supabase
        .from('production_plans')
        .select('id, status, production_plan_items(id)')
        .eq('organization_id', orgId)
        .eq('plan_date', today)
        .neq('status', 'cancelled')
        .maybeSingle(),
    ]);

  const alerts = stockResult.data ?? [];
  const openOrders = openOrdersResult.data ?? [];

  const totalValue = openOrders.every(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (o: any) => o.total_amount !== null,
  )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? openOrders.reduce((sum: number, o: any) => sum + (o.total_amount ?? 0), 0)
    : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const todayPlanData = todayPlanResult.data as any;

  return {
    lowStockCount:       alerts.filter((a) => a.alert_level === 'low').length,
    outOfStockCount:     alerts.filter((a) => a.alert_level === 'out_of_stock').length,
    openOrdersCount:     openOrders.length,
    openOrdersTotalValue: totalValue,
    activePlansCount:    plansResult.count ?? 0,
    todayPlan: todayPlanData
      ? {
          id:         todayPlanData.id,
          status:     todayPlanData.status,
          itemsCount: Array.isArray(todayPlanData.production_plan_items)
            ? todayPlanData.production_plan_items.length
            : 0,
        }
      : null,
  };
}
