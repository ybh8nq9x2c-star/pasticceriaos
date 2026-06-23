import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import { miposAdapter } from '../adapters/mipos';

const SECRET = 'test-secret-123';
beforeAll(() => {
  process.env.MIPOS_WEBHOOK_SECRET = SECRET;
});

const sign = (body: string) => crypto.createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');

const salePayload = {
  type: 'receipt.created',
  receipt: {
    id: 'RCP-100',
    store_id: 'STORE-1',
    created_at: '2026-06-23T10:00:00Z',
    total_cents: 480,
    items: [
      { sku: 'PLU-1', name: 'Cornetto', quantity: 2, unit_price_cents: 120 },
      { sku: 'PLU-2', name: 'Torta', quantity: 1, unit_price_cents: 240 },
    ],
  },
};

describe('miposAdapter.verifySignature (HMAC-SHA256)', () => {
  it('firma valida → true', () => {
    const body = JSON.stringify(salePayload);
    expect(miposAdapter.verifySignature(body, sign(body))).toBe(true);
  });
  it('accetta il prefisso sha256=', () => {
    const body = JSON.stringify(salePayload);
    expect(miposAdapter.verifySignature(body, `sha256=${sign(body)}`)).toBe(true);
  });
  it('corpo manomesso → false', () => {
    const body = JSON.stringify(salePayload);
    expect(miposAdapter.verifySignature(`${body} `, sign(body))).toBe(false);
  });
  it('header firma assente → false', () => {
    expect(miposAdapter.verifySignature('{}', null)).toBe(false);
  });
});

describe('miposAdapter.parsePayload', () => {
  it('sale → IncomingSale corretta', () => {
    const r = miposAdapter.parsePayload(salePayload);
    expect(r.external_receipt_id).toBe('RCP-100');
    expect(r.provider).toBe('mipos');
    expect(r.is_reversal).toBe(false);
    expect(r.store_id).toBe('STORE-1');
    expect(r.total_cents).toBe(480);
    expect(r.lines).toEqual([
      { pos_item_id: 'PLU-1', pos_item_name: 'Cornetto', quantity: 2, unit_price_cents: 120 },
      { pos_item_id: 'PLU-2', pos_item_name: 'Torta', quantity: 1, unit_price_cents: 240 },
    ]);
  });

  it('void/refund → is_reversal true', () => {
    const r = miposAdapter.parsePayload({ type: 'receipt.voided', receipt: { id: 'RCP-100', items: [] } });
    expect(r.is_reversal).toBe(true);
    expect(r.external_receipt_id).toBe('RCP-100');
  });

  it('campi piatti + alias (plu/qty/price_cents) tollerati', () => {
    const r = miposAdapter.parsePayload({
      type: 'sale',
      id: 'RCP-9',
      items: [{ plu: 'X', name: 'Y', qty: 3, price_cents: 50 }],
    });
    expect(r.external_receipt_id).toBe('RCP-9');
    expect(r.lines[0]).toEqual({ pos_item_id: 'X', pos_item_name: 'Y', quantity: 3, unit_price_cents: 50 });
  });

  it('id ricevuta mancante → errore', () => {
    expect(() => miposAdapter.parsePayload({ type: 'sale', items: [] })).toThrow();
  });
});
