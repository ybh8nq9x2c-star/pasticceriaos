// =============================================================================
// modules/production/requirements.ts
// Calcolo PURO del fabbisogno ingredienti per un piano (anche NON salvato) —
// cuore del "fabbisogno live" (Task 1). Nessun DB: data la BOM delle ricette, i
// batch per ricetta e le giacenze, produce il fabbisogno aggregato. Stessa
// matematica di v_ingredient_requirements (021): quantity × batch × factor.
// =============================================================================

import { unitConversionFactor } from '@/lib/units';
import type { UnitOfMeasure } from '@/lib/database.types';

export interface LiveRequirement {
  ingredientProductId: string;
  ingredientName: string;
  unit: UnitOfMeasure;
  totalRequired: number;
  currentStock: number;
  shortage: number; // max(required - stock, 0)
  status: 'ok' | 'warn' | 'danger';
}

/** Riga BOM normalizzata (indipendente dalla query Supabase). */
export interface RecipeBomForReq {
  id: string;
  ingredients: {
    quantity: number;
    unit: UnitOfMeasure;
    product: { id: string; name: string; unit: UnitOfMeasure } | null;
  }[];
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Fabbisogno aggregato per ingrediente. required = Σ quantity × batchCount ×
 * factor(unità ricetta → magazzino) (coalesce 1, come la vista). status: ok
 * (coperto) / warn (manca, stock > 0) / danger (manca, stock ≤ 0). Ordinato per
 * shortage decrescente.
 */
export function aggregateLiveRequirements(
  recipes: RecipeBomForReq[],
  batchByRecipe: Map<string, number>,
  stockById: Map<string, number>,
): LiveRequirement[] {
  const agg = new Map<string, { name: string; unit: UnitOfMeasure; required: number }>();
  for (const rec of recipes) {
    const batches = batchByRecipe.get(rec.id) ?? 0;
    if (batches <= 0) continue;
    for (const ri of rec.ingredients) {
      if (!ri.product) continue;
      const factor = unitConversionFactor(ri.unit, ri.product.unit) ?? 1;
      const required = Number(ri.quantity) * batches * factor;
      const cur = agg.get(ri.product.id);
      if (cur) cur.required += required;
      else agg.set(ri.product.id, { name: ri.product.name, unit: ri.product.unit, required });
    }
  }
  return [...agg.entries()]
    .map(([id, v]) => {
      const totalRequired = round3(v.required);
      const currentStock = stockById.get(id) ?? 0;
      const shortage = round3(Math.max(totalRequired - currentStock, 0));
      const status: LiveRequirement['status'] = shortage <= 0 ? 'ok' : currentStock <= 0 ? 'danger' : 'warn';
      return { ingredientProductId: id, ingredientName: v.name, unit: v.unit, totalRequired, currentStock, shortage, status };
    })
    .sort((a, b) => b.shortage - a.shortage || a.ingredientName.localeCompare(b.ingredientName));
}
