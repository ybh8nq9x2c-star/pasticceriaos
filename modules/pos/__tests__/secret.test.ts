import { describe, it, expect, beforeEach } from 'vitest';
import { deriveWebhookSecret, webhookKeyFor, masterSecret, type PosConfigBinding } from '../secret';

const base: PosConfigBinding = {
  configId: 'CFG-1', organizationId: 'ORG-1', provider: 'mipos',
  secretScheme: 'derived', secretVersion: 1, verifiedAt: null,
};

beforeEach(() => {
  process.env.POS_WEBHOOK_MASTER_SECRET = 'k'.repeat(40);
  process.env.MIPOS_WEBHOOK_SECRET = 'legacy';
});

describe('segreto webhook per config (062)', () => {
  it('derivazione deterministica', () => {
    expect(deriveWebhookSecret('m', 'mipos', 'CFG-1', 1)).toBe(deriveWebhookSecret('m', 'mipos', 'CFG-1', 1));
  });
  it('diverso per config, per versione (rotazione) e per master', () => {
    const a = deriveWebhookSecret('m', 'mipos', 'CFG-1', 1);
    expect(deriveWebhookSecret('m', 'mipos', 'CFG-2', 1)).not.toBe(a);
    expect(deriveWebhookSecret('m', 'mipos', 'CFG-1', 2)).not.toBe(a);
    expect(deriveWebhookSecret('n', 'mipos', 'CFG-1', 1)).not.toBe(a);
  });
  it('derived senza master (o master < 32 caratteri) → nessuna chiave: mai accettare', () => {
    process.env.POS_WEBHOOK_MASTER_SECRET = 'corto';
    expect(masterSecret()).toBeNull();
    expect(webhookKeyFor(base)).toBeNull();
  });
  it('legacy_global usa il segreto globale; derived MAI', () => {
    expect(webhookKeyFor({ ...base, secretScheme: 'legacy_global' })).toBe('legacy');
    expect(webhookKeyFor(base)).not.toBe('legacy');
  });
});
