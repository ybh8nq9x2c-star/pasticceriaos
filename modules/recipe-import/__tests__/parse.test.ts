import { describe, it, expect } from 'vitest';
import {
  normalizeUnit,
  parseQuantity,
  parseIngredientLine,
  parsePortions,
  parseText,
  parseCsv,
  inspectCsv,
  parseCsvWithMapping,
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
  it('numero misto e frazioni unicode', () => {
    expect(parseQuantity('1 1/2')).toBe(1.5);
    expect(parseQuantity('½')).toBe(0.5);
    expect(parseQuantity('1½')).toBe(1.5);
    expect(parseQuantity('¾')).toBe(0.75);
  });
  it('intervallo → estremo inferiore', () => {
    expect(parseQuantity('2-3')).toBe(2);
    expect(parseQuantity('2–3')).toBe(2); // en dash
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
  it('sinonimi aggiuntivi (cc, chilogrammo, busta)', () => {
    expect(normalizeUnit('cc')).toBe('ml');
    expect(normalizeUnit('chilogrammo')).toBe('kg');
    expect(normalizeUnit('busta')).toBe('bustina');
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
  it('parola-misura non canonica → tolta dal nome, unità da confermare', () => {
    expect(parseIngredientLine('2 cucchiai di zucchero')).toEqual({ name: 'zucchero', quantity: 2, unit: null });
    expect(parseIngredientLine('½ tazza panna')).toEqual({ name: 'panna', quantity: 0.5, unit: null });
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

  it('intestazioni con sinonimi larghi (piatto/componente/peso/misura)', () => {
    const out = parseCsv(
      ['piatto,componente,peso,misura', 'Torta,Farina,200,g', 'Torta,Burro,100,g'].join('\n'),
    );
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Torta');
    expect(out[0].ingredients).toHaveLength(2);
    expect(out[0].ingredients[0]).toMatchObject({ name: 'Farina', quantity: 200, unit: 'g' });
  });

  it('CSV vuoto/insufficiente → nessuna ricetta', () => {
    expect(parseCsv('solo una riga')).toHaveLength(0);
  });
});

describe('parseCsv — copertura colonna nome/name come ricetta (no collasso 30→1)', () => {
  const csv30 = (header: string) => {
    const rows = [header];
    for (let i = 1; i <= 30; i++) rows.push(`Ricetta ${i},Dolci,8,"500 g farina, 3 uova",Cuoci,Glutine`);
    return rows.join('\n');
  };

  it('header "nome" con colonna ingredienti separata → 30 ricette, non 1', () => {
    const out = parseCsv(csv30('nome,categoria,porzioni,ingredienti,istruzioni,allergeni'));
    expect(out).toHaveLength(30);
    expect(out.slice(0, 2).map((r) => r.name)).toEqual(['Ricetta 1', 'Ricetta 2']);
  });

  it('header "name" → 30 ricette', () => {
    expect(parseCsv(csv30('name,category,servings,ingredients,instructions,allergens'))).toHaveLength(30);
  });

  it('lista ingredienti "nome,quantità" (nessun ingrediente separato) → resta 1 ricetta', () => {
    const rows = ['nome,quantità'];
    for (let i = 1; i <= 5; i++) rows.push(`Farina ${i},500`);
    expect(parseCsv(rows.join('\n'))).toHaveLength(1);
  });
});

describe('inspectCsv', () => {
  it('header ambiguo (manca la quantità) → non confident, ma suggerisce ingrediente', () => {
    const insp = inspectCsv('Dolce,Ingrediente,Extra\nTiramisu,Mascarpone,vetro\nTiramisu,Uova,plastica');
    expect(insp.hasHeader).toBe(true);
    expect(insp.confident).toBe(false);
    expect(insp.columns).toHaveLength(3);
    expect(insp.columns[0].suggested).toBe('recipe');
    expect(insp.columns[1].suggested).toBe('ingredient');
  });

  it('header riconosciuto e completo → confident (salta il mapping)', () => {
    const insp = inspectCsv('ricetta,ingrediente,quantita,unita\nTorta,Farina,200,g');
    expect(insp.confident).toBe(true);
  });

  it('file senza intestazioni → rilevato (hasHeader false, colonne numerate)', () => {
    const insp = inspectCsv('Tiramisu,Mascarpone,500,g\nTiramisu,Uova,3,pz');
    expect(insp.hasHeader).toBe(false);
    expect(insp.confident).toBe(false);
    expect(insp.columns).toHaveLength(4);
    expect(insp.columns.every((c) => c.header === '')).toBe(true);
  });
});

describe('parseCsvWithMapping', () => {
  it('mappatura esplicita con intestazione', () => {
    const out = parseCsvWithMapping(
      'A,B,C,D\nTorta,Farina,200,g\nTorta,Burro,100,g',
      ['recipe', 'ingredient', 'quantity', 'unit'],
      true,
    );
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Torta');
    expect(out[0].ingredients).toHaveLength(2);
    expect(out[0].ingredients[0]).toMatchObject({ name: 'Farina', quantity: 200, unit: 'g' });
  });

  it('senza intestazione → la prima riga è un dato', () => {
    const out = parseCsvWithMapping(
      'Torta,Farina,200,g',
      ['recipe', 'ingredient', 'quantity', 'unit'],
      false,
    );
    expect(out).toHaveLength(1);
    expect(out[0].ingredients).toHaveLength(1);
    expect(out[0].ingredients[0]).toMatchObject({ name: 'Farina', quantity: 200, unit: 'g' });
  });

  it('allergeni confluiscono nelle note', () => {
    const out = parseCsvWithMapping(
      'r,i,q,a\nTorta,Farina,200,Glutine',
      ['recipe', 'ingredient', 'quantity', 'allergens'],
      true,
    );
    expect(out[0].notes).toContain('Glutine');
  });

  it('senza colonna ingrediente → nessuna ricetta', () => {
    expect(parseCsvWithMapping('a,b\n1,2', ['quantity', 'unit'], true)).toHaveLength(0);
  });
});
