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
import { savePosConfigSchema, upsertPosMappingSchema } from './schemas';
import { derivePosCta, type PosCta, type PosHealthSnapshot } from './status';
import { getPosAdapter, posSource, type IncomingSale } from './adapter';
import { buildCanonicalSale } from './ingest';
import { loadMappings } from './repository';
import { buildRelinkLines, type UnlinkedSaleLine } from './relink';
import { compareDailyTotals, type PosEventDaily, type SalesDaily, type ReconciliationRow } from './reconciliation';
import * as salesService from '@/modules/sales/service';
import * as salesRepo from '@/modules/sales/repository';
import type { Json } from '@/lib/database.types';

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

// ═════════════════════════════════════════════════════════════════════════════
// SALES-INTEGRATION (sessione): inbox eventi, replay, dry-run, stato, recon.
// Il webhook resta sul path service-role (ingest.ts); qui è tutto RLS-scoped.
// ═════════════════════════════════════════════════════════════════════════════

async function requirePosWriter() {
  const session = await requireSession();
  if (session.role === 'viewer') throw new AuthError('Non hai i permessi per gestire l\'integrazione POS.');
  return session;
}

// ── Inbox eventi ──────────────────────────────────────────────────────────────

export type PosInboxFilter = 'all' | 'failed' | 'unmapped' | 'reversed';

export interface PosEventView {
  id: string;
  provider: string;
  externalReceiptId: string;
  externalStoreId: string;
  eventType: string;
  status: string; // pending | processed | failed | reversed (duplicate non persistito)
  saleId: string | null;
  unlinked: string[];
  linesCount: number;
  errorText: string | null;
  receivedAt: string;
  processedAt: string | null;
  rawPayload: Json;
}

export async function listPosEvents(filter: PosInboxFilter = 'all', limit = 100): Promise<PosEventView[]> {
  const session = await requireSession();
  const supabase = await createClient();

  let q = supabase
    .from('pos_events')
    .select('id, provider, external_receipt_id, external_store_id, event_type, status, sale_id, unlinked, error_text, received_at, processed_at, raw_payload')
    .eq('organization_id', session.organizationId)
    .order('received_at', { ascending: false })
    .limit(limit);

  if (filter === 'failed') q = q.eq('status', 'failed');
  if (filter === 'reversed') q = q.eq('status', 'reversed');
  if (filter === 'unmapped') q = q.eq('status', 'processed').not('unlinked', 'is', null);

  const { data, error } = await q;
  if (error) throw mapSupabaseError(error);

  return (data ?? []).map((e) => {
    const raw = e.raw_payload as { lines?: unknown[] } | null;
    const unlinked = Array.isArray(e.unlinked) ? (e.unlinked as string[]) : [];
    return {
      id: e.id,
      provider: e.provider,
      externalReceiptId: e.external_receipt_id,
      externalStoreId: e.external_store_id ?? '',
      eventType: e.event_type ?? 'sale',
      status: e.status,
      saleId: e.sale_id,
      unlinked,
      linesCount: Array.isArray(raw?.lines) ? raw.lines.length : 0,
      errorText: e.error_text,
      receivedAt: e.received_at,
      processedAt: e.processed_at,
      rawPayload: e.raw_payload,
    };
  });
}

// ── Stato integrazione / checklist attivazione ───────────────────────────────

export interface PosIntegrationStatus {
  provider: string;
  adapterRegistered: boolean;
  webhookSecretConfigured: boolean;
  configActive: boolean;
  storeConfigured: boolean;
  mappingsCount: number;
  processedEventsCount: number;
  lastEventAt: string | null;
  /** Pronto per il live: adapter + secret + config attiva + store + ≥1 evento processato. */
  readyForLive: boolean;
}

