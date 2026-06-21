import { describe, it, expect, afterEach } from 'vitest';
import { adaptAiRecipes, adaptAiMapping, aiReadinessSummary, quantityCoverage, enrichWithAi, mergeAiIntoBaseline } from '../adapter';
import { isAiImportAvailable } from '../provider';
import type { AiImportResult } from '../contract';
import type { ParsedRecipe } from '../../types';

function result(partial: Partial<AiImportResult>): AiImportResult {
  return { recipes: [], columnMapping: null, overallConfidence: 0.8, ...partial };
}

const ing = (over: Partial<AiImportResult['recipes'][number]['ingredients'][number]> = {}) => ({
  rawText: '',
  name: 'Farina',
  quantity: 200,
  unit: 'g' as const,
  nameConfidence: 0.9,
  quantityConfidence: 0.9,
  unitConfidence: 0.9,
  catalogMatchName: null,
  ambiguous: false,
  ...over,
});

const recipe = (over: Partial<AiImportResult['recipes'][number]> = {}) => ({
  name: 'Torta',
  nameConfidence: 0.9,
  portions: 8,
  category: null,
  notes: null,
  ingredients: [ing()],
  ambiguityFlags: [],
  confidence: 0.9,
  ...over,
});

describe('adaptAiRecipes', () => {
  it('campi ad alta confidenza → pre-compilati', () => {
    const out = adaptAiRecipes(result({ recipes: [recipe()] }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: 'Torta', basePortions: 8 });
    expect(out[0].ingredients[0]).toMatchObject({ name: 'Farina', quantity: 200, unit: 'g' });
    expect(out[0].warnings).toEqual([]);
  });

  it('quantità a bassa confidenza → null + warning (niente invenzioni)', () => {
    const out = adaptAiRecipes(result({ recipes: [recipe({ ingredients: [ing({ quantity: 999, quantityConfidence: 0.2 })] })] }));
    expect(out[0].ingredients[0].quantity).toBeNull();
    expect(out[0].warnings.join(' ')).toMatch(/quantità incerta/i);
  });

  it('unità non canonica → null + warning', () => {
    const out = adaptAiRecipes(
      result({ recipes: [recipe({ ingredients: [ing({ unit: 'cucchiaio' as never, unitConfidence: 0.9 })] })] }),
    );
    expect(out[0].ingredients[0].unit).toBeNull();
    expect(out[0].warnings.join(' ')).toMatch(/unità ambigua/i);
  });

  it('nome ricetta mancante → nome provvisorio + warning', () => {
    const out = adaptAiRecipes(result({ recipes: [recipe({ name: null, nameConfidence: 0.1 })] }));
    expect(out[0].name).toBe('Ricetta 1');
    expect(out[0].warnings.join(' ')).toMatch(/provvisorio/i);
  });

  it('ambiguityFlags dell’AI passano nei warning', () => {
    const out = adaptAiRecipes(result({ recipes: [recipe({ ambiguityFlags: ['Resa non chiara'] })] }));
    expect(out[0].warnings).toContain('Resa non chiara');
  });
});

describe('adaptAiMapping', () => {
  it('mappatura sicura con ingrediente → ResolvedMapping', () => {
    const out = adaptAiMapping(
      result({ columnMapping: { fields: ['recipe', 'ingredient', 'quantity', 'unit'], hasHeader: true, confidence: 0.9 } }),
    );
    expect(out).toEqual({ fields: ['recipe', 'ingredient', 'quantity', 'unit'], hasHeader: true });
  });

  it('bassa confidenza → null (resta auto-detect + conferma utente)', () => {
    const out = adaptAiMapping(
      result({ columnMapping: { fields: ['ingredient', 'quantity'], hasHeader: true, confidence: 0.3 } }),
    );
    expect(out).toBeNull();
  });

  it('senza colonna ingrediente → null', () => {
    const out = adaptAiMapping(
      result({ columnMapping: { fields: ['recipe', 'quantity'], hasHeader: true, confidence: 0.95 } }),
    );
    expect(out).toBeNull();
  });
});

