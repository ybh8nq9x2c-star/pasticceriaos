// =============================================================================
// Goods receipt engine — matching prodotti (puro).
// Copre: exact SKU, exact barcode (con normalizzazione GS1/GTIN), nome
// normalizzato, confidence, barcode sconosciuto, suggerimenti per override.
// =============================================================================

import { describe, expect, it } from 'vitest';
import {
  AUTO_MATCH_THRESHOLD,
  matchProduct,
  normalizeBarcode,
  suggestProducts,
  type CatalogProductRef,
} from '../matching';

const CATALOG: CatalogProductRef[] = [
  { id: 'p-farina', name: 'farina 00', sku: 'FAR-00-25', barcode: '8001234567890', unit: 'kg' },
  { id: 'p-burro', name: 'Burro 82% m.g.', sku: 'BUR-82', barcode: null, unit: 'kg' },
  { id: 'p-amarena', name: 'Amarene sciroppate', sku: null, barcode: '8009876543210', unit: 'kg' },
  { id: 'p-zucchero', name: 'Zucchero semolato', sku: 'ZUC-SEM', barcode: null, unit: 'kg' },
];

describe('normalizeBarcode', () => {
  it('rimuove spazi e normalizza GS1-128 AI(01) → GTIN', () => {
    expect(normalizeBarcode(' 8001234567890 ')).toBe('8001234567890');
    expect(normalizeBarcode('(01)08001234567890')).toBe('8001234567890'); // GTIN-14 con 0
    expect(normalizeBarcode('0108001234567890')).toBe('8001234567890');
  });
  it('null/vuoto → stringa vuota', () => {
    expect(normalizeBarcode(null)).toBe('');
    expect(normalizeBarcode('   ')).toBe('');
  });
});

describe('matchProduct', () => {
  it('exact match su barcode → confidence 1', () => {
    const m = matchProduct(CATALOG, { barcode: '8001234567890' });
    expect(m?.product.id).toBe('p-farina');
    expect(m?.matchedBy).toBe('barcode');
    expect(m?.confidence).toBe(1);
  });

  it('match barcode anche da GS1-128 scansionato', () => {
    const m = matchProduct(CATALOG, { barcode: '(01)08009876543210' });
    expect(m?.product.id).toBe('p-amarena');
  });

  it('exact match su SKU (case/space-insensitive) → 0.95', () => {
    const m = matchProduct(CATALOG, { sku: ' bur-82 ' });
    expect(m?.product.id).toBe('p-burro');
    expect(m?.matchedBy).toBe('sku');
    expect(m?.confidence).toBe(0.95);
  });

  it('match su nome normalizzato → 0.9 (soglia auto-match)', () => {
    const m = matchProduct(CATALOG, { name: '  FARINA   00 ' });
    expect(m?.product.id).toBe('p-farina');
    expect(m?.matchedBy).toBe('name');
    expect(m?.confidence).toBeGreaterThanOrEqual(AUTO_MATCH_THRESHOLD);
  });

  it('nome simile ma non identico → match parziale SOTTO la soglia auto', () => {
    const m = matchProduct(CATALOG, { name: 'Farina 00 sacco 25kg' });
    expect(m).not.toBeNull();
    expect(m!.matchedBy).toBe('name-partial');
    expect(m!.confidence).toBeLessThan(AUTO_MATCH_THRESHOLD);
  });

  it('barcode sconosciuto senza nome → null (nessun match inventato)', () => {
    expect(matchProduct(CATALOG, { barcode: '4099999999999' })).toBeNull();
  });

  it('il barcode vince su SKU e nome quando presenti insieme', () => {
    const m = matchProduct(CATALOG, {
      barcode: '8009876543210',
      sku: 'FAR-00-25',
      name: 'zucchero semolato',
    });
    expect(m?.product.id).toBe('p-amarena');
  });
});

describe('suggestProducts (override manuale)', () => {
  it('suggerisce prodotti per token in comune, ordinati per confidence', () => {
    const s = suggestProducts(CATALOG, 'Burro 82');
    expect(s.length).toBeGreaterThan(0);
    expect(s[0].product.id).toBe('p-burro');
    expect(s[0].confidence).toBeLessThan(AUTO_MATCH_THRESHOLD);
  });

  it('nessun suggerimento per stringhe senza segnale', () => {
    expect(suggestProducts(CATALOG, 'xyz')).toHaveLength(0);
    expect(suggestProducts(CATALOG, '')).toHaveLength(0);
  });
});
