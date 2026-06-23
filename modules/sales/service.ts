// =============================================================================
// modules/sales/service.ts
// Orchestrazione della deduzione magazzino al momento della vendita.
//   ingestSale: payload grezzo → adapter → CanonicalSale → risoluzione prodotto
//   → esplosione BOM (conversione unità) → payload RPC → ingest_sale (atomico+
//   idempotente). La matematica è in bom.ts (pura); qui c'è solo il collante I/O.
// =============================================================================

import { AuthError } from '@/lib/errors';
import type { Json } from '@/lib/database.types';
import { requireSession } from '@/modules/identity/service';
import { getAdapter } from './adapters';
import { explodeLine, aggregateSaleStatus } from './bom';
import { linkProductSchema, reverseSaleSchema } from './schemas';
import type { CanonicalSale, IngestSummary } from './types';
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

/** Cuore dell'orchestrazione (separato per riuso/test futuri lato server). */
export async function ingestCanonicalSale(orgId: string, sale: CanonicalSale): Promise<IngestSummary> {
  // 1) Risolvi ogni riga in una ricetta (mapping esplicito → tabella → nome).
  const resolved = await repo.resolveRecipeIds(
    orgId,
    sale.source,
    sale.lines.map((l) => ({ externalProductRef: l.externalProductRef, productName: l.productName, recipeId: l.recipeId })),
  );

  // 2) Carica i BOM delle ricette risolte (una sola query).
  const recipeIds = [...new Set([...resolved.values()].filter((v): v is string => !!v))];
  const boms = await repo.loadBoms(orgId, recipeIds);

  // 3) Esplodi ogni riga (logica pura): movimenti + stato + eccezione.
  const exploded = sale.lines.map((line, i) => {
    const recipeId = resolved.get(i) ?? null;
    const bom = recipeId ? boms.get(recipeId) ?? { basePortions: 0, items: [] } : null;
    return { line, recipeId, result: explodeLine(bom, line.quantity) };
  });
  const saleStatus = aggregateSaleStatus(exploded.map((e) => e.result.status));

  // 4) Costruisci il payload per la RPC atomica (snake_case lato DB).
  const payload = {
    external_sale_id: sale.externalSaleId,
    source: sale.source,
    sold_at: sale.soldAt,
    status: saleStatus,
    total_amount: sale.totalAmount ?? null,
    customer_id: sale.customerId ?? null,
    notes: sale.notes ?? null,
    lines: exploded.map((e, i) => ({
      external_line_id: e.line.externalLineId ?? null,
      external_product_ref: e.line.externalProductRef,
      product_name_snapshot: e.line.productName,
      recipe_id: e.recipeId,
      quantity: e.line.quantity,
      unit_price: e.line.unitPrice ?? null,
      status: e.result.status,
      exception: e.result.exception,
      sort_order: i,
      movements: e.result.movements.map((m) => ({
        ingredient_product_id: m.ingredientProductId,
        quantity_delta: m.quantityDelta,
        unit: m.unit,
      })),
    })),
  };

  // 5) Scrittura atomica + idempotente (ON CONFLICT impedisce doppia deduzione).
  const saleId = await repo.ingestSaleRpc(payload as unknown as Json);

  const linesDeducted = exploded.filter((e) => e.result.status === 'deducted').length;
  return {
    saleId,
    status: saleStatus,
    linesTotal: sale.lines.length,
    linesDeducted,
    linesNeedingAttention: sale.lines.length - linesDeducted,
    movementsCreated: exploded.reduce((n, e) => n + e.result.movements.length, 0),
  };
}

/** Storno vendita: la RPC inserisce i movimenti inversi (storia immutata). */
export async function reverseSale(raw: unknown): Promise<{ saleId: string }> {
  await requireWriter();
  const { saleId } = reverseSaleSchema.parse(raw);
  await repo.reverseSaleRpc(saleId);
  return { saleId };
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
