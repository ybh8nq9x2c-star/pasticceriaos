// =============================================================================
// FASE C — Flusso fornitore: catalogo, ricezione ordine, pipeline stati,
// invio documento (DDT) al cliente.
// =============================================================================

import { test, expect } from '@playwright/test';
import { SUPPLIER_STATE } from '../helpers/accounts';
import { SUPPLIER_CATALOG } from '../helpers/dataset';
import { gotoTimed, loadState, logFinding, note, snap } from '../helpers/audit';

test.use({ storageState: SUPPLIER_STATE });
test.describe.configure({ mode: 'serial' });

test('C-prep · catalogo fornitore: aggiunta prodotto da UI (BUG-01)', async ({ page }) => {
  await gotoTimed(page, '/supplier/catalog', 'catalogo fornitore');
  const item = SUPPLIER_CATALOG[0];
  await page.getByLabel(/Nome/).fill(item.name);
  await page.getByLabel(/Unità/).selectOption(item.unit);
  await page.getByLabel(/€\/u/).fill(item.price);
  await page.getByRole('button', { name: 'Aggiungi' }).click();
  await page.waitForTimeout(4000);
  const invalid = await page.getByText('Invalid input').count();
  if (invalid > 0) {
    await snap(page, 'BUG-01-catalogo-invalid-input');
    logFinding({
      id: 'BUG-01', severity: 'Critical', role: 'Supplier', area: 'Marketplace/Catalogo', type: 'bug',
      title: 'Impossibile aggiungere prodotti a catalogo da UI ("Invalid input")',
      steps: ['/supplier/catalog', 'compila Nome/Unità/€-u', 'Aggiungi'],
      expected: 'Prodotto aggiunto al catalogo',
      observed: 'Errore "Invalid input" per qualunque input valido',
      cause: 'Il form non ha il campo sku → upsertCatalogItemAction passa null; catalogItemSchema.sku non accetta null (manca .nullish())',
      fix: "modules/marketplace/schemas.ts: sku → .nullish().or(z.literal('')) oppure coalescenza ?? '' nell'action",
    });
  } else {
    note('BUG-01 non più riproducibile: catalogo aggiunto da UI.');
  }
});

test('C11-13 · ordine ricevuto: righe, quantità, totale, filtri stato', async ({ page }) => {
  await gotoTimed(page, '/supplier/orders', 'ordini clienti');
  await expect(page.getByText(/ordini ricevuti dai clienti/)).toBeVisible();
  await expect(page.getByText(/In attesa \(\d+\)/)).toBeVisible();
  const { mktOrderId } = loadState();
  await page.goto(`/supplier/orders/${mktOrderId}`);
  await expect(page.getByText('Totale ordine')).toBeVisible();
  await expect(page.getByText('Storico stato')).toBeVisible();
  await snap(page, 'C-ordine-ricevuto');
});

test('C14 · pipeline: Accettato → In preparazione → Spedito → Consegnato', async ({ page }) => {
  test.setTimeout(180_000);
  const { mktOrderId } = loadState();
  const url = `/supplier/orders/${mktOrderId}`;
  for (const stato of ['Accettato', 'In preparazione', 'Spedito', 'Consegnato']) {
    await page.goto(url);
    await page.getByRole('button', { name: `→ ${stato}` }).click();
    await expect(page.getByText(stato, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    note(`Transizione OK → ${stato}`);
  }
  await snap(page, 'C-ordine-consegnato');
});

test('C15 · invio DDT al cliente (metadati: nessun upload file — gap P-06)', async ({ page }) => {
  const { mktOrderId } = loadState();
  await page.goto(`/supplier/orders/${mktOrderId}`);
  const fileInput = page.locator('form:has-text("Invia documento") input[type="file"]');
  if ((await fileInput.count()) === 0) {
    note('P-06 confermato: il form documento fornitore non supporta allegati file.');
  }
  await page.locator('select[name="documentType"]').selectOption('delivery_note');
  await page.locator('input[name="documentNumber"]').fill(`DDT-2026-${String(Date.now()).slice(-4)}`);
  await page.locator('input[name="documentDate"]').fill(new Date().toISOString().slice(0, 10));
  await page.locator('input[name="notes"]').fill('Consegna mattina come da accordi.');
  await page.getByRole('button', { name: /Invia documento/ }).click();
  await expect(page.getByText('Documento inviato al cliente')).toBeVisible({ timeout: 30_000 });
  await snap(page, 'C-ddt-inviato');
});

test('C16 · portale token: link non valido gestito; generazione bloccata in prod (BUG-04)', async ({ page }) => {
  // Il portale è token-based e senza auth: testabile senza logout.
  await page.goto('/portal/token-non-valido-123/orders');
  await expect(page).toHaveURL(/\/portal\/expired/);
  await expect(page.getByText(/Link scaduto o non valido/)).toBeVisible();
  note('Gestione token invalido OK. Generazione link reale bloccata da SUPPLIER_TOKEN_SECRET mancante in prod (BUG-04, lato bakery).');
});
