// =============================================================================
// FASE 1 — Rimanenza teorica prodotti finiti.
//
// L'ARITMETICA (produced − sold) e le ESCLUSIONI (vendite con recipe_id NULL,
// vendite reversed/void, solo piani completati) vivono nella VISTA SQL
// (migration 046) e sono già verificate end-to-end dallo smoke transazionale su
// staging — risultati: Biscotto −2 (rimanenza negativa), Cornetto 18, Monoporzione
// 5 (positivi), vendite stornate/non risolte escluse, zero-vendite → sold 0.
//
// Qui copriamo il LIVELLO TS: il mapper deve copiare i valori derivati dalla vista
// SENZA ricalcolare e SENZA azzerare/correggere la rimanenza negativa (vincolo:
// "mostra as-is"). Le righe già escluse dalla vista non arrivano mai al mapper.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { toFinishedGoodTheoretical, type FinishedGoodViewRow } from '../finished-goods';

const row = (over: Partial<FinishedGoodViewRow>): FinishedGoodViewRow => ({
  sellable_product_id: 'rec-1',
  product_name: 'Cornetto',
  produced_qty: 0,
  sold_qty: 0,
  wasted_qty: 0,
  remaining_theoretical: 0,
  ...over,
});

describe('toFinishedGoodTheoretical (FASE 1)', () => {
  // a) prodotto + vendite → rimanenza positiva, copiata fedelmente dalla vista
  it('a) produzione con vendite: remaining positivo invariato', () => {
    const out = toFinishedGoodTheoretical(
      row({ produced_qty: 20, sold_qty: 5, remaining_theoretical: 15 }),
    );
    expect(out.producedQty).toBe(20);
    expect(out.soldQty).toBe(5);
    expect(out.remainingTheoretical).toBe(15);
  });

  // b) prodotto senza vendite → remaining == produced
  it('b) produzione senza vendite: remaining == produced', () => {
    const out = toFinishedGoodTheoretical(
      row({ produced_qty: 18, sold_qty: 0, remaining_theoretical: 18 }),
    );
    expect(out.soldQty).toBe(0);
    expect(out.remainingTheoretical).toBe(18);
  });

  // c) sold_qty assente (NULL dalla left join) → coerciato a 0, mai NaN
  it('c) sold_qty NULL → 0 (nessun NaN)', () => {
    const out = toFinishedGoodTheoretical(
      row({ produced_qty: 12, sold_qty: null, remaining_theoretical: 12 }),
    );
    expect(out.soldQty).toBe(0);
    expect(Number.isNaN(out.soldQty)).toBe(false);
    expect(out.remainingTheoretical).toBe(12);
  });

  // d) rimanenza negativa → mostrata as-is, MAI azzerata/corretta (vincolo #7)
  it('d) remaining negativo NON viene clampato', () => {
    const out = toFinishedGoodTheoretical(
      row({ product_name: 'Biscotto', produced_qty: 10, sold_qty: 12, remaining_theoretical: -2 }),
    );
    expect(out.remainingTheoretical).toBe(-2);
    expect(out.remainingTheoretical).toBeLessThan(0);
  });

  // e) prodotti non mappati / vendite non risolte: esclusi A MONTE dalla vista,
  //    quindi non raggiungono mai il mapper. A valle, il mapper non fabbrica né
  //    scarta righe: mappa 1:1 esattamente ciò che la vista restituisce.
  it('e) mapping 1:1 sulle sole righe fornite dalla vista (nessuna riga inventata/scartata)', () => {
    const rows = [
      row({ sellable_product_id: 'rec-1', product_name: 'Cornetto', produced_qty: 20, sold_qty: 2, remaining_theoretical: 18 }),
      row({ sellable_product_id: 'rec-2', product_name: 'Monoporzione', produced_qty: 8, sold_qty: 3, remaining_theoretical: 5 }),
    ];
    const out = rows.map(toFinishedGoodTheoretical);
    expect(out).toHaveLength(2);
    expect(out.map((o) => o.sellableProductId)).toEqual(['rec-1', 'rec-2']);
    expect(out.map((o) => o.remainingTheoretical)).toEqual([18, 5]);
  });

  // f) invenduto registrato (056): wasted copiato dalla vista, remaining già
  //    al netto (produced − sold − wasted, calcolato in SQL, mai ricalcolato qui)
  it('f) wasted_qty copiato as-is; NULL → 0', () => {
    const out = toFinishedGoodTheoretical(
      row({ produced_qty: 20, sold_qty: 12, wasted_qty: 5, remaining_theoretical: 3 }),
    );
    expect(out.wastedQty).toBe(5);
    expect(out.remainingTheoretical).toBe(3);
    expect(toFinishedGoodTheoretical(row({ wasted_qty: null })).wastedQty).toBe(0);
  });

  it('numeri come stringa (numeric SQL) → coerciati a number', () => {
    const out = toFinishedGoodTheoretical(
      row({ produced_qty: '20', sold_qty: '5.5', remaining_theoretical: '14.5' }),
    );
    expect(out.producedQty).toBe(20);
    expect(out.soldQty).toBe(5.5);
    expect(out.remainingTheoretical).toBe(14.5);
  });
});
