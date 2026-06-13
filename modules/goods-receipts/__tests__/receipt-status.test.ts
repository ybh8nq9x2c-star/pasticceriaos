// =============================================================================
// Goods receipt engine — macchina a stati del receipt (pura, stessa semantica
// della RPC complete_purchase_receipt) + idempotenza del delta contabilizzato.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { computeReceiptStatus, linePostableDelta } from '../types';

type L = Parameters<typeof computeReceiptStatus>[0][number];

const line = (over: Partial<L>): L => ({
  lineStatus: 'matched',
  discrepancyReason: null,
  qtyExpected: null,
  qtyReceived: 0,
  ...over,
});

describe('computeReceiptStatus', () => {
  it('tutte le righe ricevute per intero → completed', () => {
    expect(
      computeReceiptStatus([
        line({ lineStatus: 'received', qtyExpected: 10, qtyReceived: 10 }),
        line({ lineStatus: 'received', qtyExpected: 5, qtyReceived: 5 }),
      ]),
    ).toBe('completed');
  });

  it('ricevimento libero (senza attese) con qty registrate → completed', () => {
    expect(
      computeReceiptStatus([line({ lineStatus: 'received', qtyReceived: 3 })]),
    ).toBe('completed');
  });

  it('riga sotto l\'atteso → partial', () => {
    expect(
      computeReceiptStatus([
        line({ lineStatus: 'received', qtyExpected: 10, qtyReceived: 10 }),
        line({ lineStatus: 'partial', qtyExpected: 6, qtyReceived: 4 }),
      ]),
    ).toBe('partial');
  });

  it('riga attesa non ancora toccata → partial (resta da ricevere)', () => {
    expect(
      computeReceiptStatus([
        line({ lineStatus: 'received', qtyExpected: 10, qtyReceived: 10 }),
        line({ lineStatus: 'matched', qtyExpected: 2, qtyReceived: 0 }),
      ]),
    ).toBe('partial');
  });

  it('la discrepanza ha precedenza su tutto', () => {
    expect(
      computeReceiptStatus([
        line({ lineStatus: 'partial', qtyExpected: 6, qtyReceived: 4 }),
        line({
          lineStatus: 'discrepancy',
          discrepancyReason: 'collo danneggiato',
          qtyExpected: 5,
          qtyReceived: 5,
        }),
      ]),
    ).toBe('discrepancy');
  });
});

describe('linePostableDelta — idempotenza doppio scan/doppio complete', () => {
  it('prima del post: delta = ricevuto', () => {
    expect(linePostableDelta({ qtyReceived: 6, qtyPosted: 0 })).toBe(6);
  });

  it('dopo il post: delta 0 → un secondo complete non genera movimenti', () => {
    expect(linePostableDelta({ qtyReceived: 6, qtyPosted: 6 })).toBe(0);
  });

  it('ricevimento incrementale: si contabilizza solo il nuovo', () => {
    expect(linePostableDelta({ qtyReceived: 10, qtyPosted: 6 })).toBe(4);
  });

  it('mai negativo lato UI (il caso è errore bloccante in RPC)', () => {
    expect(linePostableDelta({ qtyReceived: 4, qtyPosted: 6 })).toBe(0);
  });
});
