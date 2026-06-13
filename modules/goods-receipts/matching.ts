// =============================================================================
// modules/goods-receipts/matching.ts
// Matching prodotto PURO e testabile per il goods receipt engine.
// Centralizza la logica di riconoscimento usata da scanner e import DDT:
//   1. exact match su barcode        → confidence 1.0
//   2. exact match su SKU            → confidence 0.95
//   3. nome normalizzato identico    → confidence 0.90   (auto-match)
//   4. prefisso/contenimento nome    → confidence ≤0.60  (solo suggerimento)
// La normalizzazione del nome è la STESSA del matching documentale
// (modules/documents/matching.normalizeName): un'unica semantica in tutta l'app.
// =============================================================================

import { normalizeName } from '@/modules/documents/matching';
import type { UnitOfMeasure } from '@/lib/database.types';

export { normalizeName };

/** Vista minima di un prodotto a catalogo usata dal matcher (pura, no DB). */
export interface CatalogProductRef {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: UnitOfMeasure;
}

export type MatchedBy = 'barcode' | 'sku' | 'name' | 'name-partial';

export interface ProductMatch {
  product: CatalogProductRef;
  matchedBy: MatchedBy;
  /** 0..1 — ≥ AUTO_MATCH_THRESHOLD consente l'associazione automatica. */
  confidence: number;
}

/** Sotto questa soglia il match NON è automatico: serve conferma utente. */
export const AUTO_MATCH_THRESHOLD = 0.9;

/** Normalizza un barcode scansionato/digitato (spazi, prefissi GS1 banali). */
export function normalizeBarcode(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = raw.trim().replace(/\s+/g, '');
  // GS1-128: l'AI (01) prefissa il GTIN-14 → estrai il GTIN.
  const gs1 = s.match(/^\(?01\)?(\d{14})/);
  if (gs1) s = gs1[1];
  // GTIN-14 con indicatore 0 → EAN-13.
  if (/^\d{14}$/.test(s) && s.startsWith('0')) s = s.slice(1);
  return s;
}

export function normalizeSku(raw: string | null | undefined): string {
  return (raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

export interface MatchQuery {
  barcode?: string | null;
  sku?: string | null;
  name?: string | null;
}

/**
 * Miglior match per la query, o null. Deterministico e puro.
 * I prodotti del catalogo sono dell'organizzazione corrente (filtrati a monte).
 */
export function matchProduct(
  catalog: readonly CatalogProductRef[],
  query: MatchQuery,
): ProductMatch | null {
  const barcode = normalizeBarcode(query.barcode);
  if (barcode) {
    const hit = catalog.find((p) => normalizeBarcode(p.barcode) === barcode);
    if (hit) return { product: hit, matchedBy: 'barcode', confidence: 1 };
  }

  const sku = normalizeSku(query.sku);
  if (sku) {
    const hit = catalog.find((p) => normalizeSku(p.sku) === sku);
    if (hit) return { product: hit, matchedBy: 'sku', confidence: 0.95 };
  }

  const name = normalizeName(query.name);
  if (name) {
    const exact = catalog.find((p) => normalizeName(p.name) === name);
    if (exact) return { product: exact, matchedBy: 'name', confidence: 0.9 };

    const partial = suggestProducts(catalog, query.name ?? '', 1)[0];
    if (partial) return partial;
  }

  return null;
}

/**
 * Suggerimenti ordinati per similarità (token overlap + prefisso).
 * Usato quando il match automatico fallisce: l'utente sceglie manualmente.
 */
export function suggestProducts(
  catalog: readonly CatalogProductRef[],
  rawName: string,
  limit = 5,
): ProductMatch[] {
  const name = normalizeName(rawName);
  if (!name) return [];
  const queryTokens = new Set(name.split(' ').filter((t) => t.length > 1));
  if (queryTokens.size === 0) return [];

  const scored: ProductMatch[] = [];
  for (const p of catalog) {
    const pname = normalizeName(p.name);
    if (!pname) continue;
    let score = 0;
    if (pname === name) score = 0.9;
    else if (pname.startsWith(name) || name.startsWith(pname)) score = 0.6;
    else {
      const ptokens = new Set(pname.split(' ').filter((t) => t.length > 1));
      let overlap = 0;
      for (const t of queryTokens) if (ptokens.has(t)) overlap++;
      const denom = Math.max(queryTokens.size, ptokens.size);
      if (denom > 0 && overlap > 0) score = Math.min(0.55, (overlap / denom) * 0.7);
    }
    if (score >= 0.3) {
      scored.push({ product: p, matchedBy: score >= 0.9 ? 'name' : 'name-partial', confidence: round2(score) });
    }
  }
  return scored.sort((a, b) => b.confidence - a.confidence).slice(0, limit);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
