import { describe, it, expect } from 'vitest';
import { summarizeBulkSend, type BulkSendItemResult } from '../bulk-send';

const r = (outcome: BulkSendItemResult['outcome']): BulkSendItemResult => ({
  orderId: crypto.randomUUID(),
  outcome,
});

describe('summarizeBulkSend', () => {
  it('conta solo i recapiti attestati come "inviati"', () => {
    const s = summarizeBulkSend([r('delivered'), r('delivered'), r('delivered')]);
    expect(s.delivered).toBe(3);
    expect(s.manual).toBe(0);
    expect(s.errored).toBe(0);
    expect(s.message).toBe('3 inviati');
  });

  it('NON conta i "manual"/"failed" tra gli inviati (invariante di onestà)', () => {
    const s = summarizeBulkSend([r('delivered'), r('manual'), r('failed')]);
    expect(s.delivered).toBe(1); // solo quello davvero recapitato
    expect(s.manual).toBe(2);    // manual + failed → da completare a mano
    expect(s.errored).toBe(0);
    expect(s.message).toBe('1 inviato · 2 da completare a mano');
  });

  it('riporta gli errori come "non elaborati" (restano bozza)', () => {
    const s = summarizeBulkSend([r('delivered'), r('error'), r('error')]);
    expect(s.delivered).toBe(1);
    expect(s.errored).toBe(2);
    expect(s.message).toBe('1 inviato · 2 non elaborati');
  });

  it('compone tutte le categorie nel messaggio', () => {
    const s = summarizeBulkSend([r('delivered'), r('manual'), r('error')]);
    expect(s.message).toBe('1 inviato · 1 da completare a mano · 1 non elaborato');
  });

  it('usa il singolare per un solo ordine', () => {
    expect(summarizeBulkSend([r('delivered')]).message).toBe('1 inviato');
    expect(summarizeBulkSend([r('error')]).message).toBe('1 non elaborato');
  });

  it('lista vuota → nessuna finzione di successo', () => {
    const s = summarizeBulkSend([]);
    expect(s.delivered).toBe(0);
    expect(s.manual).toBe(0);
    expect(s.errored).toBe(0);
    expect(s.message).toBe('Nessun ordine elaborato.');
  });

  it('zero recapitati ma tutti manuali → mai "0 inviati", solo la verità', () => {
    const s = summarizeBulkSend([r('manual'), r('failed')]);
    expect(s.delivered).toBe(0);
    expect(s.message).toBe('2 da completare a mano');
    expect(s.message).not.toContain('inviat');
  });
});
