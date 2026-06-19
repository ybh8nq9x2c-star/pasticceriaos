import { describe, it, expect, afterEach } from 'vitest';
import { adaptAiRecipes, adaptAiMapping, aiReadinessSummary } from '../adapter';
import { isAiImportAvailable } from '../provider';
import type { AiImportResult } from '../contract';

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

describe('isAiImportAvailable', () => {
  const original = process.env.ANTHROPIC_API_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = original;
  });

  it('false senza API key (feature spenta → fallback deterministico)', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(isAiImportAvailable()).toBe(false);
  });

  it('true con API key configurata', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    expect(isAiImportAvailable()).toBe(true);
  });
});
