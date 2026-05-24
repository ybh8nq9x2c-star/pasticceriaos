// =============================================================================
// modules/production/types.ts
// Tipi dominio: piani di produzione e voci piano.
// =============================================================================

export type PlanStatus = 'draft' | 'in_progress' | 'completed' | 'cancelled';

export interface ProductionPlanItem {
  id: string;
  planId: string;
  recipeId: string;
  recipeName: string;   // join da recipes
  recipeEmoji: string | null;
  batchCount: number;
  basePortions: number; // da recipes
  totalPortions: number; // computed: batchCount * basePortions
  notes: string | null;
  sortOrder: number;
}

export interface ProductionPlan {
  id: string;
  organizationId: string;
  planDate: string;     // YYYY-MM-DD
  status: PlanStatus;
  notes: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: ProductionPlanItem[];
}

export interface ProductionPlanListItem {
  id: string;
  planDate: string;
  status: PlanStatus;
  notes: string | null;
  itemsCount: number;
  completedAt: string | null;
  createdAt: string;
}
