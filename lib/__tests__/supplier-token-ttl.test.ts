import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { portalTokenTtlSeconds, DEFAULT_PORTAL_TTL_DAYS } from '../supplier-token';

const DAY = 24 * 60 * 60;
afterEach(() => { delete process.env.SUPPLIER_PORTAL_TOKEN_TTL_DAYS; });

describe('durata link portale fornitore (W6)', () => {
  it('default corto: 30 giorni (prima 1 anno)', () => {
    expect(DEFAULT_PORTAL_TTL_DAYS).toBe(30);
    expect(portalTokenTtlSeconds()).toBe(30 * DAY);
  });
  it('configurabile via env', () => {
    process.env.SUPPLIER_PORTAL_TOKEN_TTL_DAYS = '7';
    expect(portalTokenTtlSeconds()).toBe(7 * DAY);
  });
  it('valori non validi → default; tetto a 365 giorni', () => {
    process.env.SUPPLIER_PORTAL_TOKEN_TTL_DAYS = 'abc';
    expect(portalTokenTtlSeconds()).toBe(30 * DAY);
    process.env.SUPPLIER_PORTAL_TOKEN_TTL_DAYS = '0';
    expect(portalTokenTtlSeconds()).toBe(30 * DAY);
    process.env.SUPPLIER_PORTAL_TOKEN_TTL_DAYS = '5000';
    expect(portalTokenTtlSeconds()).toBe(365 * DAY);
  });
});
