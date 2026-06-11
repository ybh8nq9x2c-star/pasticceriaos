// =============================================================================
// FASE G — Robustezza: edge case realistici (niente rotture artificiali).
// =============================================================================

import { test, expect } from '@playwright/test';
import { BAKERY_STATE, SUPPLIER_STATE, SUPPLIER } from '../helpers/accounts';
import { loadState, logFinding, note, snap } from '../helpers/audit';

test.describe.configure({ mode: 'serial' });

test.describe('bakery edge cases', () => {
  test.use({ storageState: BAKERY_STATE });

  test('G · ordine marketplace senza righe → errore chiaro', async ({ page }) => {
    await page.goto('/marketplace/suppliers');
    await page.getByRole('link', { name: '+ Ordine' }).first().click();
    await page.waitForURL(/\/marketplace\/orders\/new/);
    await page.getByRole('button', { name: 'Invia ordine' }).click();
    await expect(page.getByRole('alert')).toContainText('Aggiungi almeno un prodotto');
    await snap(page, 'G-ordine-vuoto');
  });

  test('G · quantità con virgola e quantità estreme nel composer', async ({ page }) => {
    await page.goto('/marketplace/suppliers');
    await page.getByRole('link', { name: '+ Ordine' }).first().click();
    await page.waitForURL(/\/marketplace\/orders\/new/);
    const firstQty = page.locator('table tbody tr').first().locator('input');
    await firstQty.fill('2,5');
    await expect(page.getByText(/Totale:/)).not.toContainText('NaN'); // parsing virgola ok
    await firstQty.fill('999999');
    const tot = await page.getByText(/Totale: /).textContent();
    note(`Quantità 999999 accettata senza avviso (totale ${tot}) — nessun sanity check (Low)`);
    // niente submit: restiamo realistici
  });

  test('G · campi obbligatori mancanti su nuovo ingrediente', async ({ page }) => {
    await page.goto('/ingredients/new');
    await page.getByRole('button', { name: 'Salva ingrediente' }).click();
    // validazione HTML5: restiamo sul form
    await expect(page).toHaveURL(/\/ingredients\/new/);
    const invalid = await page.locator('input:invalid, select:invalid').count();
    expect(invalid).toBeGreaterThan(0);
  });

  test('G · refresh durante composer: dati persi senza avviso (UX)', async ({ page }) => {
    await page.goto('/marketplace/suppliers');
    await page.getByRole('link', { name: '+ Ordine' }).first().click();
    await page.waitForURL(/\/marketplace\/orders\/new/);
    await page.locator('table tbody tr').first().locator('input').fill('5');
    await page.reload();
    const v = await page.locator('table tbody tr').first().locator('input').inputValue();
    if (v === '') {
      note('UX: refresh nel composer perde le quantità senza warning beforeunload (atteso ma da valutare draft persistence).');
    }
  });

  test('G · doppio "Registra carico" idempotente', async ({ page }) => {
    const { mktOrderUrl } = loadState();
    await page.goto(mktOrderUrl);
    // dopo FASE D la CTA è sostituita dal banner: non deve esserci un secondo bottone
    await expect(page.getByText('Carico registrato a magazzino')).toBeVisible();
    await expect(page.getByRole('button', { name: /Registra carico/ })).toHaveCount(0);
  });

  test('G · ricetta con ingrediente disattivato: nessun avviso (UX-09) e nessun Riattiva (BUG-07)', async ({ page }) => {
    // disattiva un ingrediente non critico
    await page.goto('/ingredients');
    await page.getByRole('row', { name: /Vaniglia/ }).getByRole('link', { name: 'Modifica' }).click();
    await page.getByRole('button', { name: 'Disattiva', exact: true }).click();
    await page.getByRole('button', { name: /Conferma disattivazione/ }).click();
    await page.waitForTimeout(3000);
    // la ricetta che la usa non mostra alcun badge
    await page.goto('/recipes');
    await page.getByText('Pasta frolla base').click();
    const warn = await page.getByText(/disattivat/i).count();
    if (!warn) {
      logFinding({
        id: 'UX-09', severity: 'Medium', role: 'Bakery', area: 'Catalog/Ricette', type: 'ux',
        title: 'Ricette con ingredienti disattivati senza alcun avviso',
        observed: 'La ricetta mostra l\'ingrediente disattivato come normale (incluso nel food cost)',
        expected: 'Badge/warning "ingrediente disattivato" sulla ricetta e nel piano',
        fix: 'Flag visivo su righe ricetta con is_active=false',
      });
    }
    // tenta riattivazione da UI
    await page.goto('/ingredients');
    const visibile = await page.getByText('Vaniglia in bacche').count();
    if (!visibile) {
      logFinding({
        id: 'BUG-07', severity: 'Medium', role: 'Bakery', area: 'Catalog', type: 'bug',
        title: 'Ingrediente disattivato sparisce dalla lista e non è riattivabile da UI',
        observed: 'Nessun filtro "inattivi", nessun bottone Riattiva nella pagina di modifica',
        expected: 'Riattivazione self-service (lo schema updateIngredient supporta isActive)',
        fix: 'Bottone Riattiva + filtro inattivi nella lista',
      });
    }
  });
});

test.describe('supplier edge cases', () => {
  test.use({ storageState: SUPPLIER_STATE });

  test('G · documento duplicato sullo stesso ordine: comportamento', async ({ page }) => {
    const { mktOrderId } = loadState();
    await page.goto(`/supplier/orders/${mktOrderId}`);
    await page.locator('select[name="documentType"]').selectOption('delivery_note');
    await page.locator('input[name="documentNumber"]').fill('DDT-DUP-TEST');
    await page.locator('input[name="documentDate"]').fill(new Date().toISOString().slice(0, 10));
    await page.getByRole('button', { name: /Invia documento/ }).click();
    await page.waitForTimeout(4000);
    note('Invio secondo documento sullo stesso ordine: verificare lato bakery se compaiono duplicati non deduplicati.');
  });
});

test('G · login con password errata: errore leggibile, nessun leak', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(SUPPLIER.email);
  await page.getByLabel('Password').fill('password-sbagliata-123');
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page.getByText(/credenziali|invalid|errat/i)).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/login/);
  await snap(page, 'G-login-errato');
});
