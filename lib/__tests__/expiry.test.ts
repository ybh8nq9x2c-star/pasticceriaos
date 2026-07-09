// =============================================================================
// expiry.test.ts — boundary della semantica scadenze (review scadenze).
// I casi obbligatori: -1 / 0 / +1 / +3 / +4 + partizione scaduti vs in-scadenza.
// qty=0: la ESCLUSIONE avviene a monte (vista/edge con quantity_remaining>0):
// qui verifichiamo che un lotto scaduto NON venga MAI chiamato "in scadenza".
// =============================================================================

import { describe, expect, it } from 'vitest';
import { expiryBucket, expiryPhrase, partitionByExpiry } from '../expiry';

describe('expiryBucket', () => {
  it('-1 (scaduto ieri) → expired', () => expect(expiryBucket(-1)).toBe('expired'));
  it('0 (scade oggi) → today', () => expect(expiryBucket(0)).toBe('today'));
  it('+1 (domani) → soon', () => expect(expiryBucket(1)).toBe('soon'));
  it('+3 (dentro finestra) → soon', () => expect(expiryBucket(3)).toBe('soon'));
  it('+4 (oltre finestra) → soon (il filtro finestra è a monte, non qui)', () =>
    expect(expiryBucket(4)).toBe('soon'));
});

describe('expiryPhrase — mai "scade oggi" su un negativo (il bug corretto)', () => {
  it('-1 → "scaduto da 1 giorno"', () => expect(expiryPhrase(-1)).toBe('scaduto da 1 giorno'));
  it('-5 → "scaduto da 5 giorni" (NON "scade oggi")', () =>
    expect(expiryPhrase(-5)).toBe('scaduto da 5 giorni'));
  it('0 → "scade oggi"', () => expect(expiryPhrase(0)).toBe('scade oggi'));
  it('+1 → "scade domani"', () => expect(expiryPhrase(1)).toBe('scade domani'));
  it('+3 → "scade tra 3 giorni"', () => expect(expiryPhrase(3)).toBe('scade tra 3 giorni'));
});

describe('partitionByExpiry', () => {
  it('separa scaduti (<0) da in-scadenza (>=0); oggi sta con gli upcoming', () => {
    const batches = [
      { id: 'a', daysToExpiry: -2 },
      { id: 'b', daysToExpiry: 0 },
      { id: 'c', daysToExpiry: 1 },
      { id: 'd', daysToExpiry: 3 },
    ];
    const { expired, upcoming } = partitionByExpiry(batches);
    expect(expired.map((b) => b.id)).toEqual(['a']);
    expect(upcoming.map((b) => b.id)).toEqual(['b', 'c', 'd']);
  });

  it('solo scaduti → upcoming vuoto (il conteggio "entro 3 giorni" sarebbe 0)', () => {
    const { expired, upcoming } = partitionByExpiry([{ daysToExpiry: -1 }, { daysToExpiry: -7 }]);
    expect(expired).toHaveLength(2);
    expect(upcoming).toHaveLength(0);
  });

  it('lista vuota → due liste vuote', () => {
    const { expired, upcoming } = partitionByExpiry([] as { daysToExpiry: number }[]);
    expect(expired).toHaveLength(0);
    expect(upcoming).toHaveLength(0);
  });
});
