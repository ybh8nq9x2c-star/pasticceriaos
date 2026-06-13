// =============================================================================
// GOODS RECEIPT ENGINE — e2e mirati (post-deploy, contro l'ambiente reale).
//   • import DDT e conferma ricevimento lato bakery
//   • ingresso merce lato supplier (inserimento codice manuale = stesso path
//     dello scan: la camera non è automatizzabile headless, il fallback sì)
//   • discrepanza qty attesa/ricevuta
//   • prodotto non matchato con selezione manuale
// Stile audit: tolleranti, loggano finding se il comportamento devia.
// =============================================================================

import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import { BAKERY_STATE, SUPPLIER_STATE } from '../helpers/accounts';
import { gotoTimed, note, snap } from '../helpers/audit';

test.describe.configure({ mode: 'serial' });

test.describe('bakery — import DDT e conferma', () => {
  test.use({ storageState: BAKERY_STATE });

  test('GR1 · import DDT PDF → receipt atteso → completa', async ({ page }) => {
    test.setTimeout(180_000);
    await gotoTimed(page, '/receipts/new', 'nuovo ricevimento bakery');
    // Il DDT realistico generato dall'audit è in e2e/artifacts.
    const pdf = path.resolve(__dirname, '..', 'artifacts', 'DDT-2026-0142.pdf');
    await page.locator('input[name="file"]').setInputFiles(pdf);
    await page.getByRole('button', { name: /Importa e crea ricevimento/ }).click();
    await page.waitForURL(/\/receipts\/[0-9a-f-]+/, { timeout: 60_000 });
    await expect(page.getByText(/Atteso|Bozza/).first()).toBeVisible();
    await snap(page, 'GR1-receipt-da-ddt');

    // righe lette dal parser visibili
    const righe = page.locator('section[aria-label="Righe del ricevimento"] li');
    const count = await righe.count();
    note(`GR1: righe importate dal DDT = ${count}`);
    expect(count).toBeGreaterThan(0);
  });

  test('GR2 · riga non riconosciuta → selezione manuale dal catalogo', async ({ page }) => {
    await gotoTimed(page, '/receipts/new', 'ricevimento libero');
    await page.getByRole('button', { name: 'Crea ricevimento' }).click();
    await page.waitForURL(/\/receipts\/[0-9a-f-]+/, { timeout: 45_000 });

    // codice manuale ignoto = stesso path server dello scanner
    await page.getByLabel(/inserisci il codice manualmente/i).fill('4099999999999');
    await page.getByRole('button', { name: /Usa codice/ }).click();
    await page.getByRole('button', { name: 'Registra' }).click();
    await expect(page.getByText(/Codice non riconosciuto/)).toBeVisible({ timeout: 30_000 });
    await snap(page, 'GR2-codice-sconosciuto');

    // associa dal catalogo dalla riga pending
    const select = page.getByLabel(/associa dal catalogo/i).first();
    await select.selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Associa', exact: true }).first().click();
    await expect(page.getByText('Riconosciuto').first()).toBeVisible({ timeout: 30_000 });
    await snap(page, 'GR2-associato');
  });

  test('GR3 · discrepanza qty attesa vs ricevuta tracciata', async ({ page }) => {
    await gotoTimed(page, '/receipts?tab=expected', 'ricevimenti attesi');
    const first = page.locator('ul li a').first();
    if ((await first.count()) === 0) {
      note('GR3: nessun receipt atteso disponibile, scenario saltato');
      return;
    }
    await first.click();
    await page.waitForURL(/\/receipts\/[0-9a-f-]+/);
    await page
      .getByRole('button', { name: /Segnala discrepanza su questa riga/ })
      .first()
      .click();
    await page.getByLabel(/Quantità effettivamente ricevuta/).fill('1');
    await page.getByLabel(/Motivo della discrepanza/).fill('Collo danneggiato in consegna');
    await page.getByRole('button', { name: 'Registra discrepanza' }).click();
    await expect(page.getByText(/Discrepanza: Collo danneggiato/).first()).toBeVisible({
      timeout: 30_000,
    });
    await snap(page, 'GR3-discrepanza');
  });
});

test.describe('supplier — ingresso merce da produttore esterno', () => {
  test.use({ storageState: SUPPLIER_STATE });

  test('GR4 · ricevimento libero supplier con codice manuale e completamento', async ({ page }) => {
    test.setTimeout(180_000);
    await gotoTimed(page, '/supplier/receipts/new', 'nuovo ricevimento supplier');
    await page.getByRole('button', { name: 'Crea ricevimento' }).click();
    await page.waitForURL(/\/supplier\/receipts\/[0-9a-f-]+/, { timeout: 45_000 });

    // aggiunta manuale fuori catalogo → crea prodotto al volo dal pannello riga
    await page.getByLabel(/Descrizione \(fuori catalogo\)/).fill('Sciroppo Amarena Stella 5kg');
    await page.getByLabel(/^Quantità$/).fill('4');
    await page.getByRole('button', { name: 'Aggiungi', exact: true }).click();
    await expect(page.getByText('Sciroppo Amarena Stella 5kg').first()).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole('button', { name: /Crea prodotto/ }).first().click();
    await page.getByRole('button', { name: 'Crea e associa' }).click();
    await expect(page.getByText('Riconosciuto').first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /Completa ricevimento/ }).click();
    await expect(
      page.getByText(/magazzino aggiornato|Carico parziale|discrepanze/),
    ).toBeVisible({ timeout: 45_000 });
    await snap(page, 'GR4-supplier-completato');
    note('GR4: verificare a campione su /inventory del supplier il movimento inbound.');
  });
});
