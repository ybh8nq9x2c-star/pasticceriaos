// =============================================================================
// modules/sales/adapters.ts
// SEAM DI INGESTIONE: la logica di dominio (service) lavora SOLO su CanonicalSale.
// Ogni sorgente (inserimento manuale, import CSV, webhook POS, mock di test) ha
// il suo adapter che normalizza il payload grezzo in CanonicalSale. Aggiungere un
// POS reale = aggiungere un adapter, senza toccare service/repository.
// =============================================================================

import { manualSaleSchema } from './schemas';
import type { CanonicalSale } from './types';

export interface SaleAdapter {
  /** Identificatore sorgente, scritto su sales.source (parte della chiave di idempotenza). */
  readonly source: string;
  /** Normalizza il payload grezzo della sorgente in una vendita canonica. */
  toCanonical(raw: unknown): CanonicalSale;
}

/**
 * Adapter manuale/mock — l'ingestione V1 finché il POS live non è collegato.
 * Stesso percorso che userà un webhook reale: valida → CanonicalSale → service.
 */
export const manualSaleAdapter: SaleAdapter = {
  source: 'manual',
  toCanonical(raw: unknown): CanonicalSale {
    const input = manualSaleSchema.parse(raw);
    return {
      externalSaleId: input.externalSaleId,
      source: input.source,
      soldAt: input.soldAt ?? new Date().toISOString(),
      totalAmount: input.totalAmount ?? null,
      customerId: input.customerId ?? null,
      notes: input.notes ?? null,
      lines: input.lines.map((l) => ({
        externalLineId: l.externalLineId ?? null,
        externalProductRef: l.externalProductRef,
        productName: l.productName ?? l.externalProductRef,
        quantity: l.quantity,
        unitPrice: l.unitPrice ?? null,
        recipeId: l.recipeId ?? null,
      })),
    };
  },
};

/**
 * Registro adapter. Il service risolve la sorgente da qui. I futuri adapter
 * (csvSaleAdapter, posWebhookAdapter, …) si registrano qui senza altri cambi.
 */
export const saleAdapters: Record<string, SaleAdapter> = {
  [manualSaleAdapter.source]: manualSaleAdapter,
};

export function getAdapter(source: string): SaleAdapter {
  const adapter = saleAdapters[source];
  if (!adapter) throw new Error(`Nessun adapter per la sorgente "${source}"`);
  return adapter;
}
