// =============================================================================
// e2e/helpers/flows.ts
// Azioni riutilizzabili dei due ruoli. Locator user-facing (label/ruolo/testo),
// pattern "ensure-*" per idempotenza tra run.
// =============================================================================

import { expect, type Page } from '@playwright/test';
import { note } from './audit';
import type { IngredientSeed, RecipeSeed } from './dataset';

/** Crea l'ingrediente se non già presente nella lista. */
export async function ensureIngredient(page: Page, ing: IngredientSeed): Promise<void> {
  await page.goto('/ingredients');
  if (await page.getByRole('cell', { name: ing.name, exact: true }).count()) {
    note(`Ingrediente già presente, skip: ${ing.name}`);
    return;
  }
  await page.goto('/ingredients/new');
  await page.getByLabel(/^Nome/).fill(ing.name);
  await page.getByLabel(/Unità di misura/).selectOption(ing.unit);
  if (ing.sku) await page.getByLabel(/SKU/).fill(ing.sku);
  await page.getByLabel(/Prezzo per unità/).fill(ing.unitPrice);
  await page.getByRole('button', { name: 'Salva ingrediente' }).click();
  // post-success: redirect alla lista
  await page.waitForURL(/\/ingredients$/, { timeout: 30_000 });
  await expect(page.getByRole('cell', { name: ing.name, exact: true })).toBeVisible();
}

/** Crea la ricetta se non già presente. Compila le righe dinamiche. */
export async function ensureRecipe(page: Page, recipe: RecipeSeed): Promise<void> {
  await page.goto('/recipes');
  if (await page.getByText(recipe.name, { exact: true }).count()) {
    note(`Ricetta già presente, skip: ${recipe.name}`);
    return;
  }
  await page.goto('/recipes/new');
  await page.getByLabel('Emoji').fill(recipe.emoji);
  await page.getByLabel(/^Nome/).fill(recipe.name);
  await page.getByLabel(/Categoria/).fill(recipe.category);
  await page.getByLabel(/Porzioni base/).fill(String(recipe.basePortions));
  if (recipe.sellPrice) {
    // NB: campo type=number — Playwright fill richiede il punto decimale.
    await page.getByLabel(/Prezzo di vendita/).fill(recipe.sellPrice.replace(',', '.'));
  }
  if (recipe.notes) await page.getByLabel(/^Note/).fill(recipe.notes);

  // Righe ingredienti: la prima esiste già.
  for (let i = 1; i < recipe.ingredients.length; i++) {
    await page.getByRole('button', { name: '+ Aggiungi riga' }).click();
  }
  const rows = page.locator('div.flex.gap-2.items-center');
  for (let i = 0; i < recipe.ingredients.length; i++) {
    const line = recipe.ingredients[i];
    const row = rows.nth(i);
    await row.locator('select').first().selectOption({ label: line.name });
    await row.locator('input').first().fill(line.quantity);
    await row.locator('select').nth(1).selectOption(line.unit);
  }
  await page.getByRole('button', { name: 'Salva ricetta' }).click();
  await page.waitForURL(/\/recipes$/, { timeout: 30_000 });
  await expect(page.getByText(recipe.name, { exact: true })).toBeVisible();
}

/** Login UI puro (per i test che non usano gli storageState). */
export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45_000 });
}

/** Cambio stato ordine marketplace (lato che ha il permesso). */
export async function advanceMarketplaceOrder(page: Page, orderUrl: string, toLabel: string): Promise<void> {
  await page.goto(orderUrl);
  await page.getByRole('button', { name: `→ ${toLabel}` }).click();
  await expect(page.getByText(toLabel, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
}
