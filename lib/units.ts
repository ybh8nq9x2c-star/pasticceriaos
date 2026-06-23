// =============================================================================
// lib/units.ts
// Conversione unità — UNICA fonte di verità lato TS, mirror ESATTO della funzione
// DB unit_conversion_factor (migration 021). Usata da: deduzione vendita
// (sales/bom), validazione ricette (catalog), e ovunque serva sapere se due unità
// sono compatibili. Tenere allineata alla 021 se cambia.
// =============================================================================

import type { UnitOfMeasure } from '@/lib/database.types';

/**
 * Fattore per convertire `from` → `to`, o `null` se NON convertibile (grandezze
 * diverse: peso/volume/pezzi). Solo coppie metriche g↔kg, ml↔l e identità.
 */
export function unitConversionFactor(from: UnitOfMeasure, to: UnitOfMeasure): number | null {
  if (from === to) return 1;
  if (from === 'g' && to === 'kg') return 0.001;
  if (from === 'kg' && to === 'g') return 1000;
  if (from === 'ml' && to === 'l') return 0.001;
  if (from === 'l' && to === 'ml') return 1000;
  return null;
}

/** Due unità sono convertibili l'una nell'altra? (stessa grandezza fisica) */
export function isUnitConvertible(from: UnitOfMeasure, to: UnitOfMeasure): boolean {
  return unitConversionFactor(from, to) !== null;
}
