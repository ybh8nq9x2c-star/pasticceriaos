// =============================================================================
// org-scope.test.ts — il guardrail service-role (P0-G) deve rendere IMPOSSIBILE
// una query senza organization_id: filtro sempre applicato, insert sempre
// iniettata, org vuota = throw immediato.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { orgScoped } from '../supabase/org-scope';

interface Recorded {
  op: string;
  table: string;
  payload?: unknown;
  eqs: [string, unknown][];
}

function fakeClient() {
  const calls: Recorded[] = [];
  const mkChain = (rec: Recorded) => {
    const self: Record<string, unknown> = {};
    self.eq = (col: string, v: unknown) => {
      rec.eqs.push([col, v]);
      return self;
    };
    self.in = () => self;
    self.order = () => self;
    self.limit = () => self;
    return self;
  };
  const client = {
    from: (table: string) => ({
      select: (_cols: string, _opts?: unknown) => {
        const rec: Recorded = { op: 'select', table, eqs: [] };
        calls.push(rec);
        return mkChain(rec);
      },
      update: (payload: unknown) => {
        const rec: Recorded = { op: 'update', table, payload, eqs: [] };
        calls.push(rec);
        return mkChain(rec);
      },
      insert: (payload: unknown) => {
        const rec: Recorded = { op: 'insert', table, payload, eqs: [] };
        calls.push(rec);
        return mkChain(rec);
      },
      upsert: (payload: unknown, _opts?: unknown) => {
        const rec: Recorded = { op: 'upsert', table, payload, eqs: [] };
        calls.push(rec);
        return mkChain(rec);
      },
    }),
  };
  return { calls, client: client as never };
}

const ORG = 'org-123';

describe('orgScoped', () => {
  it('select e update filtrano SEMPRE per organization_id', () => {
    const { calls, client } = fakeClient();
    const org = orgScoped(client, ORG);
    org.select('pos_events', 'id');
    org.update('pos_events', { status: 'failed' });
    expect(calls[0].eqs).toContainEqual(['organization_id', ORG]);
    expect(calls[1].eqs).toContainEqual(['organization_id', ORG]);
  });

  it('insert/upsert INIETTANO organization_id sovrascrivendo valori estranei', () => {
    const { calls, client } = fakeClient();
    const org = orgScoped(client, ORG);
    org.insert('pos_events', { foo: 1, organization_id: 'ALTRA-ORG' });
    org.upsert('product_mappings', { bar: 2 });
    expect((calls[0].payload as Record<string, unknown>).organization_id).toBe(ORG);
    expect((calls[1].payload as Record<string, unknown>).organization_id).toBe(ORG);
  });

  it('org mancante → throw immediato (mai query service-role senza org)', () => {
    const { client } = fakeClient();
    expect(() => orgScoped(client, '')).toThrow(/organization_id/);
  });
});
