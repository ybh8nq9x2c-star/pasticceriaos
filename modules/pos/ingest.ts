// =============================================================================
// modules/pos/ingest.ts
// Ingest di un evento POS: alimenta il MOTORE VENDITE esistente (ingestSaleAsSystem
// → ingest_sale_system), che mantiene tutti gli invarianti (BOM, idempotenza,
// storno append-only, unlinked≠errore). Qui solo: ledger pos_events (idempotenza
// primaria), risoluzione mapping per le porzioni, e instradamento sale/void.
// =============================================================================

import { getErrorMessage } from '@/lib/errors';
import type { Json } from '@/lib/database.types';
import * as salesService from '@/modules/sales/service';
import type { CanonicalSale } from '@/modules/sales/types';
import type { SalesDb } from '@/modules/sales/repository';
import { posSource, type IncomingSale } from './adapter';
import * as repo from './repository';

const norm = (s: string) => s.trim().toLowerCase();

export interface IngestResult {
  status: 'created' | 'duplicate' | 'reversed' | 'error';
  saleId?: string;
  unlinked?: string[];
}

/**
 * PURO: costruisce la CanonicalSale dalle righe POS + i mapping. Scala la quantità
 * per le porzioni (1 torta × 8 = 8 porzioni) e raccoglie gli SKU non collegati.
 * `recipeId` resta null: la risoluzione ricetta la fa il motore via product_mappings.
 */
export function buildCanonicalSale(
  incoming: IncomingSale,
  mappings: Map<string, repo.PosMapping>,
): { canonical: CanonicalSale; unlinked: string[] } {
  const unlinked: string[] = [];
  const source = posSource(incoming.provider);
  const canonical: CanonicalSale = {
    externalSaleId: incoming.external_receipt_id,
    source,
    soldAt: incoming.sold_at,
    totalAmount: incoming.total_cents / 100,
    customerId: null,
    notes: null,
    lines: incoming.lines.map((l, i) => {
      const m = mappings.get(norm(l.pos_item_id));
      if (!m) unlinked.push(l.pos_item_id); // nessun mapping → non collegato (riga registrata comunque)
      const portions = m?.portionsPerUnit ?? 1;
      return {
        externalLineId: String(i),
        externalProductRef: l.pos_item_id,
        productName: l.pos_item_name || m?.posItemName || l.pos_item_id,
        quantity: l.quantity * portions,
        unitPrice: l.unit_price_cents / 100,
        recipeId: null,
      };
    }),
  };
  return { canonical, unlinked };
}

/**
 * Ingerisce una `IncomingSale` per un'org risolta. `client` = service-role.
 * Idempotente: stesso (org, provider, external_receipt_id) → 'duplicate', nessuna
 * seconda vendita né deduzione (guard primario pos_events; backstop su sales).
 */
export async function ingestPosEvent(orgId: string, incoming: IncomingSale, client: SalesDb): Promise<IngestResult> {
  const source = posSource(incoming.provider);

  // 1) Ledger di idempotenza PRIMARIO (ON CONFLICT DO NOTHING).
  const event = await repo.insertPosEvent(client, {
    orgId,
    provider: incoming.provider,
    externalReceiptId: incoming.external_receipt_id,
    rawPayload: incoming as unknown as Json,
  });
  if (event.duplicate) return { status: 'duplicate' };

  try {
    // 2) Void/refund → storno della vendita corrispondente (append-only).
    if (incoming.is_reversal) {
      const saleId = await salesService.findSaleIdForExternal(orgId, source, incoming.external_receipt_id, client);
      if (!saleId) {
        await repo.markFailed(client, event.id, 'Storno: vendita originale non trovata per questo scontrino.');
        return { status: 'error' };
      }
      await salesService.reverseSaleAsSystem(orgId, saleId, client);
      await repo.markReversed(client, event.id, saleId);
      return { status: 'reversed', saleId };
    }

    // 3) Mapping POS→ricetta: serve per le PORZIONI (scala la quantità) e per
    //    individuare gli SKU NON collegati. La risoluzione ricetta la fa il motore.
    const mappings = await repo.loadMappings(client, orgId, source, incoming.lines.map((l) => l.pos_item_id));
    const { canonical, unlinked } = buildCanonicalSale(incoming, mappings);

    // 4) MOTORE esistente: risoluzione + esplosione BOM + scrittura atomica idempotente.
    const summary = await salesService.ingestSaleAsSystem(orgId, canonical, client);
    await repo.markProcessed(client, event.id, summary.saleId, unlinked);
    return { status: 'created', saleId: summary.saleId, unlinked: unlinked.length ? unlinked : undefined };
  } catch (err) {
    await repo.markFailed(client, event.id, getErrorMessage(err));
    return { status: 'error' };
  }
}
