// =============================================================================
// Coverage-first chunked enrichment — invariante: il merge AI non riduce MAI la
// copertura. Qualunque esito del normalizer (subset, fallito, eccezione, fuori
// ordine, vuoto) → final.length === baseline.length, dropped === 0.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { enrichBaselineWithAiChunks, type ChunkNormalizer } from '../enrich';
import { enrichRecipeByLine, markUnnormalized, enrichByIndex } from '../adapter';
import { aiNormalizeResultSchema, type AiNormalizeResult, type AiNormalizedRecipe } from '../contract';
import type { ParsedRecipe } from '../../types';
import { parseText, parseCsv } from '../../parse';
import { TEXT_50, CSV_50, EXPECTED_RECIPE_COUNT } from '../../__tests__/fixtures/recipes50';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Baseline sintetico: N ricette, 2 ingredienti ciascuna, quantità/unità VUOTE. */
function mkBaseline(n: number): ParsedRecipe[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `Ricetta ${i}`,
    basePortions: null,
    category: null,
    notes: null,
    ingredients: [
      { rawText: `Farina ${250 + i} g`, name: `Farina ${250 + i}`, quantity: null, unit: null, matchedProductId: null, matchedProductName: null, suggestions: [] },
      { rawText: `Zucchero ${100 + i} g`, name: `Zucchero ${100 + i}`, quantity: null, unit: null, matchedProductId: null, matchedProductName: null, suggestions: [] },
    ],
    warnings: ['Alcune quantità non sono state riconosciute.'],
  }));
}

/** Normalizer fake parametrico (NON tocca la rete). */
function fakeNormalizer(opts?: {
  failIndices?: Set<number>; // chunk con uno di questi index → null
  omitIndices?: Set<number>; // questi index NON vengono restituiti (AI ne salta alcuni)
  throwIndices?: Set<number>; // chunk con uno di questi → eccezione
}): ChunkNormalizer {
  return async (input) => {
    const idxs = input.recipes.map((r) => r.index);
    if (opts?.throwIndices && idxs.some((i) => opts.throwIndices!.has(i))) throw new Error('boom');
    if (opts?.failIndices && idxs.some((i) => opts.failIndices!.has(i))) return null;
    const recipes: AiNormalizedRecipe[] = input.recipes
      .filter((r) => !opts?.omitIndices?.has(r.index))
      .map((r) => ({
        index: r.index,
        name: r.name,
        nameConfidence: 0.95,
        portions: 8,
        ambiguityFlags: [],
        ingredients: r.rawLines.map((rl) => ({
          rawText: rl,
          name: rl.replace(/\s*\d+.*$/, '').trim() || rl, // "Farina 250" → "Farina"
          quantity: 250,
          unit: 'g' as const,
          nameConfidence: 0.95,
          quantityConfidence: 0.95,
          unitConfidence: 0.95,
          catalogMatchName: null,
          ambiguous: false,
        })),
      }));
    return { recipes };
  };
}

const qtyFilled = (r: ParsedRecipe) => r.ingredients.every((l) => l.quantity != null);
const qtyEmpty = (r: ParsedRecipe) => r.ingredients.every((l) => l.quantity == null);

// ── 1. 50 baseline → 50 final ──────────────────────────────────────────────────

