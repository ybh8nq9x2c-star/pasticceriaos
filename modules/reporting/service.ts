// =============================================================================
// modules/reporting/service.ts
// Service layer per reporting. Autorizza (org corrente / workspace corretto)
// e delega al repository. Nessuna business logic nei componenti UI.
// =============================================================================

import { requireOrgId } from '@/modules/identity/service';
import { requireSupplierSession } from '@/modules/identity/workspace';
import { todayISODate } from '@/lib/utils';
import * as repo from './repository';
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
  SupplierDashboardSummary,
  SupplierMonthlySales,
  SupplierProductSales,
  SupplierCustomerStat,
  FinishedGoodTheoretical,
} from './types';

// ---------------------------------------------------------------------------
// Bakery
// ---------------------------------------------------------------------------

export async function getIngredientRequirements(
  planId?: string,
): Promise<IngredientRequirement[]> {
  const orgId = await requireOrgId();
  return repo.listIngredientRequirements(orgId, planId);
}

export async function getInventoryStockFull(): Promise<InventoryStockFull[]> {
  const orgId = await requireOrgId();
  return repo.listInventoryStockFull(orgId);
}

export async function getOpenOrders(): Promise<OpenOrder[]> {
  const orgId = await requireOrgId();
  return repo.listOpenOrders(orgId);
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const orgId = await requireOrgId();
  const today = todayISODate();
  return repo.getDashboardSummary(orgId, today);
}

export async function getRecipeCosts(): Promise<RecipeCost[]> {
  const orgId = await requireOrgId();
  return repo.listRecipeCosts(orgId);
}

export async function getRecipeCost(recipeId: string): Promise<RecipeCost | null> {
  const orgId = await requireOrgId();
  return repo.getRecipeCost(orgId, recipeId);
}

export async function getRecipeCostBreakdown(recipeId: string): Promise<RecipeCostLine[]> {
  const orgId = await requireOrgId();
  return repo.listRecipeCostBreakdown(orgId, recipeId);
}

export async function getMonthlySpend(monthsBack = 6): Promise<MonthlySpend[]> {
  const orgId = await requireOrgId();
  return repo.listMonthlySpend(orgId, monthsBack);
}

export async function getIngredientPurchaseStats(limit = 10): Promise<IngredientPurchaseStat[]> {
  const orgId = await requireOrgId();
  return repo.listIngredientPurchaseStats(orgId, limit);
}

// ---------------------------------------------------------------------------
// Rimanenza teorica prodotti finiti (FASE 1) — derivata, read-only.
// "Calcolata da produzione confermata e vendite registrate" per la data.
// ---------------------------------------------------------------------------

/** Rimanenze teoriche di una giornata (default: oggi). Ordinate per rimasto crescente. */
export async function getFinishedGoodsTheoretical(
  businessDate?: string,
): Promise<FinishedGoodTheoretical[]> {
  const orgId = await requireOrgId();
  return repo.listFinishedGoodsTheoretical(orgId, businessDate ?? todayISODate());
}

/** Riepilogo per la dashboard: i primi N prodotti (rimasto crescente) di oggi. */
export async function getTodayFinishedGoodsTheoreticalSummary(
  limit = 5,
): Promise<FinishedGoodTheoretical[]> {
  const rows = await getFinishedGoodsTheoretical();
  return rows.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Supplier — KPI e analytics derivati dagli ordini marketplace REALI.
// Guard: solo org con account_type = 'supplier'.
// ---------------------------------------------------------------------------

const IN_PROGRESS_STATUSES = ['accepted', 'in_preparation', 'shipped'] as const;

export async function getSupplierOrderFacts(): Promise<MarketplaceOrderFact[]> {
  const { orgId } = await requireSupplierSession();
  return repo.listSupplierOrderFacts(orgId);
}

export async function getSupplierDashboardSummary(): Promise<SupplierDashboardSummary> {
  const { orgId } = await requireSupplierSession();
  const facts = await repo.listSupplierOrderFacts(orgId);

  // Solo ordini effettivamente sottomessi contano come "ricevuti".
  const submitted = facts.filter((f) => f.submittedAt !== null && f.status !== 'draft');
  const valued = submitted.filter((f) => f.status !== 'cancelled');
  const totalValue = valued.reduce((s, f) => s + f.totalValue, 0);

  return {
    ordersReceived:   submitted.filter((f) => f.status !== 'cancelled').length,
    ordersPending:    submitted.filter((f) => f.status === 'submitted').length,
    ordersInProgress: submitted.filter((f) =>
      (IN_PROGRESS_STATUSES as readonly string[]).includes(f.status),
    ).length,
    ordersDelivered:  submitted.filter((f) => f.status === 'delivered').length,
    ordersCancelled:  submitted.filter((f) => f.status === 'cancelled').length,
    activeCustomers:  new Set(valued.map((f) => f.customerOrgId)).size,
    totalValue,
    avgOrderValue:    valued.length > 0 ? totalValue / valued.length : null,
  };
}

export async function getSupplierMonthlySales(monthsBack = 6): Promise<SupplierMonthlySales[]> {
  const { orgId } = await requireSupplierSession();
  return repo.listSupplierMonthlySales(orgId, monthsBack);
}

export async function getSupplierProductSales(limit = 10): Promise<SupplierProductSales[]> {
  const { orgId } = await requireSupplierSession();
  return repo.listSupplierProductSales(orgId, limit);
}

export async function getSupplierCustomerStats(): Promise<SupplierCustomerStat[]> {
  const { orgId } = await requireSupplierSession();
  return repo.listSupplierCustomerStats(orgId);
}
