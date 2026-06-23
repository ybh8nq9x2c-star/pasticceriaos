// =============================================================================
// modules/sales/repository.ts
// Accesso DB per il dominio vendite: risoluzione prodotto→ricetta, caricamento
// BOM, chiamate RPC atomiche (ingest_sale/reverse_sale), viste di lettura.
// Le RPC sono SECURITY DEFINER e fanno l'org-check internamente; le SELECT sono
// org-scoped via RLS (passiamo comunque orgId esplicito, come gli altri moduli).
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { mapSupabaseError } from '@/lib/errors';
import type { UnitOfMeasure, Json } from '@/lib/database.types';
import type { Bom } from './bom';
import type { SaleView, SaleLineView, UnlinkedProduct } from './types';

const norm = (s: string) => s.trim().toLowerCase();

export interface ResolveRef {
  externalProductRef: string;
  productName: string;
  recipeId?: string | null; // già risolto dall'adapter (prevale)
}

/**
 * Risolve ogni riga in un recipeId con questa precedenza:
 *   1. recipeId esplicito dall'adapter
 *   2. product_mappings (alias POS → ricetta, per la sorgente)
 *   3. match per nome ricetta attiva (su ref o nome prodotto)
 * Ritorna una mappa index-riga → recipeId|null (null = non collegato).
 */
export async function resolveRecipeIds(
  orgId: string,
  source: string,
  refs: ResolveRef[],
): Promise<Map<number, string | null>> {
  const supabase = await createClient();

  const { data: maps, error: mapErr } = await supabase
    .from('product_mappings')
    .select('external_product_ref, recipe_id')
    .eq('organization_id', orgId)
    .eq('source', source);
  if (mapErr) throw mapSupabaseError(mapErr);
  const byRef = new Map((maps ?? []).map((m) => [norm(m.external_product_ref), m.recipe_id as string]));

  const { data: recs, error: recErr } = await supabase
    .from('recipes')
    .select('id, name')
    .eq('organization_id', orgId)
    .eq('is_active', true);
  if (recErr) throw mapSupabaseError(recErr);
  const byName = new Map((recs ?? []).map((r) => [norm(r.name), r.id as string]));

  const out = new Map<number, string | null>();
  refs.forEach((r, i) => {
    const explicit = r.recipeId ?? null;
    const viaMap = byRef.get(norm(r.externalProductRef)) ?? null;
    const viaName = byName.get(norm(r.externalProductRef)) ?? byName.get(norm(r.productName)) ?? null;
    out.set(i, explicit ?? viaMap ?? viaName ?? null);
  });
  return out;
}

/**
 * Carica i BOM per le ricette risolte. L'unità di MAGAZZINO di ogni ingrediente
 * viene da ingredient_products.unit (la deduzione è in quell'unità). Una ricetta
 * inattiva o senza ingredienti viene restituita con items=[] → explodeLine la
 * tratta come no_bom (nessuna deduzione, eccezione registrata).
 */
export async function loadBoms(orgId: string, recipeIds: string[]): Promise<Map<string, Bom>> {
  if (recipeIds.length === 0) return new Map();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('recipes')
    .select(
      'id, base_portions, is_active, recipe_ingredients(ingredient_product_id, quantity, unit, ingredient_products(unit))',
    )
    .eq('organization_id', orgId)
    .in('id', recipeIds);
  if (error) throw mapSupabaseError(error);

  const out = new Map<string, Bom>();
  for (const r of data ?? []) {
    const rec = r as unknown as {
      id: string;
      base_portions: number;
      is_active: boolean;
      recipe_ingredients: {
        ingredient_product_id: string;
        quantity: number;
        unit: UnitOfMeasure;
        ingredient_products: { unit: UnitOfMeasure } | null;
      }[];
    };
    const items = rec.is_active
      ? (rec.recipe_ingredients ?? []).map((ri) => ({
          ingredientProductId: ri.ingredient_product_id,
          quantity: Number(ri.quantity),
          unit: ri.unit,
          stockUnit: ri.ingredient_products?.unit ?? ri.unit,
        }))
      : [];
    out.set(rec.id, { basePortions: rec.base_portions, items });
  }
  return out;
}

// ── RPC atomiche ──────────────────────────────────────────────────────────────

/** Inserimento atomico+idempotente. Ritorna l'id vendita (nuovo o esistente). */
export async function ingestSaleRpc(payload: Json): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('ingest_sale', { p_payload: payload });
  if (error) throw mapSupabaseError(error);
  return data as string;
}

/** Storno atomico (movimenti inversi). Idempotente lato DB (status guard). */
export async function reverseSaleRpc(saleId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('reverse_sale', { p_sale_id: saleId });
  if (error) throw mapSupabaseError(error);
}

