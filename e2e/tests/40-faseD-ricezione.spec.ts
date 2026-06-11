// =============================================================================
// FASE D — Ritorno bakery: registra carico, magazzino, lotti (BUG-02),
// documenti + matching (BUG-03), listino prezzi.
// =============================================================================

import { test, expect } from '@playwright/test';
import { BAKERY_STATE } from '../helpers/accounts';
import { gotoTimed, loadState, logFinding, note, saveState, snap } from '../helpers/audit';

test.use({ storageState: BAKERY_STATE });
test.describe.configure({ mode: 'serial' });

test('D17-19 · ordine consegnato visibile + registra carico a magazzino', async ({ page }) => {
  const { mktOrderUrl } = loadState();
  await page.goto(mktOrderUrl);
  await expect(page.getByText('Consegnato').first()).toBeVisible();
  await expect(page.getByText('Storico stato')).toBeVisible();
  await page.getByRole('button', { name: /Registra carico a magazzino/ }).click();
  await expect(page.getByText('Carico registrato a magazzino')).toBeVisible({ timeout: 45_000 });
  const link = page.getByRole('link', { name: /Vedi ricezione/ });
  const href = await link.getAttribute('href');
  saveState({ poUrl: href });
  await snap(page, 'D-carico-registrato');
});

test('D20 · magazzino: livelli e valore aggiornati', async ({ page }) => {
  await gotoTimed(page, '/inventory', 'magazzino');
  await expect(page.getByText(/ingredienti tracciati/)).toBeVisible();
  await expect(page.getByText('VALORE STIMATO')).toBeVisible();
  await snap(page, 'D-magazzino');
  await page.goto('/inventory/movements');
  await expect(page.getByText(/purchase|carico|Carico/i).first()).toBeVisible();
  await snap(page, 'D-movimenti');
});

test('D23 · lotti e scadenze sulla ricezione (BUG-02)', async ({ page }) => {
  const { poUrl } = loadState();
  await page.goto(poUrl!);
  await expect(page.getByText('Lotti e scadenze')).toBeVisible();
  const form = page.locator('form').filter({ has: page.locator('input[name="lotNumber"]') }).first();
  await form.locator('input[name="lotNumber"]').fill('BU26-TEST');
  await form.locator('input[name="expiryDate"]').fill(new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10));
  await form.getByRole('button', { name: 'Registra' }).click();
  await page.waitForTimeout(4000);
  if (await page.getByText('Invalid input').count()) {
    await snap(page, 'BUG-02-lotti-invalid-input');
    logFinding({
      id: 'BUG-02', severity: 'High', role: 'Bakery', area: 'Inventory/Lotti', type: 'bug',
      title: 'Registrazione lotto/scadenza sempre rifiutata ("Invalid input")',
      steps: ['ordine ricevuto', 'sezione Lotti e scadenze', 'compila lotto+scadenza', 'Registra'],
      expected: 'Lotto registrato (HACCP/FEFO)',
      observed: '"Invalid input" per qualunque input valido',
      cause: "recordBatchAction passa notes=null (campo assente nel form); createBatchSchema.notes non accetta null",
      fix: "modules/inventory/schemas.ts: notes → .nullish() oppure ?? '' nell'action",
    });
  } else {
    note('BUG-02 non più riproducibile: lotto registrato da UI.');
  }
});

test('D21-24 · documenti: DDT ricevuto e matching con ordine (BUG-03)', async ({ page }) => {
  await gotoTimed(page, '/documents', 'documenti');
  await expect(page.getByText(/DDT/).first()).toBeVisible();
  await page.getByRole('link', { name: /Apri/ }).first().click();
  await page.waitForURL(/\/documents\/[0-9a-f-]+/);
  await snap(page, 'D-documento');
  // matching con l'ordine specchio (8 righe)
  const sel = page.locator('select').last();
  const opts = await sel.locator('option').allTextContents();
  const target = opts.find((o) => /8 righe/.test(o));
  if (target) {
    await sel.selectOption({ label: target });
    await page.getByRole('button', { name: /Associa e verifica|Ri-esegui matching/ }).click();
    await page.waitForTimeout(6000);
    const anomalie = await page.getByText(/\d+ aperte/).textContent().catch(() => null);
    note(`Esito matching: ${anomalie ?? 'nessuna anomalia visibile'}`);
    if (anomalie && parseInt(anomalie) > 0) {
      await snap(page, 'BUG-03-false-anomalie');
      logFinding({
        id: 'BUG-03', severity: 'Critical', role: 'Entrambi', area: 'Documenti/Matching', type: 'bug',
        title: 'Matching documento↔ordine: false anomalie su documento identico all\'ordine',
        steps: ['DDT inviato dal fornitore dallo stesso ordine', '/documents → Apri', 'seleziona ordine specchio', 'Associa e verifica'],
        expected: '0 anomalie (righe identiche per nome, qty e prezzo)',
        observed: `${anomalie} (ogni riga sia "non ordinata" sia "mancante")`,
        cause: 'matchDocumentToOrder confronta solo order_line_item_id/ingredient_product_id, entrambi null sulle righe caricate dal fornitore; nessun fallback per nome',
        fix: 'popolare order_line_item_id in supplierUploadDocument (provenienza nota) e/o fallback match per nome normalizzato',
      });
    }
  }
});

test('D22 · listino: importa prezzi dall\'ultimo ordine ricevuto (BUG-09 refresh)', async ({ page }) => {
  await page.goto('/suppliers');
  // entra nella scheda del fornitore marketplace (auto-creato) → listino
  await page.getByRole('link', { name: /Scheda/ }).first().click();
  await page.getByRole('link', { name: /Gestisci listino/ }).click();
  await page.waitForURL(/\/price-list/);
  await page.getByRole('button', { name: /Importa prezzi/ }).click();
  await expect(page.getByText(/prezzi importati/)).toBeVisible({ timeout: 30_000 });
  const vociPrima = await page.getByText(/voci attive/).textContent();
  await page.reload();
  const vociDopo = await page.getByText(/voci attive/).textContent();
  note(`Listino senza reload: "${vociPrima}" / dopo reload: "${vociDopo}"`);
  if (/0 voci/.test(vociPrima ?? '') && !/0 voci/.test(vociDopo ?? '')) {
    logFinding({
      id: 'BUG-09', severity: 'Low', role: 'Bakery', area: 'Listino', type: 'bug',
      title: 'Import listino: successo senza refresh dei dati (serve reload manuale)',
      expected: 'Lista aggiornata subito dopo "✓ N prezzi importati"',
      observed: 'Pagina resta su "Listino vuoto" e bottone su "Operazione in corso…"',
      fix: 'revalidatePath/router.refresh dopo successo dell\'action',
    });
  }
  await snap(page, 'D-listino');
});
