// =============================================================================
// modules/catalog/actions.ts
// Server Actions per catalog: suppliers, ingredients, recipes.
// Thin: FormData → service → revalidate/ActionState.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getErrorMessage } from '@/lib/errors';
import type { ActionState } from '@/lib/utils';
import * as service from './service';

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export async function createSupplierAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await service.createSupplier({
      name:  formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      notes: formData.get('notes'),
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  revalidatePath('/suppliers');
  redirect('/suppliers');
}

export async function updateSupplierAction(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await service.updateSupplier(id, {
      name:     formData.get('name'),
      email:    formData.get('email'),
      phone:    formData.get('phone'),
      notes:    formData.get('notes'),
      isActive: formData.get('isActive') === 'true',
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  revalidatePath('/suppliers');
  return { status: 'success', message: 'Fornitore aggiornato.' };
}

export async function deactivateSupplierAction(id: string): Promise<ActionState> {
  try {
    await service.deactivateSupplier(id);
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  revalidatePath('/suppliers');
  return { status: 'success', message: 'Fornitore disattivato.' };
}

// ---------------------------------------------------------------------------
// Ingredients
// ---------------------------------------------------------------------------

export async function createIngredientAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await service.createIngredient({
      name:       formData.get('name'),
      sku:        formData.get('sku'),
      unit:       formData.get('unit'),
      supplierId: formData.get('supplierId'),
      unitPrice:  formData.get('unitPrice'),
      notes:      formData.get('notes'),
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  revalidatePath('/ingredients');
  redirect('/ingredients');
}

export async function updateIngredientAction(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await service.updateIngredient(id, {
      name:       formData.get('name'),
      sku:        formData.get('sku'),
      unit:       formData.get('unit'),
      supplierId: formData.get('supplierId'),
      unitPrice:  formData.get('unitPrice'),
      notes:      formData.get('notes'),
      isActive:   formData.get('isActive') === 'true',
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  revalidatePath('/ingredients');
  return { status: 'success', message: 'Ingrediente aggiornato.' };
}

export async function deactivateIngredientAction(id: string): Promise<ActionState> {
  try {
    await service.deactivateIngredient(id);
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  revalidatePath('/ingredients');
  return { status: 'success', message: 'Ingrediente disattivato.' };
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

/**
 * createRecipeAction
 * Ingredienti arrivano come JSON nel campo 'ingredients'.
 * Es: JSON.stringify([{ ingredientProductId, quantity, unit, sortOrder }])
 */
export async function createRecipeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const rawIngredients = formData.get('ingredients');
    const ingredients = rawIngredients ? JSON.parse(rawIngredients as string) : [];

    await service.createRecipe({
      name:         formData.get('name'),
      category:     formData.get('category'),
      emoji:        formData.get('emoji'),
      basePortions: formData.get('basePortions'),
      notes:        formData.get('notes'),
      ingredients,
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  revalidatePath('/recipes');
  redirect('/recipes');
}

export async function updateRecipeAction(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const rawIngredients = formData.get('ingredients');
    const ingredients = rawIngredients ? JSON.parse(rawIngredients as string) : undefined;

    await service.updateRecipe(id, {
      name:         formData.get('name'),
      category:     formData.get('category'),
      emoji:        formData.get('emoji'),
      basePortions: formData.get('basePortions'),
      notes:        formData.get('notes'),
      isActive:     formData.get('isActive') === 'true',
      ...(ingredients !== undefined ? { ingredients } : {}),
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  revalidatePath('/recipes');
  revalidatePath(`/recipes/${id}`);
  return { status: 'success', message: 'Ricetta aggiornata.' };
}

export async function deactivateRecipeAction(id: string): Promise<ActionState> {
  try {
    await service.deactivateRecipe(id);
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }

  revalidatePath('/recipes');
  return { status: 'success', message: 'Ricetta disattivata.' };
}
