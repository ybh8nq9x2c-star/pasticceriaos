// =============================================================================
// FASE E — Produzione: completamento piano, scarico ingredienti (FEFO),
// food cost e analytics aggiornati.
// =============================================================================

import { test, expect } from '@playwright/test';
import { BAKERY_STATE } from '../helpers/accounts';
import { gotoTimed, loadState, logFinding, note, snap } from '../helpers/audit';

test.use({ storageState: BAKERY_STATE });
test.describe.configure({ mode: 'serial' });

test('E25-26 · completa piano: scarico magazzino (P-01: nessun warning su shortage)', async ({ page }) => {
  const { planUrl } = loadState();
  await page.goto(planUrl);
  const shortagePrima = await page.getByText(/\d+ shortage/).textContent().catch(() => null);
  page.once('dialog', (d) => d.accept()); // se mai comparisse un confirm
  await page.getByRole('button', { name: /Segna come completato/ }).click();
  await expect(page.getByText('Produzione completata')).toBeVisible({ timeout: 45_000 });
  await snap(page, 'E-piano-completato');
  if (shortagePrima && parseInt(shortagePrima) > 0) {
    logFinding({
      id: 'P-01', severity: 'Medium', role: 'Bakery', area: 'Production', type: 'product',
      title: 'Completamento produzione con shortage permesso senza conferma → stock negativi',
      observed: `Piano completato con "${shortagePrima}" senza alcun avviso; disponibilità in negativo`,
      expected: 'Dialog di conferma che elenchi gli ingredienti che andranno in negativo',
      fix: 'Conferma esplicita lato UI (o blocco soft con override)',
    });
  }
});

test('E26-27 · movimenti production_usage e lotti scalati (FEFO)', async ({ page }) => {
  await gotoTimed(page, '/inventory/movements', 'movimenti');
  await expect(page.getByText(/produzione|production/i).first()).toBeVisible();
  await snap(page, 'E-movimenti-produzione');
  await page.goto('/inventory/batches');
  await snap(page, 'E-lotti-residui');
  note('Verificare a campione: residuo lotto = ricevuto − consumato dal piano.');
});

test('E28-29 · dashboard e analytics riflettono la giornata', async ({ page }) => {
  await gotoTimed(page, '/dashboard', 'dashboard post-produzione');
  await expect(page.getByText('SPESA MESE CORRENTE')).toBeVisible();
  await expect(page.getByText('FOOD COST MEDIO')).toBeVisible();
  await snap(page, 'E-dashboard');
  await gotoTimed(page, '/analytics', 'analytics');
  await expect(page.getByText('Spesa mensile')).toBeVisible();
  await expect(page.getByText('Food cost per ricetta')).toBeVisible();
  await expect(page.getByText(/TOP INGREDIENTI PER SPESA/i)).toBeVisible();
  await snap(page, 'E-analytics');
});
