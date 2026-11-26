// =============================================================================
// modules/pos/ingest.ts
// Ingest di un evento POS: alimenta il MOTORE VENDITE esistente (ingestSaleAsSystem
// → ingest_sale_system), che mantiene tutti gli invarianti (deduzione FINITI, idempotenza,
// storno append-only, unlinked≠errore). Qui solo: ledger pos_events (idempotenza
// primaria), risoluzione mapping per le porzioni, e instradamento sale/void.
// =============================================================================

import { BusinessRuleError, NotFoundError, ValidationError, getErrorMessage } from '@/lib/errors';
import type { Json } from '@/lib/database.types';
import * as salesService from '@/modules/sales/service';
import type { CanonicalSale } from '@/modules/sales/types';
import type { SalesDb } from '@/modules/sales/repository';
import { posSource, type IncomingSale } from './adapter';
import { normalizePosRef } from './normalize';
import * as repo from './repository';


export interface IngestResult {
  /**
   * created/reversed = elaborato ora · duplicate = già elaborato (terminale) ·
   * failed = registrato ma non elaborabile (errore permanente: visibile in inbox,
   * replay manuale) · retry = registrato, errore TRANSITORIO: il webhook risponde
   * 5xx così la cassa ritenta, e il reinvio lo riprocessa (062).
   */
  status: 'created' | 'duplicate' | 'reversed' | 'failed' | 'retry';
  saleId?: string;
  unlinked?: string[];
  /** true se l'evento era già presente ma non terminale ed è stato ripreso. */
  resumed?: boolean;
}

/** Errori di dominio = permanenti (un retry identico fallirebbe uguale). */
function isPermanent(err: unknown): boolean {
  return err instanceof BusinessRuleError || err instanceof ValidationError || err instanceof NotFoundError;
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
      const m = mappings.get(normalizePosRef(l.pos_item_id));
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
 *
 * 1) Accettazione DUREVOLE: la riga pos_events viene scritta per prima
 *    (se fallisce, l'eccezione risale → il webhook risponde 5xx e la cassa ritenta).
 * 2) Idempotenza: un evento già TERMINALE (processed/reversed) → 'duplicate'.
 *    Un evento NON terminale (received/failed: primo tentativo incompleto) viene
 *    RIPROCESSATO invece di essere scartato (062).
 * 3) Gli RPC a valle sono idempotenti (sales UNIQUE org+source+external_id), e
 *    gli esiti si scrivono solo su eventi non terminali: due tentativi concorrenti
 *    producono UNA vendita.
 */
export async function ingestPosEvent(orgId: string, incoming: IncomingSale, client: SalesDb): Promise<IngestResult> {
  const source = posSource(incoming.provider);

  const event = await repo.insertPosEvent(client, {
    orgId,
    provider: incoming.provider,
    externalReceiptId: incoming.external_receipt_id,
    eventType: incoming.is_reversal ? 'reversal' : 'sale',
    externalStoreId: incoming.store_id ?? '',
    rawPayload: incoming as unknown as Json,
  });
  if (event.duplicate && repo.isTerminal(event.status)) return { status: 'duplicate' };
  const resumed = event.duplicate ? { resumed: true } : {};

  try {
    if (incoming.is_reversal) {
      const saleId = await salesService.findSaleIdForExternal(orgId, source, incoming.external_receipt_id, client);
      if (!saleId) {
        // La vendita originale può arrivare dopo (ordine di consegna non garantito):
        // registrato come failed, recuperabile dall'inbox o dal reinvio della cassa.
        await repo.markFailed(client, orgId, event.id, 'Storno: vendita originale non trovata per questo scontrino.');
        return { status: 'failed', ...resumed };
      }
      await salesService.reverseSaleAsSystem(orgId, saleId, client);
      await repo.markReversed(client, orgId, event.id, saleId);
      return { status: 'reversed', saleId, ...resumed };
    }

    const mappings = await repo.loadMappings(client, orgId, source, incoming.lines.map((l) => l.pos_item_id));
    const { canonical, unlinked } = buildCanonicalSale(incoming, mappings);

    const summary = await salesService.ingestSaleAsSystem(orgId, canonical, client);
    await repo.markProcessed(client, orgId, event.id, summary.saleId, unlinked);
    return { status: 'created', saleId: summary.saleId, unlinked: unlinked.length ? unlinked : undefined, ...resumed };
  } catch (err) {
    // best-effort: se anche questo fallisce l'evento resta 'received' (non
    // terminale) e il reinvio lo riprende comunque.
    await repo.markFailed(client, orgId, event.id, getErrorMessage(err)).catch(() => undefined);
    return { status: isPermanent(err) ? 'failed' : 'retry', ...resumed };
  }
}
