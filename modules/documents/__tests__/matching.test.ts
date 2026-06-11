// =============================================================================
// Regressione BUG-03: matching documento↔ordine con righe senza ID.
// normalizeName è la chiave del fallback per nome: deve essere identica alla
// semantica del ponte di ricezione (lower/trim) + collasso spazi.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { normalizeName } from '../matching';

describe('BUG-03 · normalizeName (fallback matching per nome)', () => {
  it('case-insensitive e trim (semantica receive_marketplace_order)', () => {
    expect(normalizeName('  Farina 00 ')).toBe('farina 00');
    expect(normalizeName('FARINA 00')).toBe(normalizeName('farina 00'));
  });

  it('collassa spazi multipli interni', () => {
    expect(normalizeName('Burro  82%   m.g.')).toBe('burro 82% m.g.');
  });

  it('null/undefined/vuoto → stringa vuota (nessun match accidentale)', () => {
    expect(normalizeName(null)).toBe('');
    expect(normalizeName(undefined)).toBe('');
    expect(normalizeName('   ')).toBe('');
  });

  it('le 8 righe del DDT dell\'audit matchano le righe ordine omonime', () => {
    const docLines = [
      'Burro 82% m.g.', 'Cacao amaro in polvere', 'Cioccolato fondente 70%',
      'farina 00', 'Mascarpone', 'Savoiardi', 'Uova fresche cat. A', 'Zucchero semolato',
    ];
    const orderNames = [
      'Burro 82% m.g.', 'Cacao amaro in polvere', 'Cioccolato fondente 70%',
      'farina 00', 'Mascarpone', 'Savoiardi', 'Uova fresche cat. A', 'Zucchero semolato',
    ];
    const orderIndex = new Map(orderNames.map((n, i) => [normalizeName(n), i]));
    const matched = docLines.filter((d) => orderIndex.has(normalizeName(d)));
    expect(matched).toHaveLength(8); // pre-fix: 0 match → 16 false anomalie
  });

  it('nomi diversi NON matchano (le anomalie vere restano)', () => {
    expect(normalizeName('Farina 00 W260 sacco 25kg')).not.toBe(normalizeName('farina 00'));
  });
});