describe('aiReadinessSummary', () => {
  it('conta le ricette da confermare', () => {
    const ok = adaptAiRecipes(result({ recipes: [recipe()] }));
    const flagged = adaptAiRecipes(result({ recipes: [recipe({ ingredients: [ing({ quantityConfidence: 0.1 })] })] }));
    const summary = aiReadinessSummary([...ok, ...flagged]);
    expect(summary).toEqual({ total: 2, needConfirmation: 1 });
  });
});

function recipeNamed(name: string, qtys: (number | null)[]): ParsedRecipe {
  return {
    name,
    basePortions: null,
    category: null,
    notes: null,
    warnings: [],
    ingredients: qtys.map((q, i) => ({
      rawText: '',
      name: `ing${i}`,
      quantity: q,
      unit: q != null ? ('g' as const) : null,
      matchedProductId: null,
      matchedProductName: null,
      suggestions: [],
    })),
  };
}
const recipeWith = (qtys: (number | null)[]) => recipeNamed('R', qtys);

describe('coverage-preserving merge (mergeAiIntoBaseline / enrichWithAi)', () => {
  it('quantityCoverage conta le quantità popolate', () => {
    expect(quantityCoverage([recipeWith([400, null, 200])])).toBe(2);
    expect(quantityCoverage([])).toBe(0);
  });

  it('un set AI più PICCOLO non sostituisce un baseline più grande (copertura 30)', () => {
    const baseline = Array.from({ length: 30 }, (_, i) => recipeNamed(`R${i}`, [null])); // 30 righe, qty nulle
    const ai = [recipeNamed('R0', [400, 200]), recipeNamed('R1', [300])]; // l'AI ha visto solo 2 campioni
    const merged = mergeAiIntoBaseline(baseline, ai);
    expect(merged).toHaveLength(30); // ← nessuna delle 30 ricette viene persa
  });

  it('arricchisce le ricette combacianti per nome (diacritici inclusi), le altre invariate', () => {
    const baseline = [recipeNamed('Tiramisù', [null]), recipeNamed('Crostata', [null])];
    const ai = [recipeNamed('Tiramisu', [500, 200, 300])]; // match per nome, ingredienti normalizzati
    const merged = mergeAiIntoBaseline(baseline, ai);
    expect(merged).toHaveLength(2); // copertura preservata
    expect(quantityCoverage([merged[0]])).toBe(3); // Tiramisù arricchita dall'AI
    expect(quantityCoverage([merged[1]])).toBe(0); // Crostata invariata (AI non l'ha coperta)
  });

  it('non sostituisce ingredienti se l’AI è meno normalizzata del baseline', () => {
    const baseline = [recipeNamed('A', [1, 2, 3])]; // già 3 qty
    const ai = [recipeNamed('A', [1])]; // peggiore
    expect(quantityCoverage(enrichWithAi(baseline, ai))).toBe(3);
  });

  it('AI completo (≥ baseline) → vince il set AI normalizzato', () => {
    const baseline = [recipeNamed('A', [null]), recipeNamed('B', [null])];
    const ai = [recipeNamed('A', [1]), recipeNamed('B', [2]), recipeNamed('C', [3])];
    expect(mergeAiIntoBaseline(baseline, ai)).toBe(ai);
  });
});

describe('isAiImportAvailable', () => {
  const orig = { a: process.env.ANTHROPIC_API_KEY, g: process.env.GEMINI_API_KEY };
  const restore = (k: 'ANTHROPIC_API_KEY' | 'GEMINI_API_KEY', v: string | undefined) => {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  };
  afterEach(() => {
    restore('ANTHROPIC_API_KEY', orig.a);
    restore('GEMINI_API_KEY', orig.g);
  });

  it('false senza nessuna key (feature spenta → fallback deterministico)', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    expect(isAiImportAvailable()).toBe(false);
  });

  it('true con Gemini key', () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.GEMINI_API_KEY = 'gm-test';
    expect(isAiImportAvailable()).toBe(true);
  });

  it('true con Anthropic key', () => {
    delete process.env.GEMINI_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    expect(isAiImportAvailable()).toBe(true);
  });
});
