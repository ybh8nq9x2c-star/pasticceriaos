import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isServerToServerRoute, SERVER_TO_SERVER_PREFIXES } from '../server-routes';

describe('eccezioni dichiarate al gate di sessione (W5)', () => {
  it('il webhook POS è server-to-server; le API POS di sessione NO', () => {
    expect(isServerToServerRoute('/api/webhooks/mipos')).toBe(true);
    expect(isServerToServerRoute('/api/pos/dry-run')).toBe(false);
    expect(isServerToServerRoute('/api/pos/replay-event/x')).toBe(false);
    expect(isServerToServerRoute('/dashboard')).toBe(false);
    expect(isServerToServerRoute('/api/webhooksX')).toBe(false);
  });

  it('il matcher statico di middleware.ts esclude ESATTAMENTE le eccezioni dichiarate', () => {
    const src = readFileSync(resolve(__dirname, '../../middleware.ts'), 'utf8');
    const matcher = src.match(/'(\/\(\(\?!.*?\)\.\*\))'/)?.[1];
    expect(matcher).toBeTruthy();
    const re = new RegExp(`^${matcher}$`);
    for (const p of SERVER_TO_SERVER_PREFIXES) {
      expect(re.test(`${p}mipos`)).toBe(false); // escluso dal middleware
    }
    expect(re.test('/api/pos/dry-run')).toBe(true); // resta sotto il gate
    expect(re.test('/dashboard')).toBe(true);
  });
});
