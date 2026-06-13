// =============================================================================
// FASE D — Ritorno bakery: registra carico, magazzino, lotti (BUG-02),
// documenti + matching (BUG-03), listino prezzi.
// =============================================================================

import { test, expect } from '@playwright/test';
import { BAKERY_STATE } from '../helpers/accounts';
import { gotoTimed, loadState, logFinding, note, saveState, snap } from '../helpers/audit';
import { ensureIngredient } from '../helpers/flows';

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

// ── D25-27 · Integrazione ordine interno → Goods Receipt Engine ──────────────
// Nuovo flusso: dal dettaglio ordine "Ricevi merce" apre il receipt precompilato.
// Valida: niente CTA legacy, deep-link prefill, NESSUN posting immediato al click
// iniziale, preview editabile, correzione qty (parziale) e conferma esplicita.
// Self-contained (crea il PO interno come fixture) e tollerante (skip se manca un
// fornitore in anagrafica). Dati taggati "[E2E]" per la pulizia post-run.
const E2E_ORDER_ING = {
  name: 'E2E Farina test', unit: 'kg' as const, sku: 'E2E-FAR', unitPrice: '1,00',
};

test('D25-27 · ordine → Ricevi merce → preview editabile → conferma (no posting immediato)', async ({ page }) => {
  test.setTimeout(180_000);

  // Fixture self-contained: ingrediente E2E (idempotente via ensure-*).
  await ensureIngredient(page, E2E_ORDER_ING);

  // 1) Crea un PO interno ricevibile.
  await page.goto('/orders/new');
  const supplierSel = page.locator('select[name="supplierId"]');
  if ((await supplierSel.locator('option').count()) <= 1) {
    note('D25: nessun fornitore in anagrafica su questo ambiente → scenario saltato.');
    return;
  }
  await supplierSel.selectOption({ index: 1 });
  await page.getByLabel('Ingrediente riga 1').selectOption({ label: E2E_ORDER_ING.name });
  await page.getByLabel('Quantità riga 1').fill('10');
  await page.locator('textarea[name="notes"]').fill('[E2E] ordine test integrazione receipt');
  await page.getByRole('button', { name: 'Crea ordine' }).click();
  await page.waitForURL(/\/orders$/, { timeout: 30_000 });

  // 2) Apri l'ordine appena creato e portalo a "Confermato"
  //    (transizioni che NON toccano il magazzino).
  await page.locator('a[href^="/orders/"]:not([href$="/new"])').first().click();
  await page.waitForURL(/\/orders\/[0-9a-f-]+$/);
  const orderUrl = page.url();
  await page.getByRole('button', { name: 'Segna come inviato' }).click();
  await expect(page.getByText('Inviato').first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Segna come confermato' }).click();
  await expect(page.getByText('Confermato').first()).toBeVisible({ timeout: 30_000 });

  // 3) La CTA legacy "Segna come ricevuto" NON deve più esistere; la nuova
  //    "Ricevi merce" deve puntare al deep-link del goods receipt engine.
  await expect(page.getByRole('button', { name: 'Segna come ricevuto' })).toHaveCount(0);
  const cta = page.getByRole('link', { name: /Ricevi merce/ });
  await expect(cta).toBeVisible();
  expect(await cta.getAttribute('href')).toMatch(/\/receipts\/new\?order=[0-9a-f-]+/);
  await cta.click();
  await page.waitForURL(/\/receipts\/new\?order=/);
  await expect(page.getByText(/Ricevimento collegato all'ordine/)).toBeVisible();

  // 4) Crea il receipt: preview EDITABILE con righe precompilate dall'ordine.
  await page.getByRole('button', { name: 'Crea ricevimento' }).click();
  await page.waitForURL(/\/receipts\/[0-9a-f-]+/, { timeout: 45_000 });
  await expect(page.getByText(/Atteso/).first()).toBeVisible();
  const righe = page.locator('section[aria-label="Righe del ricevimento"] li');
  expect(await righe.count()).toBeGreaterThan(0);
  await snap(page, 'D25-receipt-da-ordine');

  // 5) NESSUN posting immediato: l'ordine collegato è ancora "Confermato"
  //    (lo stock non si muove finché non si completa il ricevimento).
  await page.goto(orderUrl);
  await expect(page.getByText('Confermato').first()).toBeVisible();
  await page.goBack();

  // 6) Correggi il ricevuto reale (7 < 10 atteso = collo mancante) → parziale.
  await righe.first().getByLabel(/^Ricevuto/).fill('7');
  await righe.first().getByRole('button', { name: 'Salva' }).click();
  await page.waitForTimeout(2000);

  // 7) Conferma esplicita: SOLO ORA si contabilizza (carico parziale).
  await page.getByRole('button', { name: /Completa ricevimento/ }).click();
  await page.getByRole('button', { name: 'Registra carico parziale' }).click();
  await expect(
    page.getByText(/Carico parziale registrato|magazzino aggiornato/),
  ).toBeVisible({ timeout: 45_000 });
  await snap(page, 'D25-carico-parziale-confermato');
});
