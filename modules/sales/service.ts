// =============================================================================
// modules/sales/service.ts
// Orchestrazione vendite. DOMINIO (050): la vendita registra l'evento e scala i
// PRODOTTI FINITI (righe risolte su ricetta). NIENTE esplosione BOM, niente
// consumo materie prime: quello avviene al completamento produzione.
//   ingestSale: payload grezzo → adapter → CanonicalSale → risoluzione prodotto
//   → payload RPC → ingest_sale (atomico + idempotente, scala i finiti).
// =============================================================================

import { AuthError } from '@/lib/errors';
import type { Json } from '@/lib/database.types';
import { requireSession } from '@/modules/identity/service';
import { getAdapter } from './adapters';
import { linkProductSchema, reverseSaleSchema } from './schemas';
import { aggregateSaleStatus, type CanonicalSale, type IngestSummary, type SaleLineStatus } from './types';
import * as repo from './repository';

async function requireWriter() {
  const session = await requireSession();
  if (session.role === 'viewer') {
    throw new AuthError('Non hai i permessi per registrare vendite.');
  }
  return session;
}

/**
 * Ingestione di una vendita da una sorgente registrata (default 'manual').
 * Tutta la deduzione avviene QUI, al momento della vendita — non in produzione.
 */
export async function ingestSale(source: string, raw: unknown): Promise<IngestSummary> {
  const session = await requireWriter();
  const adapter = getAdapter(source);
  const sale = adapter.toCanonical(raw);
  return ingestCanonicalSale(session.organizationId, sale);
}

/**
 * Cuore dell'orchestrazione. `opts.client` inietta un client DB (il bordo POS usa
 * service-role, senza sessione); `opts.system` instrada sulla RPC org-esplicita
 * `ingest_sale_system`. Default = percorso di sessione (RLS, ingest_sale).
 */
export async function ingestCanonicalSale(
  orgId: string,
  sale: CanonicalSale,
  opts?: { client?: repo.SalesDb; system?: boolean; nameFallback?: boolean },
): Promise<IngestSummary> {
  // 1) Risolvi ogni riga in una ricetta (mapping esplicito → tabella → nome).
  const resolved = await repo.resolveRecipeIds(
    orgId,
    sale.source,
    sale.lines.map((l) => ({ externalProductRef: l.externalProductRef, productName: l.productName, recipeId: l.recipeId })),
    opts?.client,
    { nameFallback: opts?.nameFallback },
  );

  // 2) Stato riga: risolta → 'deducted' (la RPC scala i PRODOTTI FINITI per
  //    quella quantità); non risolta → 'unlinked' (registrata, nessuno scarico).
  //    Niente BOM: le materie prime le consuma la produzione, non la vendita.
  const lines = sale.lines.map((line, i) => {
    const recipeId = resolved.get(i) ?? null;
    const status: SaleLineStatus = recipeId ? 'deducted' : 'unlinked';
    return {
      line,
      recipeId,
      status,
      exception: recipeId ? null : 'Prodotto non collegato a una ricetta.',
    };
  });
  const saleStatus = aggregateSaleStatus(lines.map((l) => l.status));

  // 3) Payload per la RPC atomica (snake_case lato DB).
  const payload = {
    external_sale_id: sale.externalSaleId,
    source: sale.source,
    sold_at: sale.soldAt,
    status: saleStatus,
    total_amount: sale.totalAmount ?? null,
    customer_id: sale.customerId ?? null,
    notes: sale.notes ?? null,
    lines: lines.map((l, i) => ({
      external_line_id: l.line.externalLineId ?? null,
      external_product_ref: l.line.externalProductRef,
      product_name_snapshot: l.line.productName,
      recipe_id: l.recipeId,
      quantity: l.line.quantity,
      unit_price: l.line.unitPrice ?? null,
      status: l.status,
      exception: l.exception,
      sort_order: i,
    })),
  };

  // 4) Scrittura atomica + idempotente (ON CONFLICT impedisce doppia deduzione).
  const saleId = opts?.system
    ? await repo.ingestSaleSystemRpc(orgId, payload as unknown as Json, opts.client!)
    : await repo.ingestSaleRpc(payload as unknown as Json, opts?.client);

  const linesDeducted = lines.filter((l) => l.status === 'deducted').length;
  return {
    saleId,
    status: saleStatus,
    linesTotal: sale.lines.length,
    linesDeducted,
    linesNeedingAttention: sale.lines.length - linesDeducted,
    movementsCreated: linesDeducted, // 1 movimento finished-goods per riga dedotta
  };
}

/** Storno vendita: la RPC inserisce i movimenti inversi (storia immutata). */
export async function reverseSale(raw: unknown): Promise<{ saleId: string }> {
  await requireWriter();
  const { saleId } = reverseSaleSchema.parse(raw);
  await repo.reverseSaleRpc(saleId);
  return { saleId };
}

// ── Percorso di SISTEMA (bordo POS: webhook, nessuna sessione) ────────────────
// Stesso motore (risoluzione + esplosione BOM + RPC idempotente), ma org esplicita
// e client service-role iniettato. Gli invarianti restano qui.

export async function ingestSaleAsSystem(
  orgId: string,
  sale: CanonicalSale,
  client: repo.SalesDb,
): Promise<IngestSummary> {
  // nameFallback FALSE: per il POS il collegamento prodotto→ricetta è SOLO via
  // product_mappings esplicito (niente auto-link per nome ricetta).
  return ingestCanonicalSale(orgId, sale, { client, system: true, nameFallback: false });
}

export async function reverseSaleAsSystem(orgId: string, saleId: string, client: repo.SalesDb): Promise<void> {
  await repo.reverseSaleSystemRpc(orgId, saleId, client);
}

export async function findSaleIdForExternal(
  orgId: string,
  source: string,
  externalSaleId: string,
  client: repo.SalesDb,
): Promise<string | null> {
  return repo.findSaleIdByExternal(orgId, source, externalSaleId, client);
}

/**
 * Collega un prodotto POS a una ricetta. Le vendite FUTURE di quel prodotto
 * verranno dedotte automaticamente (le passate si possono ri-ingerire o restano
 * registrate come "non dedotte").
 */
export async function linkProduct(raw: unknown): Promise<void> {
  const session = await requireWriter();
  const input = linkProductSchema.parse(raw);
  await repo.upsertMapping(session.organizationId, input.source, input.externalProductRef, input.recipeId);
}

/**
 * Ricollega righe unlinked di una vendita ESISTENTE dopo la correzione del
 * mapping (replay dall'inbox POS): RPC atomica, deduzione finiti solo per le
 * righe appena risolte, stato vendita ricalcolato. Idempotente per riga.
 */
export async function relinkSaleLines(saleId: string, lines: repo.RelinkLine[]): Promise<number> {
  await requireWriter();
  if (lines.length === 0) return 0;
  return repo.relinkSaleLinesRpc(saleId, lines);
}

// ── Letture per la UI ─────────────────────────────────────────────────────────

export async function listSales() {
  const session = await requireSession();
  return repo.listRecentSales(session.organizationId);
}

export async function getSaleLines(saleId: string) {
  const session = await requireSession();
  return repo.listSaleLines(session.organizationId, saleId);
}

export async function getSale(saleId: string) {
  const session = await requireSession();
  return repo.getSale(session.organizationId, saleId);
}

export async function listUnlinkedProducts() {
  const session = await requireSession();
  return repo.listUnlinkedProducts(session.organizationId);
}

export async function listLinkableRecipes() {
  const session = await requireSession();
  return repo.listActiveRecipes(session.organizationId);
}
