// =============================================================================
// modules/catalog/repository.ts
// Query database per il contesto catalog.
// RLS garantisce già il filtraggio per org; passiamo orgId per defense in depth.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { mapSupabaseError, NotFoundError } from '@/lib/errors';
import type { Supplier, IngredientProduct, Recipe, RecipeListItem } from './types';
import type { CreateSupplierInput, UpdateSupplierInput, CreateIngredientInput, UpdateIngredientInput, CreateRecipeInput } from './schemas';

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export async function listSuppliers(orgId: string, activeOnly = true): Promise<Supplier[]> {
  const supabase = await createClient();
  let query = supabase
    .from('suppliers')
    .select('*')
    .eq('organization_id', orgId)
    .order('name');

  if (activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map(toSupplier);
}

export async function getSupplierById(id: string): Promise<Supplier> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw mapSupabaseError(error);
  if (!data) throw new NotFoundError('Fornitore');
  return toSupplier(data);
}

export async function insertSupplier(orgId: string, input: CreateSupplierInput): Promise<Supplier> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      organization_id: orgId,
      name:  input.name,
      email: input.email,
      phone: input.phone || null,
      notes: input.notes || null,
    })
    .select()
    .single();

  if (error) throw mapSupabaseError(error);
  return toSupplier(data);
}

export async function patchSupplier(id: string, input: UpdateSupplierInput): Promise<Supplier> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('suppliers')
    .update({
      name:      input.name,
      email:     input.email,
      phone:     input.phone || null,
      notes:     input.notes || null,
      is_active: input.isActive,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw mapSupabaseError(error);
  return toSupplier(data);
}

// ---------------------------------------------------------------------------
// IngredientProducts
// ---------------------------------------------------------------------------

export async function listIngredients(orgId: string, activeOnly = true): Promise<IngredientProduct[]> {
  const supabase = await createClient();
  let query = supabase
    .from('ingredient_products')
    .select('*, suppliers(id, name)')
    .eq('organization_id', orgId)
    .order('name');

  if (activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map(toIngredient);
}

export async function getIngredientById(id: string): Promise<IngredientProduct> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ingredient_products')
    .select('*, suppliers(id, name)')
    .eq('id', id)
    .single();

  if (error) throw mapSupabaseError(error);
  if (!data) throw new NotFoundError('Ingrediente');
  return toIngredient(data);
}

export async function insertIngredient(orgId: string, input: CreateIngredientInput): Promise<IngredientProduct> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ingredient_products')
    .insert({
      organization_id: orgId,
      name:        input.name,
      sku:         input.sku || null,
      unit:        input.unit,
      supplier_id: input.supplierId || null,
      unit_price:  input.unitPrice,
      notes:       input.notes || null,
    })
    .select('*, suppliers(id, name)')
    .single();

  if (error) throw mapSupabaseError(error);
  return toIngredient(data);
}

export async function patchIngredient(id: string, input: UpdateIngredientInput): Promise<IngredientProduct> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ingredient_products')
    .update({
      name:        input.name,
      sku:         input.sku || null,
      unit:        input.unit,
      supplier_id: input.supplierId || null,
      unit_price:  input.unitPrice,
      notes:       input.notes || null,
      is_active:   input.isActive,
    })
    .eq('id', id)
    .select('*, suppliers(id, name)')
    .single();

  if (error) throw mapSupabaseError(error);
  return toIngredient(data);
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

export async function listRecipes(orgId: string, activeOnly = true): Promise<RecipeListItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from('recipes')
    .select('id, name, category, emoji, base_portions, is_active, created_at, recipe_ingredients(id)')
    .eq('organization_id', orgId)
    .order('name');

  if (activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw mapSupabaseError(error);

  return (data ?? []).map((r) => ({
    id:               r.id,
    name:             r.name,
    category:         r.category,
    emoji:            r.emoji,
    basePortions:     r.base_portions,
    isActive:         r.is_active,
    ingredientsCount: Array.isArray(r.recipe_ingredients) ? r.recipe_ingredients.length : 0,
    createdAt:        r.created_at,
  }));
}

