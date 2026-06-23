import { describe, it, expect } from 'vitest';
import {
  explodeLine,
  aggregateSaleStatus,
  reverseMovements,
  netByIngredient,
  convertFactor,
  type Bom,
} from '../bom';

// 1 Cannoncino = 35 g pasta sfoglia + 25 g crema (base_portions = 1).
const cannoncino: Bom = {
  basePortions: 1,
  items: [
    { ingredientProductId: 'sfoglia', quantity: 35, unit: 'g', stockUnit: 'g' },
    { ingredientProductId: 'crema', quantity: 25, unit: 'g', stockUnit: 'g' },
  ],
};

// Tiramisù: batch da 8 porzioni, 280 g mascarpone → 35 g per unità venduta.
const tiramisu: Bom = {
  basePortions: 8,
  items: [{ ingredientProductId: 'mascarpone', quantity: 280, unit: 'g', stockUnit: 'g' }],
};

describe('explodeLine — singola vendita', () => {
  it('deduce gli ingredienti corretti per 1 unità', () => {
    const r = explodeLine(cannoncino, 1);
    expect(r.status).toBe('deducted');
    expect(r.movements).toEqual([
      { ingredientProductId: 'sfoglia', quantityDelta: -35, unit: 'g' },
      { ingredientProductId: 'crema', quantityDelta: -25, unit: 'g' },
    ]);
  });

  it('base_portions: 280 g / 8 porzioni = 35 g per unità venduta', () => {
    expect(explodeLine(tiramisu, 1).movements[0].quantityDelta).toBe(-35);
  });
});

describe('explodeLine — quantità multipla', () => {
  it('moltiplica per la quantità venduta (6 tiramisu → -210 g mascarpone)', () => {
    const r = explodeLine(tiramisu, 6);
    expect(r.movements[0]).toEqual({ ingredientProductId: 'mascarpone', quantityDelta: -210, unit: 'g' });
  });

  it('quantità decimale (1.5)', () => {
    expect(explodeLine(tiramisu, 1.5).movements[0].quantityDelta).toBe(-52.5);
  });
});

describe('ricevuta multi-riga → più BOM', () => {
  it('somma i movimenti di più righe (netByIngredient)', () => {
    const all = [...explodeLine(cannoncino, 2).movements, ...explodeLine(tiramisu, 6).movements];
    expect(netByIngredient(all)).toEqual({ sfoglia: -70, crema: -50, mascarpone: -210 });
  });
});

describe('BOM mancante / vuoto', () => {
  it('prodotto non collegato → unlinked, nessun movimento, eccezione', () => {
    const r = explodeLine(null, 3);
    expect(r.status).toBe('unlinked');
    expect(r.movements).toHaveLength(0);
    expect(r.exception).toMatch(/non collegato/i);
  });

  it('ricetta senza ingredienti → no_bom, nessun movimento', () => {
    const r = explodeLine({ basePortions: 8, items: [] }, 3);
    expect(r.status).toBe('no_bom');
    expect(r.movements).toHaveLength(0);
  });
});

describe('coerenza unità (regola #6)', () => {
  it('converte BOM in g → magazzino in kg', () => {
    const bom: Bom = { basePortions: 1, items: [{ ingredientProductId: 'farina', quantity: 500, unit: 'g', stockUnit: 'kg' }] };
    expect(explodeLine(bom, 2).movements[0]).toEqual({ ingredientProductId: 'farina', quantityDelta: -1, unit: 'kg' });
  });

  it('unità non convertibile (pz→g) → unit_mismatch, ingrediente saltato, altri dedotti', () => {
    const bom: Bom = {
      basePortions: 1,
      items: [
        { ingredientProductId: 'uova', quantity: 2, unit: 'pz', stockUnit: 'g' }, // non convertibile
        { ingredientProductId: 'zucchero', quantity: 100, unit: 'g', stockUnit: 'g' },
      ],
    };
    const r = explodeLine(bom, 1);
    expect(r.status).toBe('unit_mismatch');
    expect(r.movements).toEqual([{ ingredientProductId: 'zucchero', quantityDelta: -100, unit: 'g' }]);
    expect(convertFactor('pz', 'g')).toBeNull();
  });
});

describe('stock-agnostica (regola #7: allow + flag, niente blocco)', () => {
  it('produce il movimento anche per quantità enormi (andrebbe negativo)', () => {
    const r = explodeLine(tiramisu, 100000);
    expect(r.status).toBe('deducted');
    expect(r.movements[0].quantityDelta).toBe(-3500000); // nessun blocco sul saldo
  });
});

describe('storno (reverse)', () => {
  it('inverte il segno dei movimenti → saldo netto zero', () => {
    const ded = explodeLine(cannoncino, 2).movements;
    const rev = reverseMovements(ded);
    expect(netByIngredient([...ded, ...rev])).toEqual({ sfoglia: 0, crema: 0 });
  });
});

// INVARIANTE UNITÀ CANONICA (audit, rischio #1): la deduzione vendita DEVE
// emettere i movimenti SOLO nell'unità di MAGAZZINO (stockUnit). È la proprietà
// che mantiene le vendite coerenti con inventory_levels (il trigger somma i delta
// SENZA conversione: un movimento in un'unità diversa corromperebbe il saldo).
describe('invariante: i movimenti escono solo in stockUnit', () => {
  const mixed: Bom = {
    basePortions: 2,
    items: [
      { ingredientProductId: 'farina', quantity: 1000, unit: 'g', stockUnit: 'kg' }, // g→kg
      { ingredientProductId: 'latte', quantity: 500, unit: 'ml', stockUnit: 'l' }, // ml→l
      { ingredientProductId: 'zucchero', quantity: 200, unit: 'g', stockUnit: 'g' }, // identità
    ],
  };
  it('ogni movimento usa l’unità di magazzino dell’ingrediente', () => {
    const r = explodeLine(mixed, 4);
    expect(r.movements.map((m) => [m.ingredientProductId, m.unit])).toEqual([
      ['farina', 'kg'],
      ['latte', 'l'],
      ['zucchero', 'g'],
    ]);
    // magnitudini fisicamente corrette dopo conversione (per 4 unità, base 2):
    expect(r.movements.map((m) => m.quantityDelta)).toEqual([-2, -1, -400]);
  });
});

describe('stato vendita aggregato', () => {
  it('tutto dedotto → processed', () => {
    expect(aggregateSaleStatus(['deducted', 'deducted'])).toBe('processed');
  });
  it('alcuni dedotti → partially_linked', () => {
    expect(aggregateSaleStatus(['deducted', 'unlinked'])).toBe('partially_linked');
  });
  it('nessuno dedotto → unlinked', () => {
    expect(aggregateSaleStatus(['unlinked', 'no_bom'])).toBe('unlinked');
  });
});
