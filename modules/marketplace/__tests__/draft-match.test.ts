import { describe, it, expect } from 'vitest';
import { matchDraftLinesToCatalog } from '../draft-match';
import type { DraftLineForMatch, CatalogItemForMatch } from '../draft-match';

const catalog: CatalogItemForMatch[] = [
  { id: 'c-farina', name: 'Farina 00', unit: 'kg' },
  { id: 'c-latte', name: 'Latte intero', unit: 'l' },
  { id: 'c-uova', name: 'Uova', unit: 'pz' },
];

const line = (name: string, quantity: number, unit: DraftLineForMatch['unit']): DraftLineForMatch =>
  ({ name, quantity, unit });

describe('matchDraftLinesToCatalog', () => {
  it('match esatto nome+unità', () => {
    const r = matchDraftLinesToCatalog([line('Farina 00', 25, 'kg')], catalog);
    expect(r.initialQty).toEqual({ 'c-farina': '25' });
    expect(r.matchedCount).toBe(1);
    expect(r.unmatched).toEqual([]);
  });

  it('nome case/space-insensitive', () => {
    const r = matchDraftLinesToCatalog([line('  farina 00 ', 10, 'kg')], catalog);
    expect(r.initialQty).toEqual({ 'c-farina': '10' });
  });

  it('unità convertibile → quantità convertita (g → kg)', () => {
    const r = matchDraftLinesToCatalog([line('Farina 00', 2500, 'g')], catalog);
    expect(r.initialQty).toEqual({ 'c-farina': '2.5' });
    expect(r.unmatched).toEqual([]);
  });

  it('unità NON convertibile → unmatched con motivo, mai quantità sbagliata', () => {
    const r = matchDraftLinesToCatalog([line('Uova', 500, 'g')], catalog);
    expect(r.initialQty).toEqual({});
    expect(r.unmatched).toEqual([{ name: 'Uova', reason: 'unit_incompatible' }]);
  });

  it('nome assente dal catalogo → unmatched onesto', () => {
    const r = matchDraftLinesToCatalog([line('Zafferano', 3, 'g')], catalog);
    expect(r.unmatched).toEqual([{ name: 'Zafferano', reason: 'not_in_catalog' }]);
  });

  it('due righe bozza sullo stesso item → somma, non sovrascrittura', () => {
    const r = matchDraftLinesToCatalog(
      [line('Latte intero', 5, 'l'), line('latte intero', 2000, 'ml')],
      catalog,
    );
    expect(r.initialQty).toEqual({ 'c-latte': '7' });
    expect(r.matchedCount).toBe(2);
  });

  it('a parità di nome preferisce l\'item con la stessa unità', () => {
    const dupCatalog: CatalogItemForMatch[] = [
      { id: 'c-kg', name: 'Zucchero', unit: 'kg' },
      { id: 'c-g', name: 'Zucchero', unit: 'g' },
    ];
    const r = matchDraftLinesToCatalog([line('Zucchero', 500, 'g')], dupCatalog);
    expect(r.initialQty).toEqual({ 'c-g': '500' });
  });

  it('catalogo vuoto → tutto unmatched', () => {
    const r = matchDraftLinesToCatalog([line('Farina 00', 1, 'kg')], []);
    expect(r.matchedCount).toBe(0);
    expect(r.unmatched).toHaveLength(1);
  });
});
