// =============================================================================
// modules/pos/secret.ts — segreto HMAC del webhook POS PER CONFIGURAZIONE (062).
//
//   secret = HMAC-SHA256(POS_WEBHOOK_MASTER_SECRET,
//                        "bakeryos-pos:v1:<provider>:<config_id>:<version>")
//
// Il DB non contiene segreti: solo schema e versione. Il segreto di una cassa
// non permette di firmare per un'altra (PRF). Rotazione = version+1 (RPC).
// 'legacy_global' = config pre-062 che usano ancora MIPOS_WEBHOOK_SECRET.
// Vedi docs/adr/003-pos-webhook-binding.md.
// =============================================================================

import crypto from 'node:crypto';

export type SecretScheme = 'derived' | 'legacy_global';

export interface PosConfigBinding {
  configId: string;
  organizationId: string;
  provider: string;
  secretScheme: SecretScheme;
  secretVersion: number;
  verifiedAt: string | null;
}

const MIN_MASTER_LEN = 32;

/** Master per i segreti derivati; null se assente o troppo corto. */
export function masterSecret(): string | null {
  const m = (process.env.POS_WEBHOOK_MASTER_SECRET ?? '').trim();
  return m.length >= MIN_MASTER_LEN ? m : null;
}

/** Segreto globale storico (solo config legacy_global). */
export function legacyGlobalSecret(provider: string): string | null {
  if (provider !== 'mipos') return null;
  const s = (process.env.MIPOS_WEBHOOK_SECRET ?? '').trim();
  return s.length > 0 ? s : null;
}

/** PURO: derivazione deterministica del segreto di una config. */
export function deriveWebhookSecret(master: string, provider: string, configId: string, version: number): string {
  return crypto
    .createHmac('sha256', master)
    .update(`bakeryos-pos:v1:${provider}:${configId}:${version}`, 'utf8')
    .digest('hex');
}

/** Chiave con cui verificare le firme di QUESTA config; null = server non configurato. */
export function webhookKeyFor(binding: PosConfigBinding): string | null {
  if (binding.secretScheme === 'legacy_global') return legacyGlobalSecret(binding.provider);
  const master = masterSecret();
  return master ? deriveWebhookSecret(master, binding.provider, binding.configId, binding.secretVersion) : null;
}
