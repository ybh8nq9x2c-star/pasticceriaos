// =============================================================================
// modules/goods-receipts/units.ts
// Conversione unità lato TS — SPECCHIO ESATTO di unit_conversion_factor (SQL,
// migration 021): identità → 1; coppie metriche g↔kg, ml↔l; tutto il resto
// NULL = non convertibile. Non inventare un secondo modello di conversione:
// se cambia la semantica, cambiala PRIMA in SQL e riallinea questo file.
// =============================================================================

import type { UnitOfMeasure } from '@/lib/database.types';

const FACTORS: Partial<Record<UnitOfMeasure, Partial<Record<UnitOfMeasure, number>>>> = {
  g:  { kg: 0.001 },
  kg: { g: 1000 },
  ml: { l: 0.001 },
  l:  { ml: 1000 },
};

/** Fattore per convertire `from` → `to`; null = unità non convertibili. */
export function unitConversionFactor(from: UnitOfMeasure, to: UnitOfMeasure): number | null {
  if (from === to) return 1;
  return FACTORS[from]?.[to] ?? null;
}

/** Quantità convertita `from` → `to` (4 decimali, come numeric(12,4) del DB); null = non convertibile. */
export function convertQty(qty: number, from: UnitOfMeasure, to: UnitOfMeasure): number | null {
  const factor = unitConversionFactor(from, to);
  if (factor === null) return null;
  return Math.round(qty * factor * 10000) / 10000;
}
