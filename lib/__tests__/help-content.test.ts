// =============================================================================
// help-content.test.ts — la mappa route→articolo e gli slug devono restare
// coerenti col contenuto: nessun articolo orfano, nessun link rotto interno.
// =============================================================================

import { describe, expect, it } from 'vitest';
import {
  HELP_ARTICLES, HELP_SECTIONS, HELP_SLUGS, articleBySlug, routeToHelpId, slugForArticle,
} from '../help/content';

describe('routeToHelpId', () => {
  it('mappa le rotte P0 sull\'articolo giusto', () => {
    expect(routeToHelpId('/dashboard')).toBe('today');
    expect(routeToHelpId('/production/new')).toBe('production');
    expect(routeToHelpId('/production/abc-123')).toBe('production');
    expect(routeToHelpId('/receipts/xyz')).toBe('receiving');
    expect(routeToHelpId('/inventory/batches')).toBe('expiry');
    expect(routeToHelpId('/inventory/movement')).toBe('stock-adjust');
    expect(routeToHelpId('/inventory')).toBe('inventory');
    expect(routeToHelpId('/sales/pos')).toBe('sales');
    expect(routeToHelpId('/customers')).toBe('customer-orders');
    expect(routeToHelpId('/orders/1')).toBe('supplier-orders');
  });

  it('rotta sconosciuta → null (drawer mostra la guida generale)', () => {
    expect(routeToHelpId('/settings')).toBeNull();
    expect(routeToHelpId('/recipes')).toBeNull();
  });

  it('più specifico vince sul generico', () => {
    expect(routeToHelpId('/inventory/batches')).not.toBe('inventory');
    expect(routeToHelpId('/production/new')).toBe('production');
  });
});

describe('coerenza contenuto', () => {
  it('ogni articolo di ogni sezione esiste', () => {
    for (const s of HELP_SECTIONS) {
      for (const id of s.articleIds) {
        expect(HELP_ARTICLES[id], `sezione ${s.id} → articolo ${id}`).toBeDefined();
      }
    }
  });

  it('ogni articolo ha uno slug e il round-trip slug↔id regge', () => {
    for (const id of Object.keys(HELP_ARTICLES)) {
      const slug = slugForArticle(id);
      expect(slug).toBeTruthy();
      expect(articleBySlug(slug)?.id).toBe(id);
    }
  });

  it('i link interni /help/<slug> puntano ad articoli reali', () => {
    const validHrefs = new Set(Object.values(HELP_SLUGS).map((s) => `/help/${s}`));
    for (const a of Object.values(HELP_ARTICLES)) {
      for (const b of a.blocks) {
        for (const p of b.pairs ?? []) {
          if (p.href?.startsWith('/help/')) {
            expect(validHrefs.has(p.href), `${a.id}: link rotto ${p.href}`).toBe(true);
          }
        }
      }
    }
  });

  it('ogni articolo ha un lede breve (una riga utile, non vuota)', () => {
    for (const a of Object.values(HELP_ARTICLES)) {
      expect(a.lede.length).toBeGreaterThan(20);
      expect(a.blocks.length).toBeGreaterThan(0);
    }
  });
});
