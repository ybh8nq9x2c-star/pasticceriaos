// =============================================================================
// FASE H — Area commerciale unica (post-ristrutturazione Vendite, P0-5).
// Copertura minima dei path critici: hub /sales con tab e stato POS, ordini
// cliente come tab della stessa area, wizard /sales/pos, inbox, redirect legacy.
// Selettori: data-testid stabili (sales-tab-*, pos-status-cta) dove esistono.
// =============================================================================

import { test, expect } from '@playwright/test';
import { BAKERY_STATE } from '../helpers/accounts';

test.describe.configure({ mode: 'serial' });

test.describe('area vendite', () => {
  test.use({ storageState: BAKERY_STATE });

  test('H · hub /sales: tab area + stato POS con CTA contestuale', async ({ page }) => {
    await page.goto('/sales');
    await expect(page.getByTestId('sales-tab-overview')).toBeVisible();
    await expect(page.getByTestId('sales-tab-customers')).toBeVisible();
    await expect(page.getByTestId('sales-tab-pos')).toBeVisible();
    // La card POS risponde SEMPRE con una sola azione contestuale.
    await expect(page.getByTestId('pos-status-cta')).toBeVisible();
  });

  test('H · ordini cliente = tab della stessa area (non voce di menu)', async ({ page }) => {
    await page.goto('/sales');
    await page.getByTestId('sales-tab-customers').click();
    await expect(page).toHaveURL(/\/customers$/);
    await expect(page.getByRole('heading', { name: 'Ordini cliente' })).toBeVisible();
    // Le tab restano visibili anche qui: è la stessa area mentale.
    await expect(page.getByTestId('sales-tab-overview')).toBeVisible();
  });

  test('H · wizard POS: 6 passi con stato reale + ricontrollo', async ({ page }) => {
    await page.goto('/sales/pos');
    await expect(page.getByRole('heading', { name: 'Connetti il tuo POS' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'La tua cassa' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Collega i prodotti alle ricette' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tracking attivo' })).toBeVisible();
    await expect(page.getByTestId('pos-refresh-status')).toBeVisible();
  });

  test('H · inbox POS raggiungibile e onesta da vuota', async ({ page }) => {
    await page.goto('/sales/inbox');
    await expect(page.getByRole('heading', { name: 'Inbox POS' })).toBeVisible();
  });

  test('H · deep-link legacy /settings/pos → /sales/pos (con highlight)', async ({ page }) => {
    await page.goto('/settings/pos?highlight=corn01');
    await expect(page).toHaveURL(/\/sales\/pos\?highlight=corn01$/);
    await expect(page.getByRole('heading', { name: 'Connetti il tuo POS' })).toBeVisible();
  });
});
