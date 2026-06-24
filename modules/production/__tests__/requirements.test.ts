// =============================================================================
// Fabbisogno LIVE (Task 1): aggregazione pura quantity × batch × factor, con
// conversione unità, somma multi-ricetta e classificazione stato/shortage.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { aggregateLiveRequirements, type RecipeBomForReq } from '../requirements';

const masc = { id: 'masc', name: 'Mascarpone', unit: 'g' as const };
const farina = { id: 'farina', name: 'Farina', unit: 'kg' as const }; // magazzino in kg

// Tiramisù: 280 g mascarpone per batch. Pane: 2000 g farina per batch (→ kg).
const tiramisu: RecipeBomForReq = {
  id: 'tiramisu',
  ingredients: [{ quantity: 280, unit: 'g', product: masc }],
};
const pane: RecipeBomForReq = {
  id: 'pane',
  ingredients: [{ quantity: 2000, unit: 'g', product: farina }],
};

describe('aggregateLiveRequirements', () => {
  it('required = quantity × batch, e converte all’unità di magazzino', () => {
    const out = aggregateLiveRequirements(
      [tiramisu, pane],
      new Map([
        ['tiramisu', 3],
        ['pane', 2],
      ]),
      new Map([
        ['masc', 1000], // 1000 g in stock
        ['farina', 10], // 10 kg in stock
      ]),
    );
    const byId = Object.fromEntries(out.map((r) => [r.ingredientProductId, r]));
    expect(byId.masc.totalRequired).toBe(840); // 280 × 3
    expect(byId.masc.unit).toBe('g');
    expect(byId.farina.totalRequired).toBe(4); // 2000 g × 2 = 4000 g → 4 kg
    expect(byId.farina.unit).toBe('kg');
  });

  it('somma lo stesso ingrediente su più ricette', () => {
    const altro: RecipeBomForReq = { id: 'altro', ingredients: [{ quantity: 100, unit: 'g', product: masc }] };
    const out = aggregateLiveRequirements(
      [tiramisu, altro],
      new Map([['tiramisu', 1], ['altro', 2]]),
      new Map(),
    );
    expect(out).toHaveLength(1);
    expect(out[0].totalRequired).toBe(280 + 200); // 280×1 + 100×2
  });

  it('status: ok coperto, warn manca con stock>0, danger manca con stock ≤ 0', () => {
    const out = aggregateLiveRequirements(
      [tiramisu],
      new Map([['tiramisu', 5]]), // 1400 g richiesti
      new Map([['masc', 1400]]),
    );
    expect(out[0].status).toBe('ok');
    expect(out[0].shortage).toBe(0);

    const warn = aggregateLiveRequirements([tiramisu], new Map([['tiramisu', 5]]), new Map([['masc', 1000]]));
    expect(warn[0].status).toBe('warn');
    expect(warn[0].shortage).toBe(400);

    const danger = aggregateLiveRequirements([tiramisu], new Map([['tiramisu', 5]]), new Map([['masc', 0]]));
    expect(danger[0].status).toBe('danger');
    expect(danger[0].shortage).toBe(1400);
  });

  it('ordina per shortage decrescente; batch 0 → ignorato', () => {
    const out = aggregateLiveRequirements(
      [tiramisu, pane],
      new Map([['tiramisu', 0], ['pane', 1]]), // tiramisù escluso
      new Map(),
    );
    expect(out.map((r) => r.ingredientProductId)).toEqual(['farina']);
  });
});
