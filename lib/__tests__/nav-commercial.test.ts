// =============================================================================
// nav-commercial.test.ts — regressione sulla FUSIONE dell'area commerciale:
// una sola voce "Vendite" in nav (niente doppione "Ordini clienti"), e
// /customers tiene accesa la voce Vendite (è una tab della stessa area).
// =============================================================================

import { describe, expect, it } from 'vitest';
import { CUSTOMER_NAV, activeNavItem, isActivePath } from '@/components/layout/navConfig';

const allItems = CUSTOMER_NAV.flatMap((s) => s.items);

describe('nav area commerciale unica', () => {
  it('esiste UNA sola voce /sales e NESSUNA voce /customers', () => {
    expect(allItems.filter((i) => i.href === '/sales')).toHaveLength(1);
    expect(allItems.find((i) => i.href === '/customers')).toBeUndefined();
  });

  it('la voce commerciale si chiama Vendite', () => {
    expect(allItems.find((i) => i.href === '/sales')?.label).toBe('Vendite');
  });

  it('/customers e sottopagine attivano la voce Vendite (stessa area)', () => {
    expect(isActivePath('/customers', '/sales')).toBe(true);
    expect(isActivePath('/customers/new', '/sales')).toBe(true);
    expect(activeNavItem('/customers', CUSTOMER_NAV)?.href).toBe('/sales');
  });

  it('/sales/pos e /sales/inbox restano dentro Vendite', () => {
    expect(activeNavItem('/sales/pos', CUSTOMER_NAV)?.href).toBe('/sales');
    expect(activeNavItem('/sales/inbox', CUSTOMER_NAV)?.href).toBe('/sales');
  });

  it('nessuna regressione sulle altre voci (es. /orders ≠ vendite)', () => {
    expect(activeNavItem('/orders', CUSTOMER_NAV)?.href).toBe('/orders');
    expect(isActivePath('/orders', '/sales')).toBe(false);
  });
});
