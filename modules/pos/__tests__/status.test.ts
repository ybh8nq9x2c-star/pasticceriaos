// =============================================================================
// status.test.ts — la CTA contestuale POS deve raccontare SEMPRE la verità:
// non collegato → collega; falliti → riprova; non mappati → mappa; mai un
// "tutto ok" quando qualcosa non scala il magazzino.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { derivePosCta, type PosHealthSnapshot } from '../status';

const base: PosHealthSnapshot = {
  adapterRegistered: true,
  webhookSecretConfigured: true,
  configActive: true,
  storeConfigured: true,
  mappingsCount: 5,
  processedEventsCount: 10,
  unmappedCount: 0,
  failedCount: 0,
};

describe('derivePosCta', () => {
  it('non collegato → setup, CTA "Collega il POS"', () => {
    for (const missing of ['adapterRegistered', 'webhookSecretConfigured', 'configActive', 'storeConfigured'] as const) {
      const r = derivePosCta({ ...base, [missing]: false });
      expect(r.state).toBe('setup');
      expect(r.cta.href).toBe('/sales/pos');
      expect(r.badge.variant).toBe('neutral');
    }
  });

  it('collegato ma MAI un evento elaborato → collaudo (flusso "connected but untested")', () => {
    const r = derivePosCta({ ...base, processedEventsCount: 0, mappingsCount: 0 });
    expect(r.state).toBe('test');
    expect(r.cta.href).toBe('/sales/pos#prova');
    expect(r.badge.variant).toBe('warning');
  });

  it('connected but unmapped → CTA mappatura, mai "Attivo"', () => {
    const r = derivePosCta({ ...base, unmappedCount: 3 });
    expect(r.state).toBe('unmapped');
    expect(r.cta.href).toBe('/sales/pos#mappatura');
    expect(r.badge.variant).toBe('warning');
    expect(r.badge.label).toContain('3');
  });

  it('eventi falliti hanno PRIORITÀ sulla mappatura (bloccano scontrini interi)', () => {
    const r = derivePosCta({ ...base, failedCount: 2, unmappedCount: 5 });
    expect(r.state).toBe('failed');
    expect(r.cta.href).toBe('/sales/inbox?tab=failed');
    expect(r.badge.variant).toBe('danger');
  });

  it('receipt ingested successfully e niente anomalie → live', () => {
    const r = derivePosCta(base);
    expect(r.state).toBe('live');
    expect(r.badge.variant).toBe('success');
    expect(r.cta.href).toBe('/sales/inbox');
  });
});
