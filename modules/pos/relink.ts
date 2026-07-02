// =============================================================================
// modules/pos/relink.ts
// Logica PURA del replay post-correzione mapping: date le righe ancora
// scollegate di una vendita e i mapping correnti, costruisce il payload per la
// RPC relink_sale_lines. La quantità viene RISCALATA per portions_per_unit:
// all'ingest la riga unmapped era stata salvata con fattore 1 (unità POS).
// =============================================================================

import type { RelinkLine } from '@/modules/sales/repository';
import type { PosMapping } from './repository';

const norm = (s: string) => s.trim().toLowerCase();

export interface UnlinkedSaleLine {
  id: string;
  externalProductRef: string;
  quantity: number; // unità POS (fattore 1 all'ingest, perché non mappata)
  recipeId: string | null;
  status: string;
}

/**
 * Righe ricollegabili ORA: ancora senza ricetta + mapping (con ricetta) presente.
 * quantity RPC = unità POS × portions_per_unit del mapping appena creato.
 */
export function buildRelinkLines(
  lines: UnlinkedSaleLine[],
  mappings: Map<string, PosMapping>,
): RelinkLine[] {
  const out: RelinkLine[] = [];
  for (const line of lines) {
    if (line.recipeId !== null) continue; // già collegata
    const m = mappings.get(norm(line.externalProductRef));
    if (!m || !m.recipeId) continue; // ancora nessun mapping utilizzabile
    out.push({
      sale_line_id: line.id,
      recipe_id: m.recipeId,
      quantity: line.quantity * (m.portionsPerUnit || 1),
    });
  }
  return out;
}