export async function getPosIntegrationStatus(provider = 'mipos'): Promise<PosIntegrationStatus> {
  const session = await requireSession();
  const supabase = await createClient();
  const source = posSource(provider);

  const [cfgRes, mapRes, evtRes, lastRes] = await Promise.all([
    supabase
      .from('pos_configs')
      .select('is_active, store_id, merchant_code')
      .eq('organization_id', session.organizationId)
      .eq('provider', provider)
      .maybeSingle(),
    supabase
      .from('product_mappings')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', session.organizationId)
      .eq('source', source),
    supabase
      .from('pos_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', session.organizationId)
      .eq('provider', provider)
      .eq('status', 'processed'),
    supabase
      .from('pos_events')
      .select('received_at')
      .eq('organization_id', session.organizationId)
      .eq('provider', provider)
      .order('received_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (cfgRes.error) throw mapSupabaseError(cfgRes.error);
  if (mapRes.error) throw mapSupabaseError(mapRes.error);
  if (evtRes.error) throw mapSupabaseError(evtRes.error);
  if (lastRes.error) throw mapSupabaseError(lastRes.error);

  const adapterRegistered = getPosAdapter(provider) !== null;
  // TODO(polling): quando MiPOS esporrà un'API pull documentata, aggiungere qui
  // il ping outbound reale con le credenziali di pos_configs.
  const webhookSecretConfigured =
    provider === 'mipos' ? Boolean((process.env.MIPOS_WEBHOOK_SECRET ?? '').trim()) : false;
  const configActive = Boolean(cfgRes.data?.is_active);
  const storeConfigured = Boolean(cfgRes.data?.store_id || cfgRes.data?.merchant_code);
  const processedEventsCount = evtRes.count ?? 0;

  return {
    provider,
    adapterRegistered,
    webhookSecretConfigured,
    configActive,
    storeConfigured,
    mappingsCount: mapRes.count ?? 0,
    processedEventsCount,
    lastEventAt: lastRes.data?.received_at ?? null,
    readyForLive:
      adapterRegistered && webhookSecretConfigured && configActive && storeConfigured && processedEventsCount > 0,
  };
}

// ── Config POS self-service (wizard /sales/pos) ──────────────────────────────

export interface PosConfigView {
  storeId: string | null;
  merchantCode: string | null;
  isActive: boolean;
}

/** Config del provider per l'org corrente (null = mai configurato). */
export async function getPosConfig(provider = 'mipos'): Promise<PosConfigView | null> {
  const session = await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('pos_configs')
    .select('store_id, merchant_code, is_active')
    .eq('organization_id', session.organizationId)
    .eq('provider', provider)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) return null;
  return { storeId: data.store_id, merchantCode: data.merchant_code, isActive: data.is_active };
}

/**
 * Crea/aggiorna la config POS dell'org (RLS pos_configs_write). Lo store/merchant
 * è ciò che il webhook usa per risolvere l'organizzazione: senza, gli scontrini
 * non sanno a chi appartengono. Unicità (provider, store_id) garantita dal DB:
 * lo stesso store non può puntare a due organizzazioni.
 */
export async function savePosConfig(raw: unknown): Promise<void> {
  const session = await requirePosWriter();
  const input = savePosConfigSchema.parse(raw);
  const supabase = await createClient();

  const patch = {
    store_id: input.storeId?.trim() || null,
    merchant_code: input.merchantCode?.trim() || null,
    is_active: input.isActive,
  };

  const { data: existing, error: selErr } = await supabase
    .from('pos_configs')
    .select('id')
    .eq('organization_id', session.organizationId)
    .eq('provider', input.provider)
    .maybeSingle();
  if (selErr) throw mapSupabaseError(selErr);

  if (existing) {
    const { error } = await supabase.from('pos_configs').update(patch).eq('id', existing.id);
    if (error) throw mapSupabaseError(error);
  } else {
    const { error } = await supabase.from('pos_configs').insert({
      organization_id: session.organizationId,
      provider: input.provider,
      ...patch,
    });
    if (error) throw mapSupabaseError(error);
  }
}

// ── Salute POS: stato + contatori + CTA contestuale (card hub e wizard) ───────

export interface PosHealth extends PosHealthSnapshot {
  provider: string;
  lastEventAt: string | null;
  lastProcessedAt: string | null;
  readyForLive: boolean;
  cta: PosCta;
}

/** Fotografia unica per card stato e wizard: compone SOLO letture esistenti. */
export async function getPosHealth(provider = 'mipos'): Promise<PosHealth> {
  const session = await requireSession();
  const supabase = await createClient();

  const [status, unlinked, failedRes, lastOkRes] = await Promise.all([
    getPosIntegrationStatus(provider),
    listUnlinkedProducts(),
    supabase
      .from('pos_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', session.organizationId)
      .eq('provider', provider)
      .eq('status', 'failed'),
    supabase
      .from('pos_events')
      .select('processed_at')
      .eq('organization_id', session.organizationId)
      .eq('provider', provider)
      .in('status', ['processed', 'reversed'])
      .order('processed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (failedRes.error) throw mapSupabaseError(failedRes.error);
  if (lastOkRes.error) throw mapSupabaseError(lastOkRes.error);

  const snapshot: PosHealthSnapshot = {
    adapterRegistered: status.adapterRegistered,
    webhookSecretConfigured: status.webhookSecretConfigured,
    configActive: status.configActive,
    storeConfigured: status.storeConfigured,
    mappingsCount: status.mappingsCount,
    processedEventsCount: status.processedEventsCount,
    unmappedCount: unlinked.filter((u) => u.source.startsWith('pos:')).length,
    failedCount: failedRes.count ?? 0,
  };

  return {
    ...snapshot,
    provider,
    lastEventAt: status.lastEventAt,
    lastProcessedAt: lastOkRes.data?.processed_at ?? null,
    readyForLive: status.readyForLive,
    cta: derivePosCta(snapshot),
  };
}

// ── Dry-run: normalizza un payload SENZA scritture (collaudo setup) ───────────

export interface PosDryRunResult {
  incoming: IncomingSale;
  linesTotal: number;
  linesMapped: number;
  unlinked: string[];
}

export async function dryRunPosPayload(provider: string, payload: unknown): Promise<PosDryRunResult> {
  const session = await requirePosWriter();
  const adapter = getPosAdapter(provider);
  if (!adapter) throw new AuthError(`Provider POS sconosciuto: ${provider}`);

  const incoming = adapter.parsePayload(payload);
  const supabase = await createClient();
  const mappings = await loadMappings(
    supabase, session.organizationId, posSource(provider),
    incoming.lines.map((l) => l.pos_item_id),
  );
  const { unlinked } = buildCanonicalSale(incoming, mappings);
  return {
    incoming,
    linesTotal: incoming.lines.length,
    linesMapped: incoming.lines.length - unlinked.length,
    unlinked,
  };
}

// ── Replay evento (dopo correzione mapping o errore transitorio) ──────────────

export interface PosReplayResult {
  status: 'reprocessed' | 'relinked' | 'nothing_to_do';
  saleId?: string;
  relinkedCount?: number;
  stillUnlinked?: string[];
}

export async function replayPosEvent(eventId: string): Promise<PosReplayResult> {
  const session = await requirePosWriter();
  const supabase = await createClient();

  const { data: event, error } = await supabase
    .from('pos_events')
    .select('id, provider, status, sale_id, unlinked, raw_payload')
    .eq('organization_id', session.organizationId)
    .eq('id', eventId)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!event) throw new AuthError('Evento non trovato.');

  const incoming = event.raw_payload as unknown as IncomingSale;
  const source = posSource(event.provider);

  // FAILED → riesegui l'intera pipeline (idempotente: ON CONFLICT sul sales).
  if (event.status === 'failed') {
    if (incoming.is_reversal) {
      const saleId = await salesRepo.findSaleIdByExternal(
        session.organizationId, source, incoming.external_receipt_id,
      );
      if (!saleId) throw new AuthError('Storno: vendita originale ancora assente. Importa prima la vendita.');
      await salesRepo.reverseSaleRpc(saleId);
      await supabase
        .from('pos_events')
        .update({ status: 'reversed', sale_id: saleId, error_text: null, processed_at: new Date().toISOString() })
        .eq('id', event.id);
      return { status: 'reprocessed', saleId };
    }

    const mappings = await loadMappings(supabase, session.organizationId, source, incoming.lines.map((l) => l.pos_item_id));
    const { canonical, unlinked } = buildCanonicalSale(incoming, mappings);
    const summary = await salesService.ingestCanonicalSale(session.organizationId, canonical, { nameFallback: false });
    await supabase
      .from('pos_events')
      .update({
        status: 'processed',
        sale_id: summary.saleId,
        unlinked: unlinked.length ? (unlinked as unknown as Json) : null,
        error_text: null,
        processed_at: new Date().toISOString(),
      })
      .eq('id', event.id);
    return { status: 'reprocessed', saleId: summary.saleId, stillUnlinked: unlinked };
  }

  // PROCESSED con righe non collegate → relink post-correzione mapping.
  const unlinkedRefs = Array.isArray(event.unlinked) ? (event.unlinked as string[]) : [];
  if (event.status === 'processed' && event.sale_id && unlinkedRefs.length > 0) {
    const saleLines = await salesRepo.listSaleLines(session.organizationId, event.sale_id);
    const candidates: UnlinkedSaleLine[] = saleLines.map((l) => ({
      id: l.id,
      externalProductRef: l.externalProductRef,
      quantity: l.quantity,
      recipeId: l.recipeId,
      status: l.status,
    }));
    const mappings = await loadMappings(
      supabase, session.organizationId, source,
      candidates.filter((c) => c.recipeId === null).map((c) => c.externalProductRef),
    );
    const relink = buildRelinkLines(candidates, mappings);
    if (relink.length === 0) return { status: 'nothing_to_do', stillUnlinked: unlinkedRefs };

    const relinkedCount = await salesService.relinkSaleLines(event.sale_id, relink);
    const relinkedIds = new Set(relink.map((r) => r.sale_line_id));
    const stillUnlinked = candidates
      .filter((c) => c.recipeId === null && !relinkedIds.has(c.id))
      .map((c) => c.externalProductRef);
    await supabase
      .from('pos_events')
      .update({ unlinked: stillUnlinked.length ? (stillUnlinked as unknown as Json) : null })
      .eq('id', event.id);
    return { status: 'relinked', saleId: event.sale_id, relinkedCount, stillUnlinked };
  }

  return { status: 'nothing_to_do' };
}

// ── Riconciliazione giornaliera (POS vs BakeryOS) ─────────────────────────────

export async function getPosReconciliation(days = 14): Promise<ReconciliationRow[]> {
  const session = await requireSession();
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();

  const [evtRes, salesRes] = await Promise.all([
    supabase
      .from('pos_events')
      .select('received_at, status, event_type, raw_payload')
      .eq('organization_id', session.organizationId)
      .gte('received_at', since),
    supabase
      .from('sales')
      .select('sold_at, status, total_amount, source')
      .eq('organization_id', session.organizationId)
      .like('source', 'pos:%')
      .gte('sold_at', since),
  ]);
  if (evtRes.error) throw mapSupabaseError(evtRes.error);
  if (salesRes.error) throw mapSupabaseError(salesRes.error);

  const day = (iso: string) => iso.slice(0, 10);

  const posByDay = new Map<string, PosEventDaily>();
  for (const e of evtRes.data ?? []) {
    if ((e.event_type ?? 'sale') !== 'sale') continue;
    const d = day(e.received_at);
    const row = posByDay.get(d) ?? { day: d, eventsReceived: 0, eventsFailed: 0, posTotal: 0 };
    row.eventsReceived += 1;
    if (e.status === 'failed') row.eventsFailed += 1;
    const raw = e.raw_payload as { total_cents?: number } | null;
    row.posTotal += (raw?.total_cents ?? 0) / 100;
    posByDay.set(d, row);
  }

  const salesByDay = new Map<string, SalesDaily>();
  for (const s of salesRes.data ?? []) {
    if (s.status === 'reversed' || s.status === 'void') continue;
    const d = day(s.sold_at);
    const row = salesByDay.get(d) ?? { day: d, salesRecorded: 0, salesTotal: 0 };
    row.salesRecorded += 1;
    row.salesTotal += Number(s.total_amount ?? 0);
    salesByDay.set(d, row);
  }

  return compareDailyTotals([...posByDay.values()], [...salesByDay.values()]);
}
