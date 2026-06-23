import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ingestPosEvent, buildCanonicalSale } from '../ingest';
import type { IncomingSale } from '../adapter';
import type { PosMapping } from '../repository';

vi.mock('../repository');
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
    vi.mocked(repo.insertPosEvent).mockResolvedValue({ id: 'E1', duplicate: true });
    const r = await ingestPosEvent('ORG', baseSale, client);
    expect(r).toEqual({ status: 'duplicate' });
    expect(sales.ingestSaleAsSystem).not.toHaveBeenCalled();
  });

  it('tutte le righe mappate → vendita registrata, deduzione (scaling porzioni)', async () => {
    vi.mocked(repo.insertPosEvent).mockResolvedValue({ id: 'E1', duplicate: false });
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
    expect(repo.markProcessed).toHaveBeenCalledWith(client, 'E1', 'SALE-1', []);
  });

  it('alcune righe non collegate → vendita registrata + unlinked, nessun crash', async () => {
    vi.mocked(repo.insertPosEvent).mockResolvedValue({ id: 'E1', duplicate: false });
    vi.mocked(repo.loadMappings).mockResolvedValue(
      new Map<string, PosMapping>([['plu-1', { recipeId: 'R1', portionsPerUnit: 1, posItemName: 'Cornetto' }]]),
    );
    vi.mocked(sales.ingestSaleAsSystem).mockResolvedValue(summary);

    const r = await ingestPosEvent('ORG', baseSale, client);
    expect(r.status).toBe('created');
    expect(r.unlinked).toEqual(['PLU-2']);
    expect(repo.markProcessed).toHaveBeenCalledWith(client, 'E1', 'SALE-1', ['PLU-2']);
  });

  it('evento void → reverse_sale, status reversed', async () => {
    vi.mocked(repo.insertPosEvent).mockResolvedValue({ id: 'E1', duplicate: false });
    vi.mocked(sales.findSaleIdForExternal).mockResolvedValue('SALE-1');
    vi.mocked(sales.reverseSaleAsSystem).mockResolvedValue();

    const r = await ingestPosEvent('ORG', { ...baseSale, is_reversal: true }, client);
    expect(r.status).toBe('reversed');
    expect(r.saleId).toBe('SALE-1');
    expect(sales.reverseSaleAsSystem).toHaveBeenCalledWith('ORG', 'SALE-1', client);
    expect(repo.markReversed).toHaveBeenCalledWith(client, 'E1', 'SALE-1');
    expect(sales.ingestSaleAsSystem).not.toHaveBeenCalled();
  });

  it('void senza vendita originale → error, evento failed', async () => {
    vi.mocked(repo.insertPosEvent).mockResolvedValue({ id: 'E1', duplicate: false });
    vi.mocked(sales.findSaleIdForExternal).mockResolvedValue(null);

    const r = await ingestPosEvent('ORG', { ...baseSale, is_reversal: true }, client);
    expect(r.status).toBe('error');
    expect(sales.reverseSaleAsSystem).not.toHaveBeenCalled();
    expect(repo.markFailed).toHaveBeenCalled();
  });
});
