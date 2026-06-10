// =============================================================================
// modules/catalog/service.ts
// Business logic per catalog: suppliers, ingredient_products, recipes.
// Chiamato da actions.ts. Non conosce request/response.
// =============================================================================

import { requireOrgId } from '@/modules/identity/service';
import { getErrorMessage, NotFoundError } from '@/lib/errors';
import * as repo from './repository';
import {
  createSupplierSchema,
  updateSupplierSchema,
  createIngredientSchema,
  updateIngredientSchema,
  createRecipeSchema,
  updateRecipeSchema,
} from './schemas';
import type { Supplier, IngredientProduct, Recipe, RecipeListItem } from './types';
import type {
  CreateSupplierInput,
  UpdateSupplierInput,
  CreateIngredientInput,
  UpdateIngredientInput,
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

export async function createRecipe(raw: unknown): Promise<Recipe> {
  const orgId = await requireOrgId();
  const input: CreateRecipeInput = createRecipeSchema.parse(raw);
  return repo.insertRecipe(orgId, input);
}

export async function updateRecipe(id: string, raw: unknown): Promise<Recipe> {
  const input: UpdateRecipeInput = updateRecipeSchema.parse(raw);

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
