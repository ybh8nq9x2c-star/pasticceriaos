import { describe, it, expect } from 'vitest';
import { safeNextPath } from '../safe-next';

const F = '/fallback';

describe('safeNextPath (F-10)', () => {
  it('accetta path interni (con query e hash)', () => {
    expect(safeNextPath('/dashboard', F)).toBe('/dashboard');
    expect(safeNextPath('/orders/123?tab=righe#x', F)).toBe('/orders/123?tab=righe#x');
  });

  it('rifiuta i vettori di open redirect', () => {
    for (const bad of [
      '/\\evil.com',            // il caso dell'audit: /\ → // nei browser
      '\\\\evil.com',
      '//evil.com',
      '/\t/evil.com',           // tab rimosso dal browser → //evil.com
      '/\n/evil.com',
      'https://evil.com',
      'evil.com',
      ' //evil.com',
      '/%5Cevil.com'.replace('%5C', '\\'),
    ]) {
      expect(safeNextPath(bad, F), JSON.stringify(bad)).toBe(F);
    }
  });

  it('input non stringa o vuoto → fallback', () => {
    expect(safeNextPath(null, F)).toBe(F);
    expect(safeNextPath(undefined, F)).toBe(F);
    expect(safeNextPath(42, F)).toBe(F);
    expect(safeNextPath('', F)).toBe(F);
  });

  it('normalizza i path relativi senza uscire dall\'origine', () => {
    expect(safeNextPath('/a/../b', F)).toBe('/b');
    expect(safeNextPath('/%2F%2Fevil.com', F)).toBe('/%2F%2Fevil.com'); // resta un path interno
  });
});