describe('coverage invariant', () => {
  it('1) 50 ricette baseline restano 50 nel preview finale (tutti i chunk ok)', async () => {
    const baseline = mkBaseline(50);
    const { recipes, diag } = await enrichBaselineWithAiChunks(baseline, fakeNormalizer());
    expect(recipes).toHaveLength(50);
    expect(diag.finalCount).toBe(50);
    expect(diag.droppedCount).toBe(0);
    expect(diag.enrichedCount).toBe(50);
    expect(diag.chunkResults.every((c) => c.ok)).toBe(true);
    expect(recipes.every(qtyFilled)).toBe(true); // arricchimento applicato
  });

  it('2) fallimento parziale di un chunk preserva TUTTE le ricette', async () => {
    const baseline = mkBaseline(50);
    // chunkSize 6 → l'indice 0 vive nel primo chunk (0..5): quel chunk fallisce.
    const { recipes, diag } = await enrichBaselineWithAiChunks(baseline, fakeNormalizer({ failIndices: new Set([0]) }), { chunkSize: 6 });
    expect(recipes).toHaveLength(50);
    expect(diag.droppedCount).toBe(0);
    expect(diag.failedCount).toBe(6); // il chunk fallito (6 ricette)
    // Le ricette del chunk fallito restano baseline (qty vuota) + "Da confermare".
    expect(qtyEmpty(recipes[0])).toBe(true);
    expect(recipes[0].warnings.some((w) => w.startsWith('Da confermare'))).toBe(true);
    // Le altre sono arricchite.
    expect(qtyFilled(recipes[10])).toBe(true);
  });

  it('3) un subset AI più piccolo NON può rimpicciolire il set finale', async () => {
    const baseline = mkBaseline(50);
    // L'AI restituisce solo metà delle ricette di OGNI chunk (ne salta una su due).
    const omit = new Set(Array.from({ length: 50 }, (_, i) => i).filter((i) => i % 2 === 1));
    const { recipes, diag } = await enrichBaselineWithAiChunks(baseline, fakeNormalizer({ omitIndices: omit }));
    expect(recipes).toHaveLength(50);
    expect(diag.droppedCount).toBe(0);
    expect(diag.enrichedCount).toBe(25); // solo le pari sono state normalizzate
    expect(qtyFilled(recipes[0])).toBe(true); // pari → arricchita
    expect(qtyEmpty(recipes[1])).toBe(true); // dispari omessa → baseline intatta
  });

  it('4) l’arricchimento per-ricetta funziona in modo indipendente', async () => {
    const baseline = mkBaseline(12);
    const omit = new Set([3, 7]); // queste due NON arrivano dall'AI
    const { recipes } = await enrichBaselineWithAiChunks(baseline, fakeNormalizer({ omitIndices: omit }), { chunkSize: 4 });
    recipes.forEach((r, i) => {
      if (i === 3 || i === 7) expect(qtyEmpty(r)).toBe(true);
      else expect(qtyFilled(r)).toBe(true);
    });
  });

  it('5) JSON non valido in un chunk (→ normalizer null) non fa collassare l’import', async () => {
    const baseline = mkBaseline(20);
    // L'indice 12 vive in un chunk centrale: quel chunk "ritorna null" (come fa il
    // provider quando il JSON è invalido/troncato). Gli altri proseguono.
    const { recipes, diag } = await enrichBaselineWithAiChunks(baseline, fakeNormalizer({ failIndices: new Set([12]) }), { chunkSize: 6 });
    expect(recipes).toHaveLength(20);
    expect(diag.droppedCount).toBe(0);
    expect(diag.chunkResults.filter((c) => !c.ok)).toHaveLength(1); // un solo chunk ko
    expect(diag.chunkResults.filter((c) => c.ok).length).toBe(diag.chunkCount - 1);
  });

  it('eccezione del normalizer su un chunk → degrada, non lancia', async () => {
    const baseline = mkBaseline(10);
    const { recipes, diag } = await enrichBaselineWithAiChunks(baseline, fakeNormalizer({ throwIndices: new Set([0]) }), { chunkSize: 5 });
    expect(recipes).toHaveLength(10);
    expect(diag.droppedCount).toBe(0);
  });

  it('normalizer che ritorna sempre null (AI giù) → baseline intatto', async () => {
    const baseline = mkBaseline(7);
    const { recipes, diag } = await enrichBaselineWithAiChunks(baseline, async () => null);
    expect(recipes).toHaveLength(7);
    expect(diag.enrichedCount).toBe(0);
    expect(diag.droppedCount).toBe(0);
    expect(recipes.every((r) => r.warnings.some((w) => w.startsWith('Da confermare')))).toBe(true);
  });

  it('baseline vuoto → nessun chunk, nessun crash', async () => {
    const { recipes, diag } = await enrichBaselineWithAiChunks([], fakeNormalizer());
    expect(recipes).toHaveLength(0);
    expect(diag.chunkCount).toBe(0);
  });
});

// ── Fixture realistica: 50 ricette in formati disordinati ───────────────────────

describe('fixture realistica (50 ricette)', () => {
  it('parseText copre tutte le 50 e l’enrichment le mantiene 50', async () => {
    const baseline = parseText(TEXT_50);
    expect(baseline).toHaveLength(EXPECTED_RECIPE_COUNT);
    const { recipes, diag } = await enrichBaselineWithAiChunks(baseline, fakeNormalizer());
    expect(recipes).toHaveLength(EXPECTED_RECIPE_COUNT);
    expect(diag.droppedCount).toBe(0);
  });

  it('parseCsv copre tutte le 50 e l’enrichment le mantiene 50 (anche con metà chunk falliti)', async () => {
    const baseline = parseCsv(CSV_50);
    expect(baseline).toHaveLength(EXPECTED_RECIPE_COUNT);
    const failEven = new Set(Array.from({ length: 50 }, (_, i) => i).filter((i) => Math.floor(i / 6) % 2 === 0));
    const { recipes, diag } = await enrichBaselineWithAiChunks(baseline, fakeNormalizer({ failIndices: failEven }), { chunkSize: 6 });
    expect(recipes).toHaveLength(EXPECTED_RECIPE_COUNT);
    expect(diag.droppedCount).toBe(0);
  });
});

// ── Merge per-ricetta (adapter) ─────────────────────────────────────────────────

