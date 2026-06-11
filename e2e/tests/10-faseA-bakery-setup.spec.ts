// =============================================================================
// FASE A — Setup bakery: dashboard, fornitori, anagrafica ingredienti,
// "libro ricette" (caricamento manuale: l'app NON ha import massivo — gap
// di prodotto P-03 documentato nel report).
// =============================================================================

import { test, expect } from '@playwright/test';
import { BAKERY_STATE } from '../helpers/accounts';
import { BAKERY_INGREDIENTS, RECIPES } from '../helpers/dataset';
import { ensureIngredient, ensureRecipe } from '../helpers/flows';
import { gotoTimed, logFinding, note, snap } from '../helpers/audit';

test.use({ storageState: BAKERY_STATE });
test.describe.configure({ mode: 'serial' });

test('A1-A2 · dashboard iniziale leggibile e coerente', async ({ page }) => {
  await gotoTimed(page, '/dashboard', 'dashboard bakery');
  await expect(page.getByText('Buongiorno')).toBeVisible();
  await expect(page.getByText('KPI OPERATIVI')).toBeVisible();
  await snap(page, 'A-dashboard');
});

test('A3 · fornitori: connessione marketplace e anagrafica visibili', async ({ page }) => {
  await gotoTimed(page, '/suppliers', 'fornitori');
  await expect(page.getByRole('heading', { name: 'Fornitori' })).toBeVisible();
  await expect(page.getByText('matteo emiri').first()).toBeVisible();
  await snap(page, 'A-fornitori');
});

test('A4-A5 · anagrafica ingredienti realistica (14 referenze)', async ({ page }) => {
  test.setTimeout(600_000);
  for (const ing of BAKERY_INGREDIENTS) {
    await ensureIngredient(page, ing);
  }
  await page.goto('/ingredients');
  await snap(page, 'A-ingredienti');
  // BUG-05: il form /ingredients/new non ha il campo Fornitore (solo l'edit
  // lo espone) → i nuovi ingredienti nascono senza fornitore e l'auto-riordino
  // genera 0 bozze. Evidenza:
  await page.goto('/ingredients/new');
  const supplierField = page.getByLabel(/Fornitore/);
  if ((await supplierField.count()) === 0) {
    logFinding({
      id: 'BUG-05', severity: 'High', role: 'Bakery', area: 'Catalog', type: 'bug',
      title: 'Form nuovo ingrediente senza campo Fornitore → auto-riordino a vuoto',
      steps: ['/ingredients/new', 'compila e salva', 'piano → Genera bozze per fornitore'],
      expected: 'Possibilità di assegnare il fornitore alla creazione',
      observed: 'Campo assente; "Genera bozze" risponde "✓ 0 bozze create … senza fornitore esclusi"',
      cause: 'app/(main)/ingredients/new/page.tsx non rende il select supplierId (presente in [id]/page.tsx)',
      fix: 'Aggiungere il select fornitore al form di creazione + bulk-assign dalla lista',
    });
  } else {
    note('BUG-05 non più riproducibile: campo Fornitore presente in /ingredients/new');
  }
});

test('A5 · libro ricette (4 ricette, ingredienti coerenti)', async ({ page }) => {
  test.setTimeout(600_000);
  for (const r of RECIPES) {
    await ensureRecipe(page, r);
  }
  await page.goto('/recipes');
  await snap(page, 'A-ricette');
});

test('A6 · ricetta leggibile, food cost reale, modificabile', async ({ page }) => {
  await page.goto('/recipes');
  await page.getByText('Croissant classico').first().click();
  await expect(page.getByText('FOOD COST')).toBeVisible();
  await expect(page.getByText('Totale batch')).toBeVisible();
  await snap(page, 'A-ricetta-dettaglio');
  // modifica: prezzo di vendita → margine visibile
  await page.getByRole('link', { name: /Modifica ricetta/ }).click();
  const sell = page.getByLabel(/Prezzo di vendita/);
  await sell.fill('1.30'); // type=number: SOLO punto decimale (BUG-12 nel report)
  await page.getByRole('button', { name: /Salva modifiche/ }).click();
  await page.waitForURL(/\/recipes\/[0-9a-f-]+$/, { timeout: 30_000 });
  await expect(page.getByText(/Margine/i)).toBeVisible();
  await snap(page, 'A-ricetta-margine');
});
