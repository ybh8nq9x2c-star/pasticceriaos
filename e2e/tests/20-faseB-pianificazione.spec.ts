// =============================================================================
// FASE B — Piano produzione, fabbisogno, suggerimenti d'ordine, ordini reali
// (interno auto-generato + marketplace verso il fornitore connesso).
// =============================================================================

import { test, expect } from '@playwright/test';
import { BAKERY_STATE } from '../helpers/accounts';
import { PRODUCTION_PLAN, MARKETPLACE_ORDER_QTY, ORDER_NOTE } from '../helpers/dataset';
import { gotoTimed, logFinding, note, saveState, snap } from '../helpers/audit';

test.use({ storageState: BAKERY_STATE });
test.describe.configure({ mode: 'serial' });

function tomorrow(): string {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

test('B7 · crea piano produzione per domani', async ({ page }) => {
  await gotoTimed(page, '/production/new', 'nuovo piano');
  await page.getByLabel(/Data produzione/).fill(tomorrow());
  await page.getByLabel(/^Note/).fill('Banco colazione + ordini weekend.');
  for (let i = 1; i < PRODUCTION_PLAN.length; i++) {
    await page.getByRole('button', { name: '+ Aggiungi ricetta' }).click();
  }
  const rows = page.locator('div.flex.gap-2.items-center');
  for (let i = 0; i < PRODUCTION_PLAN.length; i++) {
    const row = rows.nth(i);
    await row.locator('select').selectOption({ label: new RegExp(PRODUCTION_PLAN[i].recipe) as unknown as string }).catch(async () => {
      // selectOption by regex label non supportato: risolvi a mano
      const options = await row.locator('select option').allTextContents();
      const match = options.find((o) => o.includes(PRODUCTION_PLAN[i].recipe));
      await row.locator('select').selectOption({ label: match! });
    });
    await row.locator('input[type="number"]').fill(String(PRODUCTION_PLAN[i].batches));
  }
  await page.getByRole('button', { name: 'Crea piano' }).click();
  await page.waitForURL(/\/production$/, { timeout: 30_000 });
  await page.getByText(/giu|lug|ago|set|ott|nov|dic|gen|feb|mar|apr|mag/).first().click();
  await page.waitForURL(/\/production\/[0-9a-f-]+/);
  saveState({ planUrl: page.url() });
  await snap(page, 'B-piano-creato');
});

test('B8-B9 · fabbisogno coerente, shortage e costo riordino', async ({ page }) => {
  const { planUrl } = (await import('../helpers/audit')).loadState();
  await page.goto(planUrl);
  await expect(page.getByText('Fabbisogno ingredienti')).toBeVisible();
  await expect(page.getByText(/shortage/)).toBeVisible();
  await expect(page.getByText(/Costo riordino stimato/)).toBeVisible();
  await snap(page, 'B-fabbisogno');
});

test('B10a · bozza ordine interno auto-generata dallo shortage', async ({ page }) => {
  const { planUrl } = (await import('../helpers/audit')).loadState();
  await page.goto(planUrl);
  await page.getByRole('button', { name: /Genera bozze per fornitore/ }).click();
  const result = page.getByText(/bozze ordine create/);
  await expect(result).toBeVisible({ timeout: 30_000 });
  const text = await result.textContent();
  note(`Esito generazione bozze: ${text}`);
  if (/0 bozze/.test(text ?? '')) {
    logFinding({
      id: 'BUG-05b', severity: 'High', role: 'Bakery', area: 'Ordering', type: 'bug',
      title: 'Genera bozze → 0 bozze (ingredienti senza fornitore) con messaggio di successo',
      observed: text ?? '', expected: 'Bozze create o warning chiaro con CTA di fix',
    });
  }
  await snap(page, 'B-bozze-generate');
});

test('B10b · ordine marketplace realistico al fornitore connesso', async ({ page }) => {
  await gotoTimed(page, '/marketplace/suppliers', 'fornitori collegati');
  await page.getByRole('link', { name: '+ Ordine' }).first().click();
  await page.waitForURL(/\/marketplace\/orders\/new/);

  // quantità da riordino reale (sacchi/cartoni)
  const rows = page.locator('table tbody tr');
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    const name = (await row.locator('td').first().textContent())?.trim() ?? '';
    const key = Object.keys(MARKETPLACE_ORDER_QTY).find((k) => name.startsWith(k));
    if (key) await row.locator('input').fill(MARKETPLACE_ORDER_QTY[key]);
  }
  await page.getByLabel(/Note/).fill(ORDER_NOTE);
  await snap(page, 'B-composer-compilato');
  await page.getByRole('button', { name: 'Invia ordine' }).click();
  await page.waitForURL(/\/marketplace\/orders\/[0-9a-f-]+$/, { timeout: 45_000 });
  await expect(page.getByText('Inviato').first()).toBeVisible();
  saveState({ mktOrderUrl: page.url(), mktOrderId: page.url().split('/').pop() });
  await snap(page, 'B-ordine-marketplace-inviato');
});
