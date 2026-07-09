import { describe, it, expect } from 'vitest';
import {
  resolveSupplierChannel,
  connectionMap,
  withSupplierChannel,
  orderChannel,
  CHANNEL_COPY,
  type ConnectionRef,
} from '../supplier-channel';

const conns: ConnectionRef[] = [
  { supplierOrgId: 'org-A', connectionId: 'conn-A' },
  { supplierOrgId: 'org-B', connectionId: 'conn-B' },
];

describe('resolveSupplierChannel', () => {
  const map = connectionMap(conns);

  it('org collegata con connessione attiva → bakeryos + connectionId', () => {
    expect(resolveSupplierChannel({ supplierOrgId: 'org-A' }, map)).toEqual({
      channel: 'bakeryos',
      connectionId: 'conn-A',
    });
  });

  it('nessuna org collegata (solo-email) → email', () => {
    expect(resolveSupplierChannel({ supplierOrgId: null }, map)).toEqual({
      channel: 'email',
      connectionId: null,
    });
  });

  it('org collegata ma NESSUNA connessione attiva (revocata) → email, mai falso positivo', () => {
    // org-C non è tra le connessioni attive → onestamente email.
    expect(resolveSupplierChannel({ supplierOrgId: 'org-C' }, map)).toEqual({
      channel: 'email',
      connectionId: null,
    });
  });
});

describe('withSupplierChannel', () => {
  it('arricchisce ogni fornitore mantenendo i campi originali', () => {
    const suppliers = [
      { id: 's1', supplierOrgId: 'org-A', name: 'Molino' },
      { id: 's2', supplierOrgId: null, name: 'Fruttivendolo' },
    ];
    const out = withSupplierChannel(suppliers, conns);
    expect(out[0]).toMatchObject({ id: 's1', name: 'Molino', channel: 'bakeryos', connectionId: 'conn-A' });
    expect(out[1]).toMatchObject({ id: 's2', name: 'Fruttivendolo', channel: 'email', connectionId: null });
  });

  it('lista connessioni vuota → tutti email', () => {
    const out = withSupplierChannel([{ id: 's1', supplierOrgId: 'org-A' }], []);
    expect(out[0].channel).toBe('email');
  });
});

describe('orderChannel', () => {
  it('PO specchio di ordine marketplace → bakeryos', () => {
    expect(orderChannel('mo-123')).toBe('bakeryos');
  });
  it('PO standard (nessun marketplace_order_id) → email', () => {
    expect(orderChannel(null)).toBe('email');
    expect(orderChannel(undefined)).toBe('email');
  });
});

describe('CHANNEL_COPY', () => {
  it('copre entrambi i canali con label/short/sub', () => {
    for (const ch of ['bakeryos', 'email'] as const) {
      expect(CHANNEL_COPY[ch].label.length).toBeGreaterThan(0);
      expect(CHANNEL_COPY[ch].short.length).toBeGreaterThan(0);
      expect(CHANNEL_COPY[ch].sub.length).toBeGreaterThan(0);
    }
    expect(CHANNEL_COPY.bakeryos.label).toContain('BakeryOS');
  });
});