export async function getRecipeById(id: string): Promise<Recipe> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('recipes')
    .select(`
      *,
      recipe_ingredients (
        id,
        ingredient_product_id,
        quantity,
        unit,
        sort_order,
        ingredient_products ( name )
      )
    `)
    .eq('id', id)
    .single();

  if (error) throw mapSupabaseError(error);
  if (!data) throw new NotFoundError('Ricetta');
  return toRecipe(data);
}

export async function insertRecipe(orgId: string, input: CreateRecipeInput): Promise<Recipe> {
  const supabase = await createClient();

  // Inserimento ricetta
  const { data: recipe, error: recipeError } = await supabase
    .from('recipes')
    .insert({
      organization_id: orgId,
      name:          input.name,
      category:      input.category || null,
      emoji:         input.emoji || null,
      base_portions: input.basePortions,
      sell_price_per_portion: input.sellPricePerPortion ?? null,
      notes:         input.notes || null,
    })
    .select()
    .single();

  if (recipeError) throw mapSupabaseError(recipeError);

  // Inserimento ingredienti
  if (input.ingredients.length > 0) {
    const { error: ingError } = await supabase
      .from('recipe_ingredients')
      .insert(
        input.ingredients.map((ing, idx) => ({
          recipe_id:             recipe.id,
          ingredient_product_id: ing.ingredientProductId,
          quantity:              ing.quantity,
          unit:                  ing.unit,
          sort_order:            ing.sortOrder ?? idx,
        })),
      );

    if (ingError) throw mapSupabaseError(ingError);
  }

  return getRecipeById(recipe.id);
}

export async function deleteRecipeIngredients(recipeId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('recipe_ingredients')
    .delete()
    .eq('recipe_id', recipeId);
  if (error) throw mapSupabaseError(error);
}

export async function patchRecipe(
  id: string,
  fields: { name?: string; category?: string | null; emoji?: string | null; basePortions?: number; sellPricePerPortion?: number | null; notes?: string | null; isActive?: boolean },
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('recipes')
    .update({
      name:          fields.name,
      category:      fields.category,
      emoji:         fields.emoji,
      base_portions: fields.basePortions,
      sell_price_per_portion: fields.sellPricePerPortion,
      notes:         fields.notes,
      is_active:     fields.isActive,
    })
    .eq('id', id);
  if (error) throw mapSupabaseError(error);
}

// ---------------------------------------------------------------------------
// Mappers (DB row → domain type)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toSupplier(row: any): Supplier {
  return {
    id:             row.id,
    organizationId: row.organization_id,
    name:           row.name,
    email:          row.email,
    phone:          row.phone,
    notes:          row.notes,
    isActive:       row.is_active,
    createdAt:      row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toIngredient(row: any): IngredientProduct {
  return {
    id:             row.id,
    organizationId: row.organization_id,
    supplierId:     row.supplier_id,
    supplierName:   row.suppliers?.name ?? null,
    name:           row.name,
    sku:            row.sku,
    unit:           row.unit,
    unitPrice:      row.unit_price,
    notes:          row.notes,
    isActive:       row.is_active,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecipe(row: any): Recipe {
  return {
    id:             row.id,
    organizationId: row.organization_id,
    name:           row.name,
    category:       row.category,
    emoji:          row.emoji,
    basePortions:   row.base_portions,
    sellPricePerPortion: row.sell_price_per_portion !== null && row.sell_price_per_portion !== undefined
      ? Number(row.sell_price_per_portion)
      : null,
    notes:          row.notes,
    isActive:       row.is_active,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
    ingredients: (row.recipe_ingredients ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ri: any) => ({
        id:                  ri.id,
        recipeId:            row.id,
        ingredientProductId: ri.ingredient_product_id,
        ingredientName:      ri.ingredient_products?.name ?? '',
        quantity:            ri.quantity,
        unit:                ri.unit,
        sortOrder:           ri.sort_order,
      }),
    ),
  };
}
