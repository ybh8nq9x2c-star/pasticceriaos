// =============================================================================
// modules/pos/repository.ts
// Accesso DB del bordo POS, eseguito dal webhook con client SERVICE-ROLE
// (nessuna sessione, RLS bypassata). P0-G: lo scoping per organizzazione non è
// più un .eq da ricordare a mano — passa dal guardrail orgScoped(), che filtra
// le letture/update e INIETTA organization_id su insert/upsert by construction.
// L'unica query volutamente cross-org è resolveOrgId (risolve l'org DAL
// webhook) ed è riconoscibile perché usa il client nudo.
// =============================================================================

import type { SalesDb } from '@/modules/sales/repository';
import { mapSupabaseError } from '@/lib/errors';
import { orgScoped } from '@/lib/supabase/org-scope';
import { normalizePosRef } from './normalize';
import type { Json } from '@/lib/database.types';

export interface PosMapping {
  recipeId: string | null;
  portionsPerUnit: number;
  posItemName: string | null;
}

/** Risolve l'org dal config provider (store_id → merchant_code). null se assente.
 *  CROSS-ORG per natura: è il punto in cui il webhook scopre a chi appartiene. */
export async function resolveOrgId(
  client: SalesDb,
  provider: string,
  storeId: string | null | undefined,
  merchantCode: string | null | undefined,
): Promise<string | null> {
  if (storeId) {
    const { data, error } = await client
      .from('pos_configs')
      .select('organization_id')
      .eq('provider', provider)
      .eq('is_active', true)
      .eq('store_id', storeId)
      .maybeSingle();
    if (error) throw mapSupabaseError(error);
    if (data) return data.organization_id as string;
  }
  if (merchantCode) {
    const { data, error } = await client
      .from('pos_configs')
      .select('organization_id')
      .eq('provider', provider)
      .eq('is_active', true)
      .eq('merchant_code', merchantCode)
      .maybeSingle();
    if (error) throw mapSupabaseError(error);
    if (data) return data.organization_id as string;
  }
  return null;
}

/**
 * Inserisce l'evento (ON CONFLICT DO NOTHING). duplicate=true se già presente.
 * Chiave di idempotenza (050): org + provider + store + receipt + EVENT_TYPE —
 * così il VOID con lo stesso receipt_id del SALE non viene più inghiottito.
 */
export async function insertPosEvent(
  client: SalesDb,
  e: {
    orgId: string;
    provider: string;
    externalReceiptId: string;
    eventType: 'sale' | 'reversal';
    externalStoreId: string;
    rawPayload: Json;
  },
): Promise<{ id: string; duplicate: boolean }> {
  const org = orgScoped(client, e.orgId);
  const { data, error } = await org
    .upsert(
      'pos_events',
      {
        provider: e.provider,
        external_receipt_id: e.externalReceiptId,
        event_type: e.eventType,
        external_store_id: e.externalStoreId,
        raw_payload: e.rawPayload,
        status: 'pending',
      },
      {
        onConflict: 'organization_id,provider,external_store_id,external_receipt_id,event_type',
        ignoreDuplicates: true,
      },
    )
    .select('id');
  if (error) throw mapSupabaseError(error);
  if (data && data.length > 0) return { id: data[0].id as string, duplicate: false };

  // Conflitto: l'evento esiste già → recupera l'id (idempotenza primaria).
  const existing = await org
    .select('pos_events', 'id')
    .eq('provider', e.provider)
    .eq('external_store_id', e.externalStoreId)
    .eq('external_receipt_id', e.externalReceiptId)
    .eq('event_type', e.eventType)
    .maybeSingle();
  if (existing.error) throw mapSupabaseError(existing.error);
  return { id: (existing.data as { id: string }).id, duplicate: true };
}

export async function markProcessed(
  client: SalesDb, orgId: string, eventId: string, saleId: string, unlinked: string[],
): Promise<void> {
  const { error } = await orgScoped(client, orgId)
    .update('pos_events', {
      status: 'processed',
      sale_id: saleId,
      unlinked: unlinked.length ? (unlinked as unknown as Json) : null,
      processed_at: new Date().toISOString(),
    })
    .eq('id', eventId);
  if (error) throw mapSupabaseError(error);
}

export async function markReversed(client: SalesDb, orgId: string, eventId: string, saleId: string): Promise<void> {
  const { error } = await orgScoped(client, orgId)
    .update('pos_events', { status: 'reversed', sale_id: saleId, processed_at: new Date().toISOString() })
    .eq('id', eventId);
  if (error) throw mapSupabaseError(error);
}

export async function markFailed(client: SalesDb, orgId: string, eventId: string, errorText: string): Promise<void> {
  const { error } = await orgScoped(client, orgId)
    .update('pos_events', { status: 'failed', error_text: errorText, processed_at: new Date().toISOString() })
    .eq('id', eventId);
  if (error) throw mapSupabaseError(error);
}

/** Mapping POS→ricetta per gli SKU dello scontrino (chiave normalizzata). */
export async function loadMappings(
  client: SalesDb,
  orgId: string,
  source: string,
  posItemIds: string[],
): Promise<Map<string, PosMapping>> {
  const refs = [...new Set(posItemIds.map(normalizePosRef))].filter(Boolean);
  if (refs.length === 0) return new Map();
  const { data, error } = await orgScoped(client, orgId)
    .select('product_mappings', 'external_product_ref, recipe_id, portions_per_unit, pos_item_name')
    .eq('source', source)
    .in('external_product_ref', refs);
  if (error) throw mapSupabaseError(error);
  const out = new Map<string, PosMapping>();
  for (const m of (data ?? []) as unknown as {
    external_product_ref: string; recipe_id: string | null; portions_per_unit: number | null; pos_item_name: string | null;
  }[]) {
    out.set(normalizePosRef(m.external_product_ref), {
      recipeId: m.recipe_id,
      portionsPerUnit: m.portions_per_unit ?? 1,
      posItemName: m.pos_item_name,
    });
  }
  return out;
}
