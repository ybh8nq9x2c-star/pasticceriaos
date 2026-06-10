import { describe, it, expect } from 'vitest';
import { generateConnectionKey, hashConnectionKey } from '../keys';

describe('connection key generation', () => {
  it('produces the human-shareable PSOS-XXXX-XXXX-XXXX format', () => {
    const k = generateConnectionKey();
    expect(k.plaintext).toMatch(/^PSOS-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    expect(k.prefix).toBe(k.plaintext.slice(0, 9));
    expect(k.hash).toBe(hashConnectionKey(k.plaintext));
  });

  it('never contains ambiguous characters (0/O/1/I/L/U)', () => {
    for (let i = 0; i < 200; i++) {
      const body = generateConnectionKey().plaintext.replace(/^PSOS-/, '').replace(/-/g, '');
      expect(body).not.toMatch(/[01OILU]/);
    }
  });

  it('is effectively unique', () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(generateConnectionKey().plaintext);
    expect(set.size).toBe(1000);
  });
});

describe('hashConnectionKey', () => {
  it('is deterministic and case/space-insensitive (sha256 hex)', () => {
    const h = hashConnectionKey('PSOS-AB23-CD45-EF67');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashConnectionKey('  psos-ab23-cd45-ef67  ')).toBe(h);
    expect(hashConnectionKey('PSOS-AB23 CD45 EF67')).toBe(h);
  });

  it('differs for different keys', () => {
    expect(hashConnectionKey('PSOS-AAAA-BBBB-CCCC')).not.toBe(hashConnectionKey('PSOS-AAAA-BBBB-CCCD'));
  });
});
