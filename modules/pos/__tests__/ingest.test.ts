import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ingestPosEvent, buildCanonicalSale } from '../ingest';
import type { IncomingSale } from '../adapter';
import type { PosMapping } from '../repository';

vi.mock('../repository', async (orig) => {
  const actual = await orig<typeof import('../repository')>();
  // funzioni DB finte; restano reali le PURE (isTerminal, NON_TERMINAL)
  return {
    ...Object.fromEntries(Object.keys(actual).map((k) => [k, typeof actual[k as keyof typeof actual] === 'function' ? vi.fn() : actual[k as keyof typeof actual]])),
    isTerminal: actual.isTerminal,
    NON_TERMINAL: actual.NON_TERMINAL,
  };
});
vi.mock('@/modules/sales/service');

import * as repo from '../repository';
import * as sales from '@/modules/sales/service';

const client = {} as never;

const baseSale: IncomingSale = {
  external_receipt_id: 'RCP-1',
  provider: 'mipos',
  store_id: 'S1',
  sold_at: '2026-06-23T10:00:00Z',
  total_cents: 480,
  is_reversal: false,
  lines: [
    { pos_item_id: 'PLU-1', pos_item_name: 'Cornetto', quantity: 2, unit_price_cents: 120 },
    { pos_item_id: 'PLU-2', pos_item_name: 'Torta', quantity: 1, unit_price_cents: 240 },
  ],
};

const summary = { saleId: 'SALE-1', status: 'processed', linesTotal: 2, linesDeducted: 2, linesNeedingAttention: 0, movementsCreated: 5 } as const;

beforeEach(() => {
  vi.resetAllMocks();
});

describe('buildCanonicalSale (puro)', () => {
  it('scala la quantità per le porzioni e raccoglie i non collegati', () => {
    const mappings = new Map<string, PosMapping>([['plu-2', { recipeId: 'R2', portionsPerUnit: 8, posItemName: 'Torta' }]]);
    const { canonical, unlinked } = buildCanonicalSale(baseSale, mappings);
    expect(canonical.source).toBe('pos:mipos');
    expect(canonical.lines[0].quantity).toBe(2); // PLU-1 non mappato → porzioni 1
    expect(canonical.lines[1].quantity).toBe(8); // 1 torta × 8 porzioni
    expect(unlinked).toEqual(['PLU-1']);
  });
});

describe('ingestPosEvent', () => {
  it('scontrino duplicato → status duplicate, nessuna seconda vendita', async () => {
    vi.mocked(repo.insertPosEvent).mockResolvedValue({ id: 'E1', duplicate: true, status: 'processed' });
    const r = await ingestPosEvent('ORG', baseSale, client);
    expect(r).toEqual({ status: 'duplicate' });
    expect(sales.ingestSaleAsSystem).not.toHaveBeenCalled();
  });

  it('tutte le righe mappate → vendita registrata, deduzione (scaling porzioni)', async () => {
    vi.mocked(repo.insertPosEvent).mockResolvedValue({ id: 'E1', duplicate: false, status: 'received' });
    vi.mocked(repo.loadMappings).mockResolvedValue(
      new Map<string, PosMapping>([
        ['plu-1', { recipeId: 'R1', portionsPerUnit: 1, posItemName: 'Cornetto' }],
        ['plu-2', { recipeId: 'R2', portionsPerUnit: 8, posItemName: 'Torta' }],
      ]),
    );
    vi.mocked(sales.ingestSaleAsSystem).mockResolvedValue(summary);

    const r = await ingestPosEvent('ORG', baseSale, client);
    expect(r.status).toBe('created');
    expect(r.saleId).toBe('SALE-1');
    expect(r.unlinked).toBeUndefined();
    const passed = vi.mocked(sales.ingestSaleAsSystem).mock.calls[0][1];
    expect(passed.lines[1].quantity).toBe(8); // torta scalata
    expect(repo.markProcessed).toHaveBeenCalledWith(client, 'ORG', 'E1', 'SALE-1', []);
  });

  it('alcune righe non collegate → vendita registrata + unlinked, nessun crash', async () => {
    vi.mocked(repo.insertPosEvent).mockResolvedValue({ id: 'E1', duplicate: false, status: 'received' });
    vi.mocked(repo.loadMappings).mockResolvedValue(
      new Map<string, PosMapping>([['plu-1', { recipeId: 'R1', portionsPerUnit: 1, posItemName: 'Cornetto' }]]),
    );
    vi.mocked(sales.ingestSaleAsSystem).mockResolvedValue(summary);

    const r = await ingestPosEvent('ORG', baseSale, client);
    expect(r.status).toBe('created');
    expect(r.unlinked).toEqual(['PLU-2']);
    expect(repo.markProcessed).toHaveBeenCalledWith(client, 'ORG', 'E1', 'SALE-1', ['PLU-2']);
  });

  it('evento void → reverse_sale, status reversed', async () => {
    vi.mocked(repo.insertPosEvent).mockResolvedValue({ id: 'E1', duplicate: false, status: 'received' });
    vi.mocked(sales.findSaleIdForExternal).mockResolvedValue('SALE-1');
    vi.mocked(sales.reverseSaleAsSystem).mockResolvedValue();

    const r = await ingestPosEvent('ORG', { ...baseSale, is_reversal: true }, client);
    expect(r.status).toBe('reversed');
    expect(r.saleId).toBe('SALE-1');
    expect(sales.reverseSaleAsSystem).toHaveBeenCalledWith('ORG', 'SALE-1', client);
    expect(repo.markReversed).toHaveBeenCalledWith(client, 'ORG', 'E1', 'SALE-1');
    expect(sales.ingestSaleAsSystem).not.toHaveBeenCalled();
  });

  it('void senza vendita originale → failed (permanente, recuperabile), evento failed', async () => {
    vi.mocked(repo.insertPosEvent).mockResolvedValue({ id: 'E1', duplicate: false, status: 'received' });
    vi.mocked(sales.findSaleIdForExternal).mockResolvedValue(null);

    const r = await ingestPosEvent('ORG', { ...baseSale, is_reversal: true }, client);
    expect(r.status).toBe('failed');
    expect(sales.reverseSaleAsSystem).not.toHaveBeenCalled();
    expect(repo.markFailed).toHaveBeenCalled();
  });

  it('sale e void con lo STESSO receipt_id → due eventi con event_type distinto (il void non è più inghiottito)', async () => {
    vi.mocked(repo.insertPosEvent).mockResolvedValue({ id: 'E1', duplicate: false, status: 'received' });
    vi.mocked(repo.loadMappings).mockResolvedValue(new Map());
    vi.mocked(sales.ingestSaleAsSystem).mockResolvedValue(summary);
    await ingestPosEvent('ORG', baseSale, client);

    vi.mocked(sales.findSaleIdForExternal).mockResolvedValue('SALE-1');
    vi.mocked(sales.reverseSaleAsSystem).mockResolvedValue();
    await ingestPosEvent('ORG', { ...baseSale, is_reversal: true }, client);

    const calls = vi.mocked(repo.insertPosEvent).mock.calls;
    expect(calls[0][1]).toMatchObject({ eventType: 'sale', externalStoreId: 'S1', externalReceiptId: 'RCP-1' });
    expect(calls[1][1]).toMatchObject({ eventType: 'reversal', externalStoreId: 'S1', externalReceiptId: 'RCP-1' });
  });
});

