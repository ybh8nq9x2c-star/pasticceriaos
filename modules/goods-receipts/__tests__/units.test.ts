// =============================================================================
// units.test.ts — il contratto TS deve restare lo specchio di
// unit_conversion_factor (SQL 021). Copre: conversione compatibile,
// incompatibile esplicita (null, mai fallback), nessuna mutazione senza
// conversione (identità = 1).
// =============================================================================

import { describe, expect, it } from 'vitest';
import { convertQty, unitConversionFactor } from '../units';

describe('unitConversionFactor', () => {
  it('identità: stessa unità → 1 (mai mutazione silenziosa della qty)', () => {
    for (const u of ['g', 'kg', 'ml', 'l', 'pz', 'bustina', 'foglio'] as const) {
      expect(unitConversionFactor(u, u)).toBe(1);
    }
  });

  it('coppie metriche convertibili (come SQL 021)', () => {
    expect(unitConversionFactor('kg', 'g')).toBe(1000);
    expect(unitConversionFactor('g', 'kg')).toBe(0.001);
    expect(unitConversionFactor('l', 'ml')).toBe(1000);
    expect(unitConversionFactor('ml', 'l')).toBe(0.001);
  });

  it('incompatibili → null esplicito, nessun fallback a 1', () => {
    expect(unitConversionFactor('pz', 'kg')).toBeNull();
    expect(unitConversionFactor('kg', 'pz')).toBeNull();
    expect(unitConversionFactor('g', 'ml')).toBeNull();
    expect(unitConversionFactor('bustina', 'foglio')).toBeNull();
    expect(unitConversionFactor('kg', 'l')).toBeNull();
  });
});

describe('parità TS↔SQL (P0-H): matrice ESAUSTIVA 7×7', () => {
  // Specchio letterale di unit_conversion_factor (migration 021): se questa
  // tabella cambia, DEVE cambiare prima l'SQL — il test blocca il drift.
  const UNITS = ['g', 'kg', 'ml', 'l', 'pz', 'bustina', 'foglio'] as const;
  const SQL_TABLE: Record<string, number> = {
    'g→kg': 0.001, 'kg→g': 1000, 'ml→l': 0.001, 'l→ml': 1000,
  };

  it('ogni coppia: identità=1, coppie SQL=fattore, tutto il resto=null', () => {
    for (const from of UNITS) {
      for (const to of UNITS) {
        const got = unitConversionFactor(from, to);
        const expected = from === to ? 1 : SQL_TABLE[`${from}→${to}`] ?? null;
        expect(got, `${from}→${to}`).toBe(expected);
      }
    }
  });
});

describe('convertQty', () => {
  it('caso audit: DDT "25 kg" su prodotto in grammi → 25000 g, non 25 g', () => {
    expect(convertQty(25, 'kg', 'g')).toBe(25000);
  });

  it('arrotonda a 4 decimali come numeric(12,4)', () => {
    expect(convertQty(1.23456, 'kg', 'g')).toBe(1234.56);
    expect(convertQty(333, 'g', 'kg')).toBe(0.333);
  });

  it('incompatibile → null (il chiamante DEVE gestirlo, mai qty invariata)', () => {
    expect(convertQty(2, 'pz', 'kg')).toBeNull();
  });
});
