// =============================================================================
// modules/catalog/actions.ts
// Server Actions per catalog: suppliers, ingredients, recipes.
// Thin: FormData → service → revalidate/ActionState.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getErrorMessage, ForbiddenError, NotFoundError } from '@/lib/errors';
import type { ActionState } from '@/lib/utils';
import * as service from './service';
import { requireSession } from '@/modules/identity/service';
import { generateSupplierToken } from '@/lib/supplier-token';
import { createClient } from '@/lib/supabase/server';

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

/**
 * Genera (o rigenera, revocando i precedenti) il link del portale fornitore.
 * Solo il titolare (owner). Rigenerare incrementa portal_token_version:
 * i link emessi prima smettono di funzionare.
 */
export async function generateSupplierLinkAction(
  supplierId: string,
): Promise<{ url: string } | { error: string }> {
  try {
    const session = await requireSession();
    if (session.role !== 'owner') {
      throw new ForbiddenError('Solo il titolare può generare i link del portale fornitore.');
    }

    const supabase = await createClient();
    // RLS limita già alla propria org; il filtro esplicito è difesa in profondità.
    const { data: supplier, error } = await supabase
      .from('suppliers')
      .select('id, portal_token_version')
      .eq('id', supplierId)
      .eq('organization_id', session.organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!supplier) throw new NotFoundError('Fornitore');

    // Rigenera = revoca: incrementa la versione e firma il token con la nuova.
    const newVersion = (supplier.portal_token_version ?? 1) + 1;
    const { error: upErr } = await supabase
      .from('suppliers')
      .update({ portal_token_version: newVersion })
      .eq('id', supplierId);
    if (upErr) throw new Error(upErr.message);

    const token = await generateSupplierToken(supplierId, session.organizationId, newVersion);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    return { url: `${baseUrl}/portal/${token}` };
  } catch (err) {
    return { error: getErrorMessage(err) };
  }
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

export async function assignSupplierBulkAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const idsRaw = formData.get('ingredientIds');
    const ingredientIds = idsRaw ? JSON.parse(idsRaw as string) : [];
    const count = await service.assignSupplierBulk({
      ingredientIds,
      supplierId: formData.get('supplierId'),
    });
    revalidatePath('/ingredients');
    return {
      status: 'success',
      message: `Fornitore assegnato a ${count} ingredient${count === 1 ? 'e' : 'i'}.`,
    };
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
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
      sellPricePerPortion: formData.get('sellPricePerPortion') as string | null,
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
      sellPricePerPortion: formData.get('sellPricePerPortion') as string | null,
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

// ---------------------------------------------------------------------------
// Listino prezzi fornitore
// ---------------------------------------------------------------------------

export async function setSupplierPriceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const raw = String(formData.get('unitPrice') ?? '').trim().replace(',', '.');
    const unitPrice = parseFloat(raw);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return { status: 'error', error: 'Prezzo non valido.' };
    }
    await service.setSupplierPrice({
      supplierId:          String(formData.get('supplierId')),
      ingredientProductId: String(formData.get('ingredientProductId')),
      unitPrice,
      unit:                String(formData.get('unit')),
    });
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
  revalidatePath(`/suppliers/${formData.get('supplierId')}/price-list`);
  revalidatePath('/suppliers');
  return { status: 'success', message: 'Prezzo aggiornato.' };
}

export async function importPricesFromLastOrderAction(
  supplierId: string,
): Promise<ActionState> {
  try {
    const result = await service.importPricesFromLastReceivedOrder(supplierId);
    revalidatePath(`/suppliers/${supplierId}/price-list`);
    revalidatePath('/suppliers');
    if (result.imported === 0 && result.skipped === 0) {
      return { status: 'error', error: 'Nessun ordine ricevuto da questo fornitore: niente da importare.' };
    }
    return {
      status: 'success',
      message: `${result.imported} prezzi importati${result.skipped > 0 ? `, ${result.skipped} righe senza prezzo saltate` : ''}.`,
    };
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
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
