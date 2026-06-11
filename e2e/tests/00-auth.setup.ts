// =============================================================================
// e2e/tests/00-auth.setup.ts
// Login dei due agenti e salvataggio degli auth state separati.
// Verifica anche il workspace gating (bakery → /dashboard, supplier → /supplier).
// =============================================================================

import { test as setup, expect } from '@playwright/test';
import * as fs from 'node:fs';
import { BAKERY, SUPPLIER, AUTH_DIR, BAKERY_STATE, SUPPLIER_STATE } from '../helpers/accounts';
import { gotoTimed, note, snap } from '../helpers/audit';

fs.mkdirSync(AUTH_DIR, { recursive: true });

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await gotoTimed(page, '/login', `login (${email})`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  // Il redirect post-login passa dal middleware: attendi di uscire da /login.
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45_000 });
}

setup('login pasticceria (agente 1) e salva auth state', async ({ page }) => {
  await login(page, BAKERY.email, BAKERY.password);
  await expect(page).toHaveURL(/\/dashboard/);
  note(`Bakery login OK → ${page.url()}`);
  await snap(page, 'setup-bakery-dashboard');
  await page.context().storageState({ path: BAKERY_STATE });
});

setup('login fornitore (agente 2) e salva auth state', async ({ page }) => {
  await login(page, SUPPLIER.email, SUPPLIER.password);
  // BUG-06 noto: il supplier può atterrare su /dashboard (contenuto fornitore
  // servito sotto path cliente) invece di /supplier. Qui si documenta senza
  // bloccare la suite: il fail-fast vero è nel test di gating sotto.
  if (!/\/supplier/.test(page.url())) {
    note(`BUG-06 riprodotto: supplier atterrato su ${page.url()} invece di /supplier`);
    await snap(page, 'BUG-06-supplier-landing-dashboard');
  }
  await expect(page.getByText('FORNITORE').first()).toBeVisible({ timeout: 20_000 });
  note(`Supplier login OK → ${page.url()}`);
  await snap(page, 'setup-supplier-home');
  await page.context().storageState({ path: SUPPLIER_STATE });
});

setup('workspace gating: il fornitore non accede all\'area pasticceria', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: SUPPLIER_STATE });
  const page = await ctx.newPage();
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/supplier/); // middleware redirect
  await ctx.close();
});
