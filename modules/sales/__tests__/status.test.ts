// =============================================================================
// Stato vendita aggregato (puro). La matematica BOM è stata RIMOSSA dal flusso
// vendita (050: la vendita scala i prodotti finiti; il BOM è della produzione).
// =============================================================================

import { describe, it, expect } from 'vitest';
import { aggregateSaleStatus } from '../types';

describe('aggregateSaleStatus', () => {
  it('tutto dedotto → processed', () => {
    expect(aggregateSaleStatus(['deducted', 'deducted'])).toBe('processed');
  });

  it('alcuni dedotti → partially_linked', () => {
    expect(aggregateSaleStatus(['deducted', 'unlinked'])).toBe('partially_linked');
  });

  it('nessuno dedotto → unlinked (anche per stati legacy no_bom/unit_mismatch)', () => {
    expect(aggregateSaleStatus(['unlinked'])).toBe('unlinked');
    expect(aggregateSaleStatus(['no_bom', 'unit_mismatch'])).toBe('unlinked');
  });

  it('vendita senza righe → unlinked', () => {
    expect(aggregateSaleStatus([])).toBe('unlinked');
  });
});
