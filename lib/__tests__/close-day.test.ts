import { describe, expect, it } from 'vitest';
import { buildCloseDaySteps, type CloseDayInput } from '../close-day';

const base: CloseDayInput = {
  pendingPlans: [],
  leftoverProducts: [],
  openReceipts: [],
  deliveredMarketplaceOrders: [],
  posFailed: 0,
  posUnmapped: 0,
  hour: 19,
  today: '2026-07-03',
};

describe('buildCloseDaySteps', () => {
  it('giornata pulita → nessun passo (la card non compare)', () => {
    expect(buildCloseDaySteps(base)).toHaveLength(0);
  });

  it('piano di OGGI non confermato: compare solo dalla sera', () => {
    const plans = [{ id: 'p1', planDate: '2026-07-03' }];
    expect(buildCloseDaySteps({ ...base, pendingPlans: plans, hour: 10 })).toHaveLength(0);
    const evening = buildCloseDaySteps({ ...base, pendingPlans: plans, hour: 18 });
    expect(evening[0]?.key).toBe('production');
    expect(evening[0]?.href).toBe('/production/p1');
    expect(evening[0]?.consequence).toContain('magazzino');
  });

  it('di MATTINA la card non esiste MAI, qualunque pendenza ci sia (niente rumore: ci pensano attention list e "Da fare adesso")', () => {
    const steps = buildCloseDaySteps({
      ...base,
      hour: 8,
      pendingPlans: [{ id: 'p0', planDate: '2026-07-02' }],
      leftoverProducts: [{ name: 'X', remaining: 2 }],
      openReceipts: [{ id: 'r1', supplierName: 'Molino' }],
      posFailed: 3,
    });
    expect(steps).toHaveLength(0);
  });

  it('invenduto solo di sera, con conteggio pezzi', () => {
    const left = [{ name: 'Cannoncini', remaining: 3 }, { name: 'Sacher', remaining: 1 }];
    expect(buildCloseDaySteps({ ...base, leftoverProducts: left, hour: 12 })).toHaveLength(0);
    const steps = buildCloseDaySteps({ ...base, leftoverProducts: left });
    expect(steps[0]?.key).toBe('waste');
    expect(steps[0]?.title).toContain('4 pezzi');
  });

  it('ordine dei passi: produzione → invenduto → ricevimenti → consegne marketplace → POS', () => {
    const steps = buildCloseDaySteps({
      ...base,
      pendingPlans: [{ id: 'p1', planDate: '2026-07-03' }],
      leftoverProducts: [{ name: 'X', remaining: 2 }],
      openReceipts: [{ id: 'r1', supplierName: 'Molino' }],
      deliveredMarketplaceOrders: [{ id: 'm1', supplierName: 'Grossista' }],
      posFailed: 1,
    });
    expect(steps.map((s) => s.key)).toEqual(['production', 'waste', 'receipts', 'marketplace', 'pos']);
  });

  it('consegna marketplace non registrata: 1 sola → link diretto al dettaglio', () => {
    const one = buildCloseDaySteps({
      ...base,
      deliveredMarketplaceOrders: [{ id: 'm1', supplierName: 'Grossista' }],
    });
    expect(one[0]?.key).toBe('marketplace');
    expect(one[0]?.href).toBe('/marketplace/orders/m1');
    expect(one[0]?.title).toContain('Grossista');
    expect(one[0]?.consequence).toContain('magazzino');

    const many = buildCloseDaySteps({
      ...base,
      deliveredMarketplaceOrders: [
        { id: 'm1', supplierName: 'A' },
        { id: 'm2', supplierName: 'B' },
      ],
    });
    expect(many[0]?.href).toBe('/marketplace/orders');
    expect(many[0]?.count).toBe(2);
  });

  it('POS: i falliti hanno priorità sui non collegati (mai entrambi)', () => {
    const steps = buildCloseDaySteps({ ...base, posFailed: 2, posUnmapped: 5 });
    expect(steps).toHaveLength(1);
    expect(steps[0].href).toBe('/sales/inbox?tab=failed');
    const only = buildCloseDaySteps({ ...base, posUnmapped: 5 });
    expect(only[0].href).toBe('/sales/pos#mappatura');
  });
});
