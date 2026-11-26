// =============================================================================
// modules/production/completion-report.ts
// Mapping PURO dell'esito di complete_production_plan v5 (migration 060):
// jsonb snake_case → PlanCompletionReport. Tollerante a campi mancanti
// (piani completati prima della 060 → null).
// =============================================================================

import type { PlanCompletionReport } from './types';

/** jsonb snake_case della RPC (060) → tipo di dominio camelCase. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toCompletionReport(raw: any): PlanCompletionReport | null {
  if (!raw || typeof raw !== 'object') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arr = (v: any): any[] => (Array.isArray(v) ? v : []);
  return {
    consumed: arr(raw.consumed).map((c) => ({
      ingredientName: String(c.ingredient_name ?? ''),
      quantity: Number(c.quantity ?? 0),
      unit: String(c.unit ?? ''),
      lots: arr(c.lots).map((l) => ({
        lotNumber: l.lot_number ?? null,
        expiryDate: String(l.expiry_date ?? ''),
        quantity: Number(l.quantity ?? 0),
        unit: String(l.unit ?? ''),
      })),
      untrackedQuantity: Number(c.untracked_quantity ?? 0),
    })),
    skipped: arr(raw.skipped).map((s) => ({
      recipeName: String(s.recipe_name ?? ''),
      ingredientName: String(s.ingredient_name ?? ''),
      quantity: Number(s.quantity ?? 0),
      recipeUnit: String(s.recipe_unit ?? ''),
      stockUnit: String(s.stock_unit ?? ''),
      reason: s.reason === 'ingredient_other_org' ? 'ingredient_other_org' : 'unit_incompatible',
    })),
    output: arr(raw.output).map((o) => ({
      recipeName: String(o.recipe_name ?? ''),
      quantity: Number(o.quantity ?? 0),
      ingredientsComplete: o.ingredients_complete !== false,
    })),
  };
}

