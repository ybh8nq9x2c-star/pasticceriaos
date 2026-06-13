import { describe, it, expect } from 'vitest';
import {
  normalizeUnit,
  parseQuantity,
  parseIngredientLine,
  parsePortions,
  parseText,
  parseCsv,
} from '../parse';

describe('parseQuantity', () => {
  it('virgola, frazioni, interi', () => {
    expect(parseQuantity('1,5')).toBe(1.5);
    expect(parseQuantity('1/2')).toBe(0.5);
    expect(parseQuantity('500')).toBe(500);
  });
  it('non valido o non positivo → null', () => {
    expect(parseQuantity('')).toBeNull();
    expect(parseQuantity('abc')).toBeNull();
    expect(parseQuantity('0')).toBeNull();
  });
});

describe('normalizeUnit', () => {
  it('sinonimi → unità canonica', () => {
    expect(normalizeUnit('g')).toBe('g');
    expect(normalizeUnit('gr')).toBe('g');
    expect(normalizeUnit('grammi')).toBe('g');
    expect(normalizeUnit('Kg')).toBe('kg');
    expect(normalizeUnit('litri')).toBe('l');
    expect(normalizeUnit('pezzi')).toBe('pz');
    expect(normalizeUnit('g.')).toBe('g');
  });
  it('sconosciuta/ambigua → null', () => {
    expect(normalizeUnit('cucchiaio')).toBeNull();
    expect(normalizeUnit('')).toBeNull();
    expect(normalizeUnit(null)).toBeNull();
  });
});

describe('parseIngredientLine', () => {
  it('quantità+unità+nome', () => {
    expect(parseIngredientLine('500 g farina')).toEqual({ name: 'farina', quantity: 500, unit: 'g' });
    expect(parseIngredientLine('1/2 kg burro')).toEqual({ name: 'burro', quantity: 0.5, unit: 'kg' });
  });
  it('quantità senza unità ("2 uova")', () => {
    expect(parseIngredientLine('2 uova')).toEqual({ name: 'uova', quantity: 2, unit: null });
  });
  it('quantità in coda', () => {
    expect(parseIngredientLine('Farina 00: 500 g')).toEqual({ name: 'Farina 00', quantity: 500, unit: 'g' });
    expect(parseIngredientLine('Mascarpone 250 gr')).toEqual({ name: 'Mascarpone', quantity: 250, unit: 'g' });
  });
  it('prefisso lista', () => {
    expect(parseIngredientLine('- 300 g zucchero')).toEqual({ name: 'zucchero', quantity: 300, unit: 'g' });
  });
  it('righe non-ingrediente → null', () => {
    expect(parseIngredientLine('Montare le uova a neve')).toBeNull();
    expect(parseIngredientLine('Preparazione')).toBeNull();
    expect(parseIngredientLine('')).toBeNull();
  });
});

describe('parsePortions', () => {
  it('parentesi e parola', () => {
    expect(parsePortions('Tiramisù (8 porzioni)')).toBe(8);
    expect(parsePortions('(12 pezzi)')).toBe(12);
    expect(parsePortions('per 8 persone')).toBe(8);
    expect(parsePortions('Resa: 20')).toBe(20);
  });
  it('non confonde numeri generici', () => {
    expect(parsePortions('cuoci per 8 minuti')).toBeNull();
    expect(parsePortions('ciao mondo')).toBeNull();
  });
});

describe('parseText — multi-ricetta', () => {
  it('due ricette separate da riga vuota, titolo con resa', () => {
    const out = parseText(
      [
        'Tiramisù (8 porzioni)',
        '500 g mascarpone',
        '6 uova',
        '300 g savoiardi',
        '',
        'Crostata',
        '500 g farina',
        '200 g burro',
      ].join('\n'),
    );
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe('Tiramisù');
    expect(out[0].basePortions).toBe(8);
    expect(out[0].ingredients.map((i) => i.name)).toEqual(['mascarpone', 'uova', 'savoiardi']);
    expect(out[1].name).toBe('Crostata');
    expect(out[1].basePortions).toBeNull();
    expect(out[1].ingredients).toHaveLength(2);
  });

  it('titolo isolato (riga vuota tra titolo e ingredienti)', () => {
    const out = parseText('Pan di Spagna\n\n6 uova\n170 g zucchero');
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Pan di Spagna');
    expect(out[0].ingredients).toHaveLength(2);
  });

  it('header e istruzioni: header scartato, istruzione → nota', () => {
    const out = parseText('Frolla\nIngredienti:\n500 g farina\nLavorare a freddo');
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Frolla');
    expect(out[0].ingredients).toHaveLength(1);
    expect(out[0].notes).toContain('Lavorare a freddo');
  });

  it('testo senza struttura → nessuna ricetta', () => {
    expect(parseText('Questo è solo un appunto senza dosi.')).toHaveLength(0);
  });
});

describe('parseCsv', () => {
  it('colonna ricetta → raggruppa per ricetta', () => {
    const out = parseCsv(
      ['ricetta,ingrediente,quantita,unita', 'Tiramisù,Mascarpone,500,g', 'Tiramisù,Uova,6,pz', 'Crostata,Farina,500,g'].join('\n'),
    );
    expect(out).toHaveLength(2);
    const tira = out.find((r) => r.name === 'Tiramisù')!;
    expect(tira.ingredients).toHaveLength(2);
    expect(tira.ingredients[0]).toMatchObject({ name: 'Mascarpone', quantity: 500, unit: 'g' });
  });

  it('delimitatore ; e colonna porzioni numerica', () => {
    const out = parseCsv(['Ricetta;Ingrediente;Quantità;UM;Porzioni', 'Pane;Farina;1;kg;4', 'Pane;Acqua;600;ml;4'].join('\n'));
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Pane');
    expect(out[0].basePortions).toBe(4);
    expect(out[0].ingredients).toHaveLength(2);
  });

  it('senza colonna ricetta → singola ricetta da rinominare', () => {
    const out = parseCsv(['ingrediente,quantita,unita', 'Farina,500,g', 'Burro,250,g'].join('\n'));
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Ricetta importata');
    expect(out[0].ingredients).toHaveLength(2);
    expect(out[0].warnings.join(' ')).toMatch(/rinominala/i);
  });

  it('CSV vuoto/insufficiente → nessuna ricetta', () => {
    expect(parseCsv('solo una riga')).toHaveLength(0);
  });
});
