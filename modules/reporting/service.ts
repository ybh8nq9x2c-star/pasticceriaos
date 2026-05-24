// =============================================================================
// modules/reporting/service.ts
// Thin service layer per reporting (passa orgId al repo).
// =============================================================================

import { requireOrgId } from '@/modules/identity/service';
import { todayISODate } from '@/lib/utils';
import * as repo from './repository';
import type {
  IngredientRequirement,
  InventoryStockFull,
  OpenOrder,
  DashboardSummary,
} from './types';

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
