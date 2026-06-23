// =============================================================================
// Parsing ingrediente: quantity-FIRST e quantity-LAST. La quantità/unità devono
// finire nei campi strutturati, mai restare embedded nel nome. Nomi multi-parola
// e nomi con numeri (es. "Farina 00") preservati. Fallback sicuro: riga incerta
// resta come riga separata (no collasso del blob).
// =============================================================================

import { describe, it, expect } from 'vitest';
import { parseIngredientLine, parseCsv, parseCsvWithMapping } from '../parse';
import type { ImportColumnField } from '../types';

describe('parseIngredientLine — quantity-first e quantity-last', () => {
  const cases: [string, string, number, string | null][] = [
    ['400 g Savoiardi', 'Savoiardi', 400, 'g'],        // 1) qty-first
    ['Savoiardi 400 g', 'Savoiardi', 400, 'g'],        // 2) qty-last
    ['6 pz Uova', 'Uova', 6, 'pz'],                    // 3) qty-first
    ['Uova 6 pz', 'Uova', 6, 'pz'],                    // 4) qty-last
    ['Caffe espresso 350 ml', 'Caffe espresso', 350, 'ml'], // 5) nome 2 parole
    ['Zucchero a velo 120 g', 'Zucchero a velo', 120, 'g'], // 6) nome 3 parole
    ['Farina 00 500 g', 'Farina 00', 500, 'g'],        // 7) nome con numero
  ];

  it.each(cases)('%s → nome/qty/unit puliti', (input, name, quantity, unit) => {
    const r = parseIngredientLine(input);
    expect(r).not.toBeNull();
    expect(r!.name).toBe(name);
    expect(r!.quantity).toBe(quantity);
    expect(r!.unit).toBe(unit);
    expect(/\d/.test(r!.name.replace(/\b00\b/, ''))).toBe(false); // niente qty residua nel nome
  });

  it('unità comuni g/kg/ml/l/pz tutte normalizzate (qty-last)', () => {
    expect(parseIngredientLine('Burro 250 g')).toMatchObject({ quantity: 250, unit: 'g' });
    expect(parseIngredientLine('Farina 1 kg')).toMatchObject({ quantity: 1, unit: 'kg' });
    expect(parseIngredientLine('Latte 500 ml')).toMatchObject({ quantity: 500, unit: 'ml' });
    expect(parseIngredientLine('Panna 1 l')).toMatchObject({ quantity: 1, unit: 'l' });
    expect(parseIngredientLine('Uova 3 pz')).toMatchObject({ quantity: 3, unit: 'pz' });
  });

  it('numero misto/ frazioni ancora ok (nessuna regressione)', () => {
    expect(parseIngredientLine('1 1/2 kg burro')).toMatchObject({ quantity: 1.5, unit: 'kg' });
    expect(parseIngredientLine('1/2 l latte')).toMatchObject({ quantity: 0.5, unit: 'l' });
    expect(parseIngredientLine('½ kg zucchero')).toMatchObject({ quantity: 0.5, unit: 'kg' });
  });

  it('8) riga incerta (nessuna quantità) → null, non un parse inventato', () => {
    expect(parseIngredientLine('sale q.b.')).toBeNull();
    expect(parseIngredientLine('un pizzico di sale')).toBeNull();
  });
});

const csv = (header: string, body: string) => `${header}\n${body}`;

describe('CSV: un ingrediente per riga con qty EMBEDDED (nessuna colonna quantità)', () => {
  it('estrae qty/unit dalla cella, nome ripulito (= bug live)', () => {
    const out = parseCsv(
      csv('Ricetta,Ingrediente', 'Tiramisù,Savoiardi 400 g\nTiramisù,Mascarpone 500 g\nTiramisù,Uova 6 pz'),
    );
    expect(out).toHaveLength(1);
    expect(out[0].ingredients.map((l) => [l.name, l.quantity, l.unit])).toEqual([
      ['Savoiardi', 400, 'g'],
      ['Mascarpone', 500, 'g'],
      ['Uova', 6, 'pz'],
    ]);
  });

  it('parse parziale (cella senza qty) → riga preservata col solo nome', () => {
    const out = parseCsv(csv('Ricetta,Ingrediente', 'Dolce,Savoiardi 400 g\nDolce,sale q.b.'));
    expect(out[0].ingredients).toHaveLength(2);
    expect(out[0].ingredients[1]).toMatchObject({ name: expect.stringContaining('sale'), quantity: null });
  });

  it('REGRESSIONE: con colonna quantità dedicata il nome NON viene stripato', () => {
    // "Farina 00" è il nome reale; la quantità è nella sua colonna.
    const out = parseCsv(csv('Ricetta,Ingrediente,Quantità,Unità', 'Pane,Farina 00,500,g'));
    expect(out[0].ingredients[0]).toMatchObject({ name: 'Farina 00', quantity: 500, unit: 'g' });
  });
});

describe('successo: tiramisu realistico quantity-last → tutti i campi popolati', () => {
  it('blob pipe quantity-last via mapping → 5 righe complete', () => {
    const blob = 'Savoiardi 400 g | Mascarpone 500 g | Uova 6 pz | Zucchero 140 g | Caffe espresso 350 ml';
    const fields: ImportColumnField[] = ['recipe', 'ingredient'];
    const out = parseCsvWithMapping(csv('Ricetta,Ingredienti', `Tiramisù,"${blob}"`), fields, true);
    expect(out[0].ingredients.map((l) => [l.name, l.quantity, l.unit])).toEqual([
      ['Savoiardi', 400, 'g'],
      ['Mascarpone', 500, 'g'],
      ['Uova', 6, 'pz'],
      ['Zucchero', 140, 'g'],
      ['Caffe espresso', 350, 'ml'],
    ]);
    expect(out[0].ingredients.every((l) => l.quantity !== null && l.unit !== null)).toBe(true);
  });
});
