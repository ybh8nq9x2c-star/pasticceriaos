// =============================================================================
// modules/marketplace/draft-match.ts
// Conversione bozza PO standard → ordine condiviso: matching PURO delle righe
// bozza (ingredienti locali) sul catalogo pubblicato dal fornitore.
//
// Regole (stesse convenzioni del receipt bridge 023/053, in direzione inversa):
//   - match per nome case/space-insensitive (lower + trim);
//   - a parità di nome, preferisci l'item con la STESSA unità;
//   - unità diverse ma convertibili (g↔kg, ml↔l) → quantità convertita;
//   - unità non convertibili o nome assente → riga NON matchata, con motivo
//     esplicito (mai far sparire una riga in silenzio).
// =============================================================================

import { unitConversionFactor } from '@/lib/units';
import type { UnitOfMeasure } from '@/lib/database.types';

export interface DraftLineForMatch {
  name: string;
  quantity: number;
  unit: UnitOfMeasure;
}

export interface CatalogItemForMatch {
  id: string;
  name: string;
  unit: UnitOfMeasure;
}

export interface DraftMatchResult {
  /** catalogItemId → quantità (stringa pronta per il composer). */
  initialQty: Record<string, string>;
  matchedCount: number;
  /** Righe non convertite, con il motivo leggibile. */
  unmatched: { name: string; reason: 'not_in_catalog' | 'unit_incompatible' }[];
}

const norm = (s: string) => s.trim().toLowerCase();

/** Arrotonda a 3 decimali (precisione canonica del DB). */
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function matchDraftLinesToCatalog(
  lines: DraftLineForMatch[],
  catalog: CatalogItemForMatch[],
): DraftMatchResult {
  const byName = new Map<string, CatalogItemForMatch[]>();
  for (const item of catalog) {
    const key = norm(item.name);
    const arr = byName.get(key) ?? [];
    arr.push(item);
    byName.set(key, arr);
  }

  const qtyById = new Map<string, number>();
  const unmatched: DraftMatchResult['unmatched'] = [];
  let matchedCount = 0;

  for (const line of lines) {
    const candidates = byName.get(norm(line.name)) ?? [];
    if (candidates.length === 0) {
      unmatched.push({ name: line.name, reason: 'not_in_catalog' });
      continue;
    }
    // Preferisci stessa unità; poi la prima convertibile.
    const exact = candidates.find((c) => c.unit === line.unit);
    const convertible = exact ?? candidates.find((c) => unitConversionFactor(line.unit, c.unit) !== null);
    if (!convertible) {
      unmatched.push({ name: line.name, reason: 'unit_incompatible' });
      continue;
    }
    const factor = unitConversionFactor(line.unit, convertible.unit) ?? 1;
    // Più righe bozza sullo stesso item catalogo → somma (mai sovrascrivere).
    qtyById.set(convertible.id, round3((qtyById.get(convertible.id) ?? 0) + line.quantity * factor));
    matchedCount += 1;
  }

  const initialQty: Record<string, string> = {};
  for (const [id, q] of qtyById) {
    if (q > 0) initialQty[id] = String(q);
  }
  return { initialQty, matchedCount, unmatched };
}

/** Copy leggibile per il motivo di mancato match. */
export const UNMATCHED_REASON_COPY: Record<DraftMatchResult['unmatched'][number]['reason'], string> = {
  not_in_catalog: 'non presente nel catalogo del fornitore',
  unit_incompatible: 'unità non compatibile con il catalogo',
};
