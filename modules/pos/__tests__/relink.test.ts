// =============================================================================
// Replay post-correzione mapping (puro): quali righe si ricollegano e con quale
// quantità (riscalata per portions_per_unit del mapping appena creato).
// =============================================================================

import { describe, it, expect } from 'vitest';
import { buildRelinkLines, type UnlinkedSaleLine } from '../relink';
import type { PosMapping } from '../repository';

const line = (over: Partial<UnlinkedSaleLine>): UnlinkedSaleLine => ({
  id: 'L1',
  externalProductRef: 'PLU-1',
  quantity: 2,
  recipeId: null,
  status: 'unlinked',
  ...over,
});

describe('buildRelinkLines', () => {
  it('riga scollegata + mapping presente → relink con quantità riscalata per porzioni', () => {
    const mappings = new Map<string, PosMapping>([
      ['plu-1', { recipeId: 'R1', portionsPerUnit: 8, posItemName: 'Torta' }],
    ]);
    const out = buildRelinkLines([line({})], mappings);
    expect(out).toEqual([{ sale_line_id: 'L1', recipe_id: 'R1', quantity: 16 }]); // 2 unità × 8 porzioni
  });

  it('porzioni 1 → quantità invariata', () => {
    const mappings = new Map<string, PosMapping>([
      ['plu-1', { recipeId: 'R1', portionsPerUnit: 1, posItemName: null }],
    ]);
    expect(buildRelinkLines([line({ quantity: 3 })], mappings)[0].quantity).toBe(3);
  });

  it('riga già collegata → esclusa (idempotenza replay)', () => {
    const mappings = new Map<string, PosMapping>([
      ['plu-1', { recipeId: 'R1', portionsPerUnit: 1, posItemName: null }],
    ]);
    expect(buildRelinkLines([line({ recipeId: 'R9' })], mappings)).toEqual([]);
  });

  it('mapping ancora assente (o senza ricetta) → riga esclusa, nessun crash', () => {
    const mappings = new Map<string, PosMapping>([
      ['plu-x', { recipeId: null, portionsPerUnit: 1, posItemName: null }],
    ]);
    expect(buildRelinkLines([line({}), line({ id: 'L2', externalProductRef: 'PLU-X' })], mappings)).toEqual([]);
  });

  it('match case-insensitive sul ref (normalizzazione coerente con ingest)', () => {
    const mappings = new Map<string, PosMapping>([
      ['plu-1', { recipeId: 'R1', portionsPerUnit: 2, posItemName: null }],
    ]);
    const out = buildRelinkLines([line({ externalProductRef: '  PLU-1 ' })], mappings);
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(4);
  });
});