/** Crea/aggiorna il mapping POS→ricetta (risolve i "non collegati" futuri). */
export async function upsertMapping(
  orgId: string,
  source: string,
  externalProductRef: string,
  recipeId: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('product_mappings').upsert(
    {
      organization_id: orgId,
      source,
      external_product_ref: norm(externalProductRef),
      recipe_id: recipeId,
    },
    { onConflict: 'organization_id,source,external_product_ref' },
  );
  if (error) throw mapSupabaseError(error);
}

// ── Viste di lettura ──────────────────────────────────────────────────────────

export async function listRecentSales(orgId: string, limit = 50): Promise<SaleView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('sales')
    .select('id, external_sale_id, source, sold_at, status, total_amount, sale_lines(count)')
    .eq('organization_id', orgId)
    .order('sold_at', { ascending: false })
    .limit(limit);
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((s) => {
    const row = s as unknown as {
      id: string;
      external_sale_id: string;
      source: string;
      sold_at: string;
      status: string;
      total_amount: number | null;
      sale_lines: { count: number }[];
    };
    return {
      id: row.id,
      externalSaleId: row.external_sale_id,
      source: row.source,
      soldAt: row.sold_at,
      status: row.status,
      totalAmount: row.total_amount,
      lineCount: row.sale_lines?.[0]?.count ?? 0,
    };
  });
}

export async function listSaleLines(orgId: string, saleId: string): Promise<SaleLineView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('sale_lines')
    .select('id, external_product_ref, product_name_snapshot, recipe_id, quantity, status, exception, sort_order, recipes(name)')
    .eq('organization_id', orgId)
    .eq('sale_id', saleId)
    .order('sort_order');
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((l) => {
    const row = l as unknown as {
      id: string;
      external_product_ref: string;
      product_name_snapshot: string;
      recipe_id: string | null;
      quantity: number;
      status: SaleLineView['status'];
      exception: string | null;
      recipes: { name: string } | { name: string }[] | null;
    };
    const recipeName = Array.isArray(row.recipes) ? row.recipes[0]?.name ?? null : row.recipes?.name ?? null;
    return {
      id: row.id,
      externalProductRef: row.external_product_ref,
      productName: row.product_name_snapshot,
      recipeId: row.recipe_id,
      recipeName,
      quantity: Number(row.quantity),
      status: row.status,
      exception: row.exception,
    };
  });
}

/** Header di una singola vendita (per la pagina di dettaglio). null se non trovata. */
export async function getSale(orgId: string, saleId: string): Promise<SaleView | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('sales')
    .select('id, external_sale_id, source, sold_at, status, total_amount, sale_lines(count)')
    .eq('organization_id', orgId)
    .eq('id', saleId)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    external_sale_id: string;
    source: string;
    sold_at: string;
    status: string;
    total_amount: number | null;
    sale_lines: { count: number }[];
  };
  return {
    id: row.id,
    externalSaleId: row.external_sale_id,
    source: row.source,
    soldAt: row.sold_at,
    status: row.status,
    totalAmount: row.total_amount,
    lineCount: row.sale_lines?.[0]?.count ?? 0,
  };
}

/** Prodotti venduti ma non collegati a una ricetta (alert admin, deduplicati). */
export async function listUnlinkedProducts(orgId: string): Promise<UnlinkedProduct[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('sale_lines')
    .select('external_product_ref, product_name_snapshot, sales!inner(source)')
    .eq('organization_id', orgId)
    .in('status', ['unlinked', 'no_bom', 'unit_mismatch']);
  if (error) throw mapSupabaseError(error);

  const agg = new Map<string, UnlinkedProduct>();
  for (const l of data ?? []) {
    const row = l as unknown as {
      external_product_ref: string;
      product_name_snapshot: string;
      sales: { source: string } | { source: string }[];
    };
    const source = Array.isArray(row.sales) ? row.sales[0]?.source ?? 'manual' : row.sales?.source ?? 'manual';
    const key = `${source}::${norm(row.external_product_ref)}`;
    const existing = agg.get(key);
    if (existing) existing.occurrences += 1;
    else
      agg.set(key, {
        source,
        externalProductRef: row.external_product_ref,
        productName: row.product_name_snapshot,
        occurrences: 1,
      });
  }
  return [...agg.values()].sort((a, b) => b.occurrences - a.occurrences);
}

/** Ricette attive per la tendina di collegamento. */
export async function listActiveRecipes(orgId: string): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('recipes')
    .select('id, name')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('name');
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((r) => ({ id: r.id as string, name: r.name as string }));
}
