// =============================================================================
// modules/reporting/finished-goods.ts
// FASE 1 — Rimanenza teorica prodotti finiti. Logica PURA di mapping della riga
// della vista v_finished_goods_daily_theoretical → DTO.
//
// L'ARITMETICA (produced − sold) e le ESCLUSIONI (vendite con recipe_id NULL,
// vendite reversed/void, solo piani completati) sono di competenza della VISTA SQL
// (migration 046) e sono verificate end-to-end dallo smoke transazionale su staging.
// Qui isoliamo solo la trasformazione TS, con UNA garanzia esplicita: la rimanenza
// negativa NON viene mai azzerata/corretta (vincolo: "mostra as-is"). File senza
// import server → unit-testabile nel runtime node di vitest.
// =============================================================================

import type { FinishedGoodTheoretical } from './types';

/** Forma grezza di una riga della vista (i numeri possono arrivare come stringa). */
export interface FinishedGoodViewRow {
  sellable_product_id: string;
  product_name: string;
  produced_qty: number | string | null;
  sold_qty: number | string | null;
  remaining_theoretical: number | string | null;
}

const toNum = (v: number | string | null | undefined): number =>
  v === null || v === undefined ? 0 : Number(v);

/**
 * Mappa una riga della vista nel DTO. NON ricalcola, NON clampa: copia fedelmente
 * i valori derivati dalla vista (inclusa una rimanenza negativa).
 */
export function toFinishedGoodTheoretical(row: FinishedGoodViewRow): FinishedGoodTheoretical {
  return {
    sellableProductId:    row.sellable_product_id,
    productName:          row.product_name,
    producedQty:          toNum(row.produced_qty),
    soldQty:              toNum(row.sold_qty),
    remainingTheoretical: toNum(row.remaining_theoretical),
  };
}
