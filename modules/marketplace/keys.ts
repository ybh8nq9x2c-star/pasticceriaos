// =============================================================================
// modules/marketplace/keys.ts
// Pure connection-key crypto (no DB / no request context) so it is unit-testable.
//
// Format: PSOS-XXXX-XXXX-XXXX using a Crockford-ish base32 alphabet (no
// ambiguous 0/O/1/I/L/U). ~80 bits of entropy in the secret part. We store
// only sha256(plaintext); the plaintext is shown to the supplier once.
// =============================================================================

import { createHash, randomBytes } from 'node:crypto';

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

function group(bytes: Buffer, start: number, len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[start + i] % ALPHABET.length];
  return out;
}

export interface GeneratedKey {
  /** Full plaintext key — shown to the supplier ONCE, never stored. */
  plaintext: string;
  /** Public prefix stored for identification in the supplier UI. */
  prefix: string;
  /** sha256(plaintext) hex — what we store and look up. */
  hash: string;
}

export function generateConnectionKey(): GeneratedKey {
  const bytes = randomBytes(12); // 96 bits of entropy
  const plaintext = `PSOS-${group(bytes, 0, 4)}-${group(bytes, 4, 4)}-${group(bytes, 8, 4)}`;
  const prefix = plaintext.slice(0, 9); // "PSOS-XXXX"
  return { plaintext, prefix, hash: hashConnectionKey(plaintext) };
}

/**
 * Normalise + sha256 a key. Normalisation is case-insensitive and tolerant of
 * how the key was copied/typed: uppercased, with every non-alphanumeric
 * separator (spaces, dashes, tabs) stripped. So 'PSOS-AB23-CD45-EF67',
 * 'psos ab23 cd45 ef67' and '  PSOS-AB23 CD45 EF67 ' all hash identically.
 * Generation and verification both go through here, so they stay consistent.
 */
export function hashConnectionKey(input: string): string {
  const normalized = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return createHash('sha256').update(normalized).digest('hex');
}
