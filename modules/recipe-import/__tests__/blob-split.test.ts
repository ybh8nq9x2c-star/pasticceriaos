// =============================================================================
// Esplosione dei BLOB ingredienti delimitati (|, ;, a-capo). Una ricetta con gli
// ingredienti in un'unica stringa delimitata DEVE produrre N righe in preview,
// non 1 — in modo DETERMINISTICO, senza dipendere dall'AI.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { splitIngredientBlob, parseCsv, parseCsvWithMapping, parseText } from '../parse';
import type { ImportColumnField } from '../types';

const TIRAMISU_PIPE = '500 g mascarpone | 6 uova | 300 g savoiardi | 140 g zucchero | 350 ml caffè espresso';

describe('splitIngredientBlob (puro)', () => {
  it('pipe', () => {
    expect(splitIngredientBlob('a | b | c')).toEqual(['a', 'b', 'c']);
  });
  it('punto e virgola', () => {
    expect(splitIngredientBlob('a; b; c')).toEqual(['a', 'b', 'c']);
  });
  it('a-capo', () => {
    expect(splitIngredientBlob('a\nb\nc')).toEqual(['a', 'b', 'c']);
  });
  it('delimitatori misti + vuoti scartati', () => {
    expect(splitIngredientBlob('a |; b |\n| c |')).toEqual(['a', 'b', 'c']);
  });
  it('nessun delimitatore → un solo pezzo', () => {
    expect(splitIngredientBlob('500 g farina 00')).toEqual(['500 g farina 00']);
  });
  it('vuoto/null → []', () => {
    expect(splitIngredientBlob('')).toEqual([]);
    expect(splitIngredientBlob(null)).toEqual([]);
  });
});

const csv = (header: string, row: string) => `${header}\n${row}`;

describe('CSV: blob nella cella ingredienti → righe separate', () => {
  it('1) pipe-delimited → 5 righe', () => {
    const out = parseCsv(csv('Ricetta,Ingredienti,Porzioni', `Tiramisù,"${TIRAMISU_PIPE}",8`));
    expect(out).toHaveLength(1);
    expect(out[0].ingredients).toHaveLength(5);
  });

  it('2) semicolon-delimited → 5 righe', () => {
    const blob = '500 g mascarpone; 6 uova; 300 g savoiardi; 140 g zucchero; 350 ml caffè espresso';
    const out = parseCsv(csv('Ricetta,Ingredienti', `Tiramisù,"${blob}"`));
    expect(out[0].ingredients).toHaveLength(5);
  });

  it('3) newline-delimited (cella quotata multilinea) → 5 righe', () => {
    const blob = '500 g mascarpone\n6 uova\n300 g savoiardi\n140 g zucchero\n350 ml caffè espresso';
    const out = parseCsv(csv('Ricetta,Ingredienti', `Tiramisù,"${blob}"`));
    expect(out[0].ingredients).toHaveLength(5);
  });

  it('4) parse parziale: pezzi senza quantità creano comunque righe separate', () => {
    const out = parseCsv(csv('Ricetta,Ingredienti', 'Dolce,"burro | 200 g zucchero | sale q.b."'));
    expect(out[0].ingredients).toHaveLength(3);
    expect(out[0].ingredients.map((l) => l.name)).toEqual(['burro', 'zucchero', expect.stringContaining('sale')]);
    expect(out[0].ingredients[1].quantity).toBe(200); // il pezzo con qty è normalizzato
    expect(out[0].ingredients[0].quantity).toBeNull(); // quello senza resta riga, qty vuota
  });

  it('6) esempio tiramisu realistico → 5 righe con qty/unit corrette', () => {
    const out = parseCsv(csv('Ricetta,Ingredienti', `Tiramisù,"${TIRAMISU_PIPE}"`));
    const ings = out[0].ingredients;
    expect(ings).toHaveLength(5);
    expect(ings.map((l) => [l.name, l.quantity, l.unit])).toEqual([
      ['mascarpone', 500, 'g'],
      ['uova', 6, null],
      ['savoiardi', 300, 'g'],
      ['zucchero', 140, 'g'],
      ['caffè espresso', 350, 'ml'],
    ]);
  });

  it('regressione: ingrediente singolo (una riga per ingrediente) resta 1 riga', () => {
    const out = parseCsv(csv('Ricetta,Ingrediente,Quantità,Unità', 'Tiramisù,Mascarpone,500,g\nTiramisù,Uova,6,pz'));
    expect(out).toHaveLength(1);
    expect(out[0].ingredients).toHaveLength(2);
    expect(out[0].ingredients[0]).toMatchObject({ name: 'Mascarpone', quantity: 500, unit: 'g' });
  });
});

describe('CSV mapping esplicito: blob su colonna ingrediente', () => {
  it('newline blob con mappatura utente → 5 righe', () => {
    const blob = '500 g mascarpone\n6 uova\n300 g savoiardi\n140 g zucchero\n350 ml caffè';
    const fields: ImportColumnField[] = ['recipe', 'ingredient'];
    const out = parseCsvWithMapping(csv('Nome,Ingredienti', `Tiramisù,"${blob}"`), fields, true);
    expect(out[0].ingredients).toHaveLength(5);
  });
});

describe('TEXT: blob su singola riga → righe separate', () => {
  it('riga pipe-delimited dentro un blocco → 5 righe', () => {
    const out = parseText(`Tiramisù\n${TIRAMISU_PIPE}`);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Tiramisù');
    expect(out[0].ingredients).toHaveLength(5);
  });

  it('titolo con separatore ma senza ingredienti NON viene spezzato in ingredienti', () => {
    const out = parseText('Dolci della tradizione | classici\n\n300 g farina\n2 uova');
    // Il primo blocco è un titolo (nessun pezzo è ingrediente) → diventa il nome.
    expect(out).toHaveLength(1);
    expect(out[0].ingredients).toHaveLength(2);
  });
});
