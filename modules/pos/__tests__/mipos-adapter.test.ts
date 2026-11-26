import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { miposAdapter } from '../adapters/mipos';

// 062: la chiave arriva dalla CONFIG risolta (segreto per config), non dall'env.
const SECRET = 'test-secret-123';

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
    expect(miposAdapter.verifySignature(body, sign(body), SECRET)).toBe(true);
  });
  it('accetta il prefisso sha256=', () => {
    const body = JSON.stringify(salePayload);
    expect(miposAdapter.verifySignature(body, `sha256=${sign(body)}`, SECRET)).toBe(true);
  });
  it('corpo manomesso → false', () => {
    const body = JSON.stringify(salePayload);
    expect(miposAdapter.verifySignature(`${body} `, sign(body), SECRET)).toBe(false);
  });
  it('header firma assente → false', () => {
    expect(miposAdapter.verifySignature('{}', null, SECRET)).toBe(false);
  });
});

describe('miposAdapter.verifySignature — chiave per config (062)', () => {
  it('firma con la chiave di UN\'ALTRA config → false', () => {
    const body = JSON.stringify(salePayload);
    expect(miposAdapter.verifySignature(body, sign(body), 'altra-chiave')).toBe(false);
  });
  it('chiave vuota → false (mai accettare senza chiave)', () => {
    const body = JSON.stringify(salePayload);
    expect(miposAdapter.verifySignature(body, sign(body), '')).toBe(false);
  });
});

describe('miposAdapter.peekRouting', () => {
  it('legge store/merchant dal receipt annidato o dalla radice', () => {
    expect(miposAdapter.peekRouting(salePayload)).toEqual({ storeId: 'STORE-1', merchantCode: null });
    expect(miposAdapter.peekRouting({ store_id: 7, merchant_code: 'M1' })).toEqual({ storeId: '7', merchantCode: 'M1' });
  });
  it('payload strano → null, nessuna eccezione', () => {
    expect(miposAdapter.peekRouting(null)).toEqual({ storeId: null, merchantCode: null });
    expect(miposAdapter.peekRouting({ receipt: 'x' })).toEqual({ storeId: null, merchantCode: null });
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
