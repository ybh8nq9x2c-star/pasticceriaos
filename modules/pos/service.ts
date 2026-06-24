// =============================================================================
// modules/pos/service.ts — letture/scritture UI delle mappature POS (session,
// RLS attiva). Il bordo webhook usa invece modules/pos/repository.ts (service-role).
// La mappatura POS→ricetta vive nella tabella condivisa product_mappings.
// =============================================================================

import { requireSession } from '@/modules/identity/service';
import { AuthError, mapSupabaseError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { listRecipes } from '@/modules/catalog/service';
import { listUnlinkedProducts } from '@/modules/sales/service';
import { suggestProducts, type CatalogProductRef } from '@/modules/goods-receipts/matching';
import type { UnlinkedProduct } from '@/modules/sales/types';
import { upsertPosMappingSchema } from './schemas';

const norm = (s: string) => s.trim().toLowerCase();

export interface PosMappingView {
  id: string;
  source: string;
  posItemId: string; // external_product_ref
  posItemName: string | null;
  recipeId: string;
  recipeName: string | null;
  portionsPerUnit: number;
}

/** Mappature POS esistenti (source 'pos:%') con nome ricetta. */
export async function listPosMappings(): Promise<PosMappingView[]> {
  const session = await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('product_mappings')
    .select('id, source, external_product_ref, pos_item_name, recipe_id, portions_per_unit, recipes(name)')
    .eq('organization_id', session.organizationId)
    .like('source', 'pos:%')
    .order('pos_item_name');
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((m) => {
    const row = m as unknown as {
      id: string;
      source: string;
      external_product_ref: string;
      pos_item_name: string | null;
      recipe_id: string;
      portions_per_unit: number;
      recipes: { name: string } | { name: string }[] | null;
    };
    const recipeName = Array.isArray(row.recipes) ? row.recipes[0]?.name ?? null : row.recipes?.name ?? null;
    return {
      id: row.id,
      source: row.source,
      posItemId: row.external_product_ref,
      posItemName: row.pos_item_name,
      recipeId: row.recipe_id,
      recipeName,
      portionsPerUnit: row.portions_per_unit ?? 1,
    };
  });
}

export interface UnmappedPosProduct extends UnlinkedProduct {
  /** Ricetta interna più probabile (match fuzzy sul nome) — pre-selezionata in UI. */
  suggestedRecipeId: string | null;
  suggestedRecipeName: string | null;
}

/**
 * Prodotti POS visti in vendita ma NON ancora mappati. Per ognuno propone la
 * ricetta interna più probabile (riusa il matcher fuzzy esistente): l'utente
 * collega in UN tap invece di cercare nella tendina.
 */
export async function listUnmappedPosProducts(): Promise<UnmappedPosProduct[]> {
  const unlinked = (await listUnlinkedProducts()).filter((u) => u.source.startsWith('pos:'));
  if (unlinked.length === 0) return [];

  const recipes = await listRecipeOptions();
  const catalog: CatalogProductRef[] = recipes.map((r) => ({ id: r.id, name: r.name, sku: null, barcode: null, unit: 'pz' }));

  return unlinked.map((u) => {
    const best = suggestProducts(catalog, u.productName, 1)[0] ?? null;
    return {
      ...u,
      suggestedRecipeId: best?.product.id ?? null,
      suggestedRecipeName: best?.product.name ?? null,
    };
  });
}

/** Ricette attive per la tendina di selezione. */
export async function listRecipeOptions(): Promise<{ id: string; name: string }[]> {
  const recipes = await listRecipes(true);
  return recipes.map((r) => ({ id: r.id, name: r.name }));
}

/** Crea/aggiorna una mappatura POS→ricetta (con porzioni per unità). */
export async function upsertPosMapping(raw: unknown): Promise<void> {
  const session = await requireSession();
  if (session.role === 'viewer') throw new AuthError('Non hai i permessi per modificare le mappature.');
  const input = upsertPosMappingSchema.parse(raw);
  const supabase = await createClient();
  const { error } = await supabase.from('product_mappings').upsert(
    {
      organization_id: session.organizationId,
      source: input.source,
      external_product_ref: norm(input.posItemId),
      recipe_id: input.recipeId,
      pos_item_name: input.posItemName || null,
      portions_per_unit: input.portionsPerUnit,
    },
    { onConflict: 'organization_id,source,external_product_ref' },
  );
  if (error) throw mapSupabaseError(error);
}
