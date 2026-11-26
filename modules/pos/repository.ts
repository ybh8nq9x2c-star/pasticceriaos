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
import type { PosConfigBinding } from './secret';
import type { Json } from '@/lib/database.types';

export interface PosMapping {
  recipeId: string | null;
  portionsPerUnit: number;
  posItemName: string | null;
}

/** Risolve la CONFIG (e quindi org + schema/versione del segreto) dal provider
 *  e da store_id → merchant_code. null se assente o non attiva.
 *  CROSS-ORG per natura: è il punto in cui il webhook scopre a chi appartiene.
 *  Il chiamante verifica la firma con la chiave di QUESTA config (062). */
export async function resolvePosConfig(
  client: SalesDb,
  provider: string,
  storeId: string | null | undefined,
  merchantCode: string | null | undefined,
): Promise<PosConfigBinding | null> {
  const cols = 'id, organization_id, provider, secret_scheme, secret_version, verified_at';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toBinding = (d: any): PosConfigBinding => ({
    configId: d.id as string,
    organizationId: d.organization_id as string,
    provider: d.provider as string,
    secretScheme: d.secret_scheme === 'legacy_global' ? 'legacy_global' : 'derived',
    secretVersion: Number(d.secret_version ?? 1),
    verifiedAt: (d.verified_at as string | null) ?? null,
  });
  for (const [col, val] of [['store_id', storeId], ['merchant_code', merchantCode]] as const) {
    if (!val) continue;
    const { data, error } = await client
      .from('pos_configs')
      .select(cols as never)
      .eq('provider', provider)
      .eq('is_active', true)
      .eq(col, val)
      .maybeSingle();
    if (error) throw mapSupabaseError(error);
    if (data) return toBinding(data);
  }
  return null;
}

/** Prova di possesso: prima ricevuta firmata col segreto di questa config. */
export async function markConfigVerified(client: SalesDb, configId: string): Promise<void> {
  const { error } = await client
    .from('pos_configs')
    .update({ verified_at: new Date().toISOString() } as never)
    .eq('id', configId)
    .is('verified_at', null);
  if (error) throw mapSupabaseError(error);
}

/**
 * Inserisce l'evento (ON CONFLICT DO NOTHING). duplicate=true se già presente.
 * Chiave di idempotenza (050): org + provider + store + receipt + EVENT_TYPE —
 * così il VOID con lo stesso receipt_id del SALE non viene più inghiottito.
 */
/** Stati di pos_events (062). Terminali: processed, reversed (e duplicate storico). */
export type PosEventStatus = 'received' | 'processed' | 'reversed' | 'failed' | 'duplicate';
export const NON_TERMINAL: PosEventStatus[] = ['received', 'failed'];
export function isTerminal(status: PosEventStatus): boolean {
  return !NON_TERMINAL.includes(status);
}

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
): Promise<{ id: string; duplicate: boolean; status: PosEventStatus }> {
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
        status: 'received',
      },
      {
        onConflict: 'organization_id,provider,external_store_id,external_receipt_id,event_type',
        ignoreDuplicates: true,
      },
    )
    .select('id');
  if (error) throw mapSupabaseError(error);
  if (data && data.length > 0) return { id: data[0].id as string, duplicate: false, status: 'received' };

  // Conflitto: l'evento esiste già → recupera l'id (idempotenza primaria).
  const existing = await org
    .select('pos_events', 'id, status')
    .eq('provider', e.provider)
    .eq('external_store_id', e.externalStoreId)
    .eq('external_receipt_id', e.externalReceiptId)
    .eq('event_type', e.eventType)
    .maybeSingle();
  if (existing.error) throw mapSupabaseError(existing.error);
  const row = existing.data as { id: string; status: PosEventStatus };
  return { id: row.id, duplicate: true, status: row.status };
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
      error_text: null,
    })
    .eq('id', eventId)
    .in('status', NON_TERMINAL); // 062: mai sovrascrivere un esito terminale
  if (error) throw mapSupabaseError(error);
}

export async function markReversed(client: SalesDb, orgId: string, eventId: string, saleId: string): Promise<void> {
  const { error } = await orgScoped(client, orgId)
    .update('pos_events', { status: 'reversed', sale_id: saleId, error_text: null, processed_at: new Date().toISOString() })
    .eq('id', eventId)
    .in('status', NON_TERMINAL);
  if (error) throw mapSupabaseError(error);
}

export async function markFailed(client: SalesDb, orgId: string, eventId: string, errorText: string): Promise<void> {
  const { error } = await orgScoped(client, orgId)
    .update('pos_events', { status: 'failed', error_text: errorText, processed_at: new Date().toISOString() })
    .eq('id', eventId)
    .in('status', NON_TERMINAL); // un tentativo concorrente già riuscito resta terminale
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