describe('enrichRecipeByLine', () => {
  const aiRecipe = (over: Partial<AiNormalizedRecipe> = {}): AiNormalizedRecipe =>
    aiNormalizeResultSchema.parse({
      recipes: [{
        index: 0, name: 'Tiramisù', nameConfidence: 0.9, portions: 8, ambiguityFlags: [],
        ingredients: [{ rawText: 'Savoiardi 400 g', name: 'Savoiardi', quantity: 400, unit: 'g', nameConfidence: 0.9, quantityConfidence: 0.9, unitConfidence: 0.9 }],
        ...over,
      }],
    }).recipes[0];

  const base: ParsedRecipe = {
    name: 'Tiramisù', basePortions: null, category: null, notes: null,
    ingredients: [{ rawText: 'Savoiardi 400', name: 'Savoiardi 400', quantity: null, unit: null, matchedProductId: null, matchedProductName: null, suggestions: [] }],
    warnings: ['Alcune quantità non sono state riconosciute.', 'Porzioni non rilevate: indicale prima di importare.'],
  };

  it('riempie i buchi quantità/unità e pulisce il nome con numero dentro', () => {
    const out = enrichRecipeByLine(base, aiRecipe());
    expect(out.ingredients[0].quantity).toBe(400);
    expect(out.ingredients[0].unit).toBe('g');
    expect(out.ingredients[0].name).toBe('Savoiardi'); // "Savoiardi 400" ripulito
    expect(out.basePortions).toBe(8); // porzioni riempite
    expect(out.warnings.some((w) => w.startsWith('Alcune quantità'))).toBe(false); // warning stale rimosso
    expect(out.warnings.some((w) => w.startsWith('Porzioni non'))).toBe(false);
  });

  it('NON sovrascrive una quantità già estratta dal parser', () => {
    const withQty: ParsedRecipe = { ...base, ingredients: [{ ...base.ingredients[0], quantity: 999, unit: 'g' }] };
    const out = enrichRecipeByLine(withQty, aiRecipe());
    expect(out.ingredients[0].quantity).toBe(999); // baseline vince sui valori già certi
  });

  it('AI con MENO righe non riduce le righe del baseline', () => {
    const twoLines: ParsedRecipe = { ...base, ingredients: [base.ingredients[0], { ...base.ingredients[0], name: 'Mascarpone', rawText: 'Mascarpone' }] };
    const out = enrichRecipeByLine(twoLines, aiRecipe()); // AI ha 1 sola riga
    expect(out.ingredients).toHaveLength(2);
  });
});

describe('markUnnormalized', () => {
  it('aggiunge "Da confermare" solo se ci sono buchi', () => {
    const withGap = mkBaseline(1)[0];
    expect(markUnnormalized(withGap).warnings.some((w) => w.startsWith('Da confermare'))).toBe(true);
    const full: ParsedRecipe = { ...withGap, ingredients: [{ ...withGap.ingredients[0], quantity: 1, unit: 'g' }, { ...withGap.ingredients[1], quantity: 1, unit: 'g' }], warnings: [] };
    expect(markUnnormalized(full).warnings).toHaveLength(0);
  });
});

describe('enrichByIndex', () => {
  it('mappa vuota → baseline invariato per lunghezza e ordine', () => {
    const baseline = mkBaseline(5);
    const out = enrichByIndex(baseline, new Map());
    expect(out).toHaveLength(5);
    expect(out.map((r) => r.name)).toEqual(baseline.map((r) => r.name));
  });
});

// ── 5. Il fallimento AI non ricollassa le righe già esplose dal baseline ────────

describe('blob già esploso nel baseline + AI', () => {
  const blobCsv =
    'Ricetta,Ingredienti\nTiramisù,"500 g mascarpone | 6 uova | 300 g savoiardi | 140 g zucchero | 350 ml caffè espresso"';

  it('baseline 5 righe + normalizer che FALLISCE → restano 5 righe', async () => {
    const baseline = parseCsv(blobCsv);
    expect(baseline[0].ingredients).toHaveLength(5); // split deterministico
    const { recipes, diag } = await enrichBaselineWithAiChunks(baseline, async () => null);
    expect(recipes[0].ingredients).toHaveLength(5); // AI giù → split preservato
    expect(diag.droppedCount).toBe(0);
  });

  it('baseline 5 righe + AI che restituisce MENO righe → restano 5 righe', async () => {
    const baseline = parseCsv(blobCsv);
    // L'AI normalizza solo le prime 2 righe della ricetta: non deve ridurne il numero.
    const partialLines: ChunkNormalizer = async (input) =>
      aiNormalizeResultSchema.parse({
        recipes: input.recipes.map((r) => ({
          index: r.index,
          name: r.name,
          nameConfidence: 0.9,
          portions: null,
          ambiguityFlags: [],
          ingredients: r.rawLines.slice(0, 2).map((rl) => ({
            rawText: rl, name: rl, quantity: 1, unit: 'g',
            nameConfidence: 0.9, quantityConfidence: 0.9, unitConfidence: 0.9,
          })),
        })),
      });
    const { recipes } = await enrichBaselineWithAiChunks(baseline, partialLines);
    expect(recipes[0].ingredients).toHaveLength(5);
  });
});
