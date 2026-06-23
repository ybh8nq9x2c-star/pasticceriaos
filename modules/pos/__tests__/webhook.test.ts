import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

vi.mock('@/lib/supabase/admin', () => ({
  isAdminClientConfigured: () => true,
  createAdminClient: () => ({}) as never,
}));
vi.mock('@/modules/pos/ingest');
vi.mock('@/modules/pos/repository');

import { POST } from '@/app/api/webhooks/[provider]/route';
import * as ingest from '@/modules/pos/ingest';
import * as posRepo from '@/modules/pos/repository';

const SECRET = 'wh-secret';
const payload = {
  type: 'receipt.created',
  receipt: { id: 'RCP-1', store_id: 'S1', total_cents: 480, items: [{ sku: 'PLU-1', name: 'Cornetto', quantity: 2, unit_price_cents: 120 }] },
};
const body = JSON.stringify(payload);
const sig = crypto.createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');

function makeReq(b: string, signature: string | null) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (signature) headers.set('x-mipos-signature', signature);
  return new Request('https://x/api/webhooks/mipos', { method: 'POST', body: b, headers });
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.MIPOS_WEBHOOK_SECRET = SECRET;
});

describe('POST /api/webhooks/[provider]', () => {
  it('firma non valida → 401, nessuna scrittura DB', async () => {
    const res = await POST(makeReq(body, 'deadbeef'), { params: { provider: 'mipos' } });
    expect(res.status).toBe(401);
    expect(posRepo.resolveOrgId).not.toHaveBeenCalled();
    expect(ingest.ingestPosEvent).not.toHaveBeenCalled();
  });

  it('sale valida → 200, pos_event + sale (ingest chiamato una volta)', async () => {
    vi.mocked(posRepo.resolveOrgId).mockResolvedValue('ORG-1');
    vi.mocked(ingest.ingestPosEvent).mockResolvedValue({ status: 'created', saleId: 'SALE-1' });
    const res = await POST(makeReq(body, sig), { params: { provider: 'mipos' } });
    expect(res.status).toBe(200);
    expect(ingest.ingestPosEvent).toHaveBeenCalledTimes(1);
    expect((await res.json()).status).toBe('created');
  });

  it('retry stesso scontrino → 200 e duplicate (una sola vendita lato engine)', async () => {
    vi.mocked(posRepo.resolveOrgId).mockResolvedValue('ORG-1');
    vi.mocked(ingest.ingestPosEvent)
      .mockResolvedValueOnce({ status: 'created', saleId: 'SALE-1' })
      .mockResolvedValueOnce({ status: 'duplicate' });
    const r1 = await POST(makeReq(body, sig), { params: { provider: 'mipos' } });
    const r2 = await POST(makeReq(body, sig), { params: { provider: 'mipos' } });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect((await r2.json()).status).toBe('duplicate');
  });

  it('org non risolta → 200 senza ingest', async () => {
    vi.mocked(posRepo.resolveOrgId).mockResolvedValue(null);
    const res = await POST(makeReq(body, sig), { params: { provider: 'mipos' } });
    expect(res.status).toBe(200);
    expect(ingest.ingestPosEvent).not.toHaveBeenCalled();
  });

  it('provider sconosciuto → 404', async () => {
    const res = await POST(makeReq('{}', null), { params: { provider: 'zzz' } });
    expect(res.status).toBe(404);
  });
});
