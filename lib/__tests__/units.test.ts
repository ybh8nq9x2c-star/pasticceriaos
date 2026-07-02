// =============================================================================
// Conversione unità (audit R1): mirror della funzione DB unit_conversion_factor.
// Garantisce che TS e DB restino allineati su cosa è convertibile e con che
// fattore — la deduzione magazzino (vendita E produzione) ne dipende.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { unitConversionFactor, isUnitConvertible } from '../units';
import type { UnitOfMeasure } from '@/lib/database.types';

const UNITS: UnitOfMeasure[] = ['g', 'kg', 'ml', 'l', 'pz', 'bustina', 'foglio'];

describe('unitConversionFactor', () => {
  it('identità = 1 per ogni unità', () => {
    for (const u of UNITS) expect(unitConversionFactor(u, u)).toBe(1);
  });

  it('coppie metriche peso/volume', () => {
    expect(unitConversionFactor('g', 'kg')).toBe(0.001);
    expect(unitConversionFactor('kg', 'g')).toBe(1000);
    expect(unitConversionFactor('ml', 'l')).toBe(0.001);
    expect(unitConversionFactor('l', 'ml')).toBe(1000);
  });

  it('cross-grandezza → null (NON convertibile)', () => {
    const nonConvertible: [UnitOfMeasure, UnitOfMeasure][] = [
      ['g', 'pz'], ['pz', 'g'], ['g', 'ml'], ['kg', 'l'], ['ml', 'g'],
      ['pz', 'foglio'], ['bustina', 'g'], ['foglio', 'pz'], ['l', 'kg'],
    ];
    for (const [a, b] of nonConvertible) {
      expect(unitConversionFactor(a, b)).toBeNull();
      expect(isUnitConvertible(a, b)).toBe(false);
    }
  });

  it('round-trip g↔kg e ml↔l preserva la quantità fisica', () => {
    expect(500 * unitConversionFactor('g', 'kg')! * unitConversionFactor('kg', 'g')!).toBe(500);
    expect(250 * unitConversionFactor('ml', 'l')!).toBe(0.25);
  });
});

// (Il re-export convertFactor di sales/bom è stato rimosso con il dominio 050:
// il BOM non appartiene più al flusso vendita. lib/units resta l'unica fonte
// di verità TS, mirror della funzione DB unit_conversion_factor.)
