// =============================================================================
// FASE F — Mobile (iPhone 14, 390×844 via project audit-mobile):
// overflow orizzontale, tap target, navigazione, pagine chiave.
// =============================================================================

import { test, expect } from '@playwright/test';
import { BAKERY_STATE, SUPPLIER_STATE } from '../helpers/accounts';
import { gotoTimed, hasHorizontalOverflow, logFinding, note, smallTapTargets, snap } from '../helpers/audit';

test.describe.configure({ mode: 'serial' });

const PAGINE_BAKERY = [
  ['/dashboard', 'dashboard'],
  ['/marketplace/orders', 'lista ordini marketplace'],
  ['/orders', 'lista ordini interni'],
  ['/documents', 'documenti'],
  ['/ingredients/new', 'form nuovo ingrediente'],
  ['/inventory', 'magazzino'],
] as const;

test.describe('mobile bakery', () => {
  test.use({ storageState: BAKERY_STATE });

  for (const [path, label] of PAGINE_BAKERY) {
    test(`F · ${label} senza overflow, tap target ≥40px`, async ({ page }) => {
      await gotoTimed(page, path, `mobile ${label}`);
      await snap(page, `F-mobile-${label.replace(/\s+/g, '-')}`);
      const overflow = await hasHorizontalOverflow(page);
      expect.soft(overflow, `overflow orizzontale su ${path}`).toBe(false);
      const small = await smallTapTargets(page);
      if (small.length) {
        note(`Tap target <40px su ${path}: ${small.join(' · ')}`);
        logFinding({
          id: `MOB-${label.slice(0, 8)}`, severity: 'Low', role: 'Bakery', area: 'Mobile', type: 'mobile',
          title: `Tap target sotto i 40px su ${path}`,
          observed: small.join(' · '),
          expected: 'Controlli interattivi ≥40-44px',
          fix: 'min-h-[44px] sui controlli elencati',
        });
      }
    });
  }

  test('F · dettaglio ordine marketplace mobile (card, niente data in lista)', async ({ page }) => {
    await page.goto('/marketplace/orders');
    const hasDate = await page.locator('a, li').filter({ hasText: /\d{1,2}[\/ ](giu|gen|feb|mar|apr|mag|lug|ago|set|ott|nov|dic)/ }).count();
    if (!hasDate) {
      logFinding({
        id: 'MOB-ORD-DATA', severity: 'Low', role: 'Bakery', area: 'Mobile/Marketplace', type: 'mobile',
        title: 'Card ordini marketplace mobile senza data',
        observed: 'Solo fornitore, stato e totale: ordini indistinguibili',
        expected: 'Data (e n. ordine) sulla card',
        fix: 'Aggiungere data alla card mobile',
      });
    }
    await page.locator('a[href*="/marketplace/orders/"]').first().click();
    await page.waitForURL(/\/marketplace\/orders\/[0-9a-f-]+/);
    expect.soft(await hasHorizontalOverflow(page)).toBe(false);
    await snap(page, 'F-mobile-dettaglio-ordine');
  });
});

test.describe('mobile supplier', () => {
  test.use({ storageState: SUPPLIER_STATE });

  test('F · ordini fornitore + catalogo mobile', async ({ page }) => {
    await gotoTimed(page, '/supplier/orders', 'mobile ordini fornitore');
    expect.soft(await hasHorizontalOverflow(page)).toBe(false);
    await snap(page, 'F-mobile-supplier-ordini');
    await gotoTimed(page, '/supplier/catalog', 'mobile catalogo');
    expect.soft(await hasHorizontalOverflow(page)).toBe(false);
    await snap(page, 'F-mobile-supplier-catalogo');
  });
});

test('F · portale: pagina token non valido leggibile su mobile', async ({ page }) => {
  await page.goto('/portal/token-non-valido/orders');
  await expect(page.getByText(/Link scaduto o non valido/)).toBeVisible();
  expect.soft(await hasHorizontalOverflow(page)).toBe(false);
  await snap(page, 'F-mobile-portale-expired');
});
