// =============================================================================
// modules/pos/adapters/mipos.ts
// Adapter MiPOS (mipos.gitbook.io/public-api). Verifica HMAC-SHA256 del corpo
// grezzo con MIPOS_WEBHOOK_SECRET; normalizza il webhook ricevuta in IncomingSale.
//
// NB SUI CAMPI: la forma del payload qui sotto rispecchia un webhook ricevuta
// MiPOS (evento + oggetto receipt con items). I NOMI DEI CAMPI sono il punto di
// adattamento: se l'integrazione reale differisce, si aggiusta SOLO lo schema zod
// (il resto del pipeline è provider-agnostico). Parser TOLLERANTE: accetta sia il
// nidificato `receipt{...}` sia i campi piatti, e gli alias comuni (sku/plu/id,
// total/total_cents).
// =============================================================================

import crypto from 'node:crypto';
import { z } from 'zod';
import type { IncomingSale, PosAdapter, SaleLine } from '../adapter';

const num = z.coerce.number();
const str = z.union([z.string(), z.number()]).transform((v) => String(v));

const lineSchema = z
  .object({
    sku: z.string().optional(),
    plu: z.string().optional(),
    id: str.optional(),
    item_id: str.optional(),
    name: z.string().optional(),
    item_name: z.string().optional(),
    quantity: num.optional(),
    qty: num.optional(),
    unit_price_cents: num.optional(),
    price_cents: num.optional(),
  })
  .passthrough();

const receiptCore = z
  .object({
    id: str.optional(),
    receipt_id: str.optional(),
    number: str.optional(),
    store_id: z.string().optional(),
    merchant_code: z.string().optional(),
    sold_at: z.string().optional(),
    created_at: z.string().optional(),
    timestamp: z.string().optional(),
    total_cents: num.optional(),
    total: num.optional(),
    items: z.array(lineSchema).optional(),
    lines: z.array(lineSchema).optional(),
  })
  .passthrough();

const payloadSchema = z
  .object({
    type: z.string().optional(),
    event: z.string().optional(),
    event_type: z.string().optional(),
    receipt: receiptCore.optional(),
  })
  .passthrough()
  .and(receiptCore); // ammette anche i campi receipt "piatti" a livello root

const SIGNATURE_PREFIX = /^sha256=/i;

function constantTimeEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export const miposAdapter: PosAdapter = {
  provider: 'mipos',

  verifySignature(rawBody: string, signatureHeader: string | null): boolean {
    const secret = (process.env.MIPOS_WEBHOOK_SECRET ?? '').trim();
    if (!secret || !signatureHeader) return false;
    const provided = signatureHeader.trim().replace(SIGNATURE_PREFIX, '');
    const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
    return constantTimeEquals(provided, expected);
  },

  parsePayload(body: unknown): IncomingSale {
    const p = payloadSchema.parse(body);
    const r = p.receipt ?? p; // nidificato o piatto

    const externalReceiptId = r.id ?? r.receipt_id ?? r.number;
    if (!externalReceiptId) {
      throw new Error('MiPOS: id ricevuta mancante');
    }

    const eventType = (p.type ?? p.event ?? p.event_type ?? '').toLowerCase();
    const isReversal = /void|refund|cancel|annull|storn|reso/.test(eventType);

    const rawLines = r.items ?? r.lines ?? [];
    const lines: SaleLine[] = rawLines.map((l) => ({
      pos_item_id: String(l.sku ?? l.plu ?? l.id ?? l.item_id ?? '').trim(),
      pos_item_name: (l.name ?? l.item_name ?? '').trim(),
      quantity: l.quantity ?? l.qty ?? 0,
      unit_price_cents: Math.round(l.unit_price_cents ?? l.price_cents ?? 0),
    }));

    return {
      external_receipt_id: String(externalReceiptId),
      provider: 'mipos',
      store_id: r.store_id ?? null,
      merchant_code: r.merchant_code ?? null,
      sold_at: r.sold_at ?? r.created_at ?? r.timestamp ?? new Date().toISOString(),
      lines,
      total_cents: Math.round(r.total_cents ?? r.total ?? 0),
      is_reversal: isReversal,
    };
  },
};
