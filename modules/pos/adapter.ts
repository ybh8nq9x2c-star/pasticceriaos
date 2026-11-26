// =============================================================================
// modules/pos/adapter.ts
// SEAM provider POS. Ogni provider (MiPOS, …) normalizza il suo webhook in una
// `IncomingSale` provider-agnostica; il servizio di ingest lavora SOLO su questa.
// La firma si verifica sul CORPO GREZZO (il body si legge una sola volta nel
// route handler), prima di qualunque scrittura DB.
// =============================================================================

export interface SaleLine {
  pos_item_id: string; // SKU/PLU dal POS
  pos_item_name: string;
  quantity: number; // unità vendute (intere; le porzioni si derivano da portions_per_unit)
  unit_price_cents: number;
}

export interface IncomingSale {
  external_receipt_id: string;
  provider: string;
  store_id?: string | null;
  merchant_code?: string | null;
  sold_at: string; // ISO
  lines: SaleLine[];
  total_cents: number;
  /** Evento di annullo/reso → storno della vendita corrispondente. */
  is_reversal: boolean;
}

export interface PosAdapter {
  readonly provider: string;
  /**
   * HMAC sul corpo grezzo + header firma, con la chiave della CONFIG risolta
   * (062: segreto per config, vedi modules/pos/secret.ts). Niente firma valida →
   * niente scrittura.
   */
  verifySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean;
  /**
   * Legge SOLO i campi di instradamento (store/merchant) da un payload non ancora
   * verificato, per scegliere la chiave. Nessun effetto: i dati veri si leggono
   * con parsePayload DOPO la verifica della firma.
   */
  peekRouting(body: unknown): { storeId: string | null; merchantCode: string | null };
  /** Mappa il payload (JSON già parsato) in IncomingSale. Lancia su payload non valido. */
  parsePayload(body: unknown): IncomingSale;
}

import { miposAdapter } from './adapters/mipos';

const ADAPTERS: Record<string, PosAdapter> = {
  [miposAdapter.provider]: miposAdapter,
};

/** Adapter per il provider di rotta (`/api/webhooks/[provider]`), o null se ignoto. */
export function getPosAdapter(provider: string): PosAdapter | null {
  return ADAPTERS[provider.toLowerCase()] ?? null;
}

/** `source` su sales/product_mappings per un provider POS (es. 'pos:mipos'). */
export function posSource(provider: string): string {
  return `pos:${provider.toLowerCase()}`;
}