describe('ingestPosEvent — eventi recuperabili (062)', () => {
  const mapped = new Map<string, PosMapping>([['plu-1', { recipeId: 'R1', portionsPerUnit: 1, posItemName: 'Cornetto' }]]);

  it('retry dopo errore TRANSITORIO: 1° tentativo → retry (5xx), reinvio → riprocessato, UNA vendita', async () => {
    const { DatabaseError } = await import('@/lib/errors');
    // 1° invio: l'evento viene scritto, poi la vendita fallisce per un errore DB transitorio
    vi.mocked(repo.insertPosEvent).mockResolvedValueOnce({ id: 'E1', duplicate: false, status: 'received' });
    vi.mocked(repo.loadMappings).mockResolvedValue(mapped);
    vi.mocked(sales.ingestSaleAsSystem).mockRejectedValueOnce(new DatabaseError('connection reset'));
    vi.mocked(repo.markFailed).mockResolvedValue(undefined);
    const r1 = await ingestPosEvent('ORG', baseSale, client);
    expect(r1.status).toBe('retry');
    expect(repo.markFailed).toHaveBeenCalledTimes(1);
    expect(repo.markProcessed).not.toHaveBeenCalled();

    // reinvio della cassa: l'evento esiste ma NON è terminale (failed) → si riprende
    vi.mocked(repo.insertPosEvent).mockResolvedValueOnce({ id: 'E1', duplicate: true, status: 'failed' });
    vi.mocked(sales.ingestSaleAsSystem).mockResolvedValueOnce(summary);
    const r2 = await ingestPosEvent('ORG', baseSale, client);
    expect(r2).toMatchObject({ status: 'created', saleId: 'SALE-1', resumed: true });
    expect(repo.markProcessed).toHaveBeenCalledTimes(1);
    expect(repo.markProcessed).toHaveBeenCalledWith(client, 'ORG', 'E1', 'SALE-1', ['PLU-2']);

    // terzo invio (già processed) → duplicate, nessuna nuova elaborazione
    vi.mocked(repo.insertPosEvent).mockResolvedValueOnce({ id: 'E1', duplicate: true, status: 'processed' });
    const r3 = await ingestPosEvent('ORG', baseSale, client);
    expect(r3).toEqual({ status: 'duplicate' });
    expect(sales.ingestSaleAsSystem).toHaveBeenCalledTimes(2); // 1 fallito + 1 riuscito: nessun doppione
    expect(repo.markProcessed).toHaveBeenCalledTimes(1);
  });

  it('evento rimasto "received" (crash a metà) → il reinvio lo riprocessa', async () => {
    vi.mocked(repo.insertPosEvent).mockResolvedValue({ id: 'E9', duplicate: true, status: 'received' });
    vi.mocked(repo.loadMappings).mockResolvedValue(mapped);
    vi.mocked(sales.ingestSaleAsSystem).mockResolvedValue(summary);
    const r = await ingestPosEvent('ORG', baseSale, client);
    expect(r).toMatchObject({ status: 'created', resumed: true });
  });

  it('errore di dominio (permanente) → failed, non retry', async () => {
    const { BusinessRuleError } = await import('@/lib/errors');
    vi.mocked(repo.insertPosEvent).mockResolvedValue({ id: 'E1', duplicate: false, status: 'received' });
    vi.mocked(repo.loadMappings).mockResolvedValue(mapped);
    vi.mocked(sales.ingestSaleAsSystem).mockRejectedValue(new BusinessRuleError('vendita non valida'));
    vi.mocked(repo.markFailed).mockResolvedValue(undefined);
    const r = await ingestPosEvent('ORG', baseSale, client);
    expect(r.status).toBe('failed');
  });

  it('scrittura evento fallita (accettazione non durevole) → eccezione al chiamante (il webhook risponde 5xx)', async () => {
    vi.mocked(repo.insertPosEvent).mockRejectedValue(new Error('db down'));
    await expect(ingestPosEvent('ORG', baseSale, client)).rejects.toThrow('db down');
    expect(sales.ingestSaleAsSystem).not.toHaveBeenCalled();
  });
});
