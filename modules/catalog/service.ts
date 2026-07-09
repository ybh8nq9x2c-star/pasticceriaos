// =============================================================================
// modules/catalog/service.ts
// Business logic per catalog: suppliers, ingredient_products, recipes.
// Chiamato da actions.ts. Non conosce request/response.
// =============================================================================

import { requireOrgId } from '@/modules/identity/service';
import { getErrorMessage, NotFoundError, BusinessRuleError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { isUnitConvertible } from '@/lib/units';
import { withSupplierChannel, type SupplierChannelInfo } from '@/lib/supplier-channel';
import { listConnectedSuppliers } from '@/modules/marketplace/service';
import type { UnitOfMeasure } from '@/lib/database.types';
import * as repo from './repository';
import {
  createSupplierSchema,
  updateSupplierSchema,
  createIngredientSchema,
  updateIngredientSchema,
  assignSupplierBulkSchema,
  createRecipeSchema,
  updateRecipeSchema,
} from './schemas';
import type { Supplier, IngredientProduct, Recipe, RecipeListItem } from './types';
import type {
  CreateSupplierInput,
  UpdateSupplierInput,
  CreateIngredientInput,
  UpdateIngredientInput,
  AssignSupplierBulkInput,
  CreateRecipeInput,
  UpdateRecipeInput,
} from './schemas';

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export async function listSuppliers(activeOnly = true): Promise<Supplier[]> {
  const orgId = await requireOrgId();
  return repo.listSuppliers(orgId, activeOnly);
}

export async function getSupplier(id: string): Promise<Supplier> {
  return repo.getSupplierById(id);
}

export async function createSupplier(raw: unknown): Promise<Supplier> {
  const orgId = await requireOrgId();
  const input: CreateSupplierInput = createSupplierSchema.parse(raw);
  return repo.insertSupplier(orgId, input);
}

export async function updateSupplier(id: string, raw: unknown): Promise<Supplier> {
  const input: UpdateSupplierInput = updateSupplierSchema.parse(raw);
  return repo.patchSupplier(id, input);
}

export async function deactivateSupplier(id: string): Promise<Supplier> {
  return repo.patchSupplier(id, { isActive: false });
}

export type SupplierWithChannel = Supplier & SupplierChannelInfo;

/**
 * Fornitori con il CANALE risolto (BakeryOS interno vs email/manuale), unendo
 * l'anagrafica locale con le connessioni marketplace attive. Le connessioni si
 * leggono in contesto cliente: se il contesto non è un cliente marketplace,
 * degrada onestamente a "tutti email" invece di rompere la pagina.
 */
export async function listSuppliersWithChannel(activeOnly = true): Promise<SupplierWithChannel[]> {
  const [suppliers, connections] = await Promise.all([
    listSuppliers(activeOnly),
    listConnectedSuppliers().catch(() => []),
  ]);
  return withSupplierChannel(suppliers, connections);
}

/** Come sopra per un singolo fornitore (scheda). */
export async function getSupplierWithChannel(id: string): Promise<SupplierWithChannel> {
  const [supplier, connections] = await Promise.all([
    getSupplier(id),
    listConnectedSuppliers().catch(() => []),
  ]);
  return withSupplierChannel([supplier], connections)[0];
}

// ---------------------------------------------------------------------------
// IngredientProducts
// ---------------------------------------------------------------------------

export async function listIngredients(activeOnly = true): Promise<IngredientProduct[]> {
  const orgId = await requireOrgId();
  return repo.listIngredients(orgId, activeOnly);
}

export async function getIngredient(id: string): Promise<IngredientProduct> {
  return repo.getIngredientById(id);
}

export async function createIngredient(raw: unknown): Promise<IngredientProduct> {
  const orgId = await requireOrgId();
  const input: CreateIngredientInput = createIngredientSchema.parse(raw);
  return repo.insertIngredient(orgId, input);
}

export async function updateIngredient(id: string, raw: unknown): Promise<IngredientProduct> {
  const input: UpdateIngredientInput = updateIngredientSchema.parse(raw);
  return repo.patchIngredient(id, input);
}

export async function deactivateIngredient(id: string): Promise<IngredientProduct> {
  return repo.patchIngredient(id, { isActive: false });
}

/**
 * Assegna massivamente un fornitore a più ingredienti (per colmare in fretta i
 * buchi che escludono gli ingredienti dal riordino automatico). Verifica che il
 * fornitore esista nell'org corrente (RLS) prima di scrivere. Ritorna il conteggio.
 */
export async function assignSupplierBulk(raw: unknown): Promise<number> {
  const orgId = await requireOrgId();
  const input: AssignSupplierBulkInput = assignSupplierBulkSchema.parse(raw);
  await repo.getSupplierById(input.supplierId); // throws NotFoundError se non esiste/non è dell'org
  return repo.assignSupplierToIngredients(orgId, input.ingredientIds, input.supplierId);
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

export async function listRecipes(activeOnly = true): Promise<RecipeListItem[]> {
  const orgId = await requireOrgId();
  return repo.listRecipes(orgId, activeOnly);
}

export async function getRecipe(id: string): Promise<Recipe> {
  return repo.getRecipeById(id);
}

/**
 * Valida che l'unità di OGNI ingrediente della ricetta sia CONVERTIBILE all'unità
 * di magazzino del prodotto (ingredient_products.unit). Senza questo, una ricetta
 * con grandezza incoerente (es. 'g' per un prodotto venduto a 'pz') produrrebbe
 * deduzioni magazzino errate o silenziosamente saltate (audit R1). g↔kg / ml↔l
 * sono ammessi (convertiti a valle); cross-grandezza è rifiutato qui, alla fonte.
 */
async function assertIngredientUnitsConvertible(
  ingredients: { ingredientProductId: string; unit: UnitOfMeasure }[],
): Promise<void> {
  const ids = [...new Set(ingredients.map((i) => i.ingredientProductId))];
  if (ids.length === 0) return;
  const supabase = await createClient();
  const { data, error } = await supabase.from('ingredient_products').select('id, name, unit').in('id', ids);
  if (error) {
    const { mapSupabaseError } = await import('@/lib/errors');
    throw mapSupabaseError(error);
  }
  const byId = new Map((data ?? []).map((p) => [p.id as string, { name: p.name as string, unit: p.unit as UnitOfMeasure }]));
  const bad: string[] = [];
  for (const ing of ingredients) {
    const prod = byId.get(ing.ingredientProductId);
    if (prod && !isUnitConvertible(ing.unit, prod.unit)) {
      bad.push(`${prod.name} (ricetta in ${ing.unit}, magazzino in ${prod.unit})`);
    }
  }
  if (bad.length > 0) {
    throw new BusinessRuleError(
      `Unità non compatibile con il magazzino per: ${bad.join('; ')}. ` +
        `Usa la stessa grandezza del prodotto (peso, volume o pezzi): g/kg per i pesi, ml/l per i liquidi.`,
    );
  }
}

export async function createRecipe(raw: unknown): Promise<Recipe> {
  const orgId = await requireOrgId();
  const input: CreateRecipeInput = createRecipeSchema.parse(raw);
  await assertIngredientUnitsConvertible(input.ingredients);
  return repo.insertRecipe(orgId, input);
}

export async function updateRecipe(id: string, raw: unknown): Promise<Recipe> {
  const input: UpdateRecipeInput = updateRecipeSchema.parse(raw);

  // Se si sostituiscono gli ingredienti, valida la convertibilità unità PRIMA di
  // toccare il DB (niente ricette con unità incoerente → niente deduzioni errate).
  if (input.ingredients && input.ingredients.length > 0) {
    await assertIngredientUnitsConvertible(input.ingredients);
  }

  // Aggiorna header ricetta
  await repo.patchRecipe(id, {
    name:         input.name,
    category:     input.category,
    emoji:        input.emoji,
    basePortions: input.basePortions,
    sellPricePerPortion: input.sellPricePerPortion,
    notes:        input.notes,
    isActive:     input.isActive,
  });

  // Se passati nuovi ingredienti: sostituisci completamente
  if (input.ingredients && input.ingredients.length > 0) {
    await repo.deleteRecipeIngredients(id);
    // Re-use insertRecipe internals via repository
    const supabase = (await import('@/lib/supabase/server')).createClient;
    const client = await supabase();
    const { error } = await client
      .from('recipe_ingredients')
      .insert(
        input.ingredients.map((ing, idx) => ({
          recipe_id:             id,
          ingredient_product_id: ing.ingredientProductId,
          quantity:              ing.quantity,
          unit:                  ing.unit,
          sort_order:            ing.sortOrder ?? idx,
        })),
      );
    if (error) {
      const { mapSupabaseError } = await import('@/lib/errors');
      throw mapSupabaseError(error);
    }
  }

  return repo.getRecipeById(id);
}

export async function deactivateRecipe(id: string): Promise<void> {
  await repo.patchRecipe(id, { isActive: false });
}

// ---------------------------------------------------------------------------
// Listino prezzi fornitore
// ---------------------------------------------------------------------------

export async function getSupplierPriceList(supplierId: string) {
  const orgId = await requireOrgId();
  return repo.listSupplierPriceList(orgId, supplierId);
}

export async function setSupplierPrice(input: {
  supplierId: string;
  ingredientProductId: string;
  unitPrice: number;
  unit: string;
}): Promise<void> {
  const orgId = await requireOrgId();
  if (!Number.isFinite(input.unitPrice) || input.unitPrice < 0) {
    throw new NotFoundError('Prezzo non valido');
  }
  await repo.upsertSupplierPrice({ orgId, ...input });
}

/**
 * Importa nel listino i prezzi snapshot dell'ULTIMO ordine ricevuto del
 * fornitore. Ritorna quante righe importate e quante saltate (prezzo nullo).
 */
export async function importPricesFromLastReceivedOrder(
  supplierId: string,
): Promise<{ imported: number; skipped: number }> {
  const orgId = await requireOrgId();
  const supabase = (await import('@/lib/supabase/server')).createClient;
  const client = await supabase();

  const { data: order, error } = await client
    .from('purchase_orders')
    .select('id, order_line_items(ingredient_product_id, unit, unit_price_snapshot)')
    .eq('organization_id', orgId)
    .eq('supplier_id', supplierId)
    .eq('status', 'received')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    const { mapSupabaseError } = await import('@/lib/errors');
    throw mapSupabaseError(error);
  }
  if (!order) return { imported: 0, skipped: 0 };

  let imported = 0;
  let skipped = 0;
  for (const line of order.order_line_items ?? []) {
    if (line.unit_price_snapshot === null) {
      skipped++;
      continue;
    }
    await repo.upsertSupplierPrice({
      orgId,
      supplierId,
      ingredientProductId: line.ingredient_product_id,
      unitPrice: Number(line.unit_price_snapshot),
      unit: line.unit,
    });
    imported++;
  }
  return { imported, skipped };
}
