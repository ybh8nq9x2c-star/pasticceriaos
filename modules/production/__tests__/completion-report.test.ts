import { describe, it, expect } from 'vitest';
import { toCompletionReport } from '../completion-report';

describe('toCompletionReport (060)', () => {
  it('piano pre-060 o non completato → null', () => {
    expect(toCompletionReport(null)).toBeNull();
    expect(toCompletionReport(undefined)).toBeNull();
    expect(toCompletionReport('x')).toBeNull();
  });

  it('mappa consumi FEFO, righe saltate e accrediti incompleti', () => {
    const r = toCompletionReport({
      version: 5,
      consumed: [{
        ingredient_name: 'Farina', quantity: 400, unit: 'g', untracked_quantity: 0,
        lots: [
          { lot_number: 'EARLY', expiry_date: '2026-11-28', quantity: 300, unit: 'g' },
          { lot_number: 'LATE', expiry_date: '2026-12-06', quantity: 100, unit: 'g' },
        ],
      }],
      skipped: [{
        recipe_name: 'Biscotto', ingredient_name: 'Zucchero', quantity: 50,
        recipe_unit: 'g', stock_unit: 'pz', reason: 'unit_incompatible',
      }],
      output: [
        { recipe_name: 'Pane', quantity: 20, ingredients_complete: true },
        { recipe_name: 'Biscotto', quantity: 20, ingredients_complete: false },
      ],
    });
    expect(r).not.toBeNull();
    expect(r!.consumed[0].lots.map((l) => l.lotNumber)).toEqual(['EARLY', 'LATE']);
    expect(r!.skipped).toHaveLength(1);
    expect(r!.skipped[0]).toMatchObject({ ingredientName: 'Zucchero', reason: 'unit_incompatible', stockUnit: 'pz' });
    expect(r!.output.find((o) => o.recipeName === 'Biscotto')!.ingredientsComplete).toBe(false);
    expect(r!.output.find((o) => o.recipeName === 'Pane')!.ingredientsComplete).toBe(true);
  });

  it('motivo sconosciuto non diventa mai "ok": ricade su unit_incompatible', () => {
    const r = toCompletionReport({ skipped: [{ reason: '???' }], consumed: [], output: [] });
    expect(r!.skipped[0].reason).toBe('unit_incompatible');
  });
});
