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
import { deriveWebhookSecret, type PosConfigBinding } from '@/modules/pos/secret';

// 062: segreto PER CONFIG, derivato dal master. La config A non può firmare per B.
const MASTER = 'm'.repeat(40);
const LEGACY = 'legacy-global-secret';
const cfgA: PosConfigBinding = {
  configId: 'CFG-A', organizationId: 'ORG-A', provider: 'mipos',
  secretScheme: 'derived', secretVersion: 1, verifiedAt: null,
};
const keyA = deriveWebhookSecret(MASTER, 'mipos', 'CFG-A', 1);
const keyB = deriveWebhookSecret(MASTER, 'mipos', 'CFG-B', 1);

const payload = {
  type: 'receipt.created',
  receipt: { id: 'RCP-1', store_id: 'S1', total_cents: 480, items: [{ sku: 'PLU-1', name: 'Cornetto', quantity: 2, unit_price_cents: 120 }] },
};
const body = JSON.stringify(payload);
const sign = (b: string, key: string) => crypto.createHmac('sha256', key).update(b, 'utf8').digest('hex');

function makeReq(b: string, signature: string | null) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (signature) headers.set('x-mipos-signature', signature);
  return new Request('https://x/api/webhooks/mipos', { method: 'POST', body: b, headers });
}
const call = (b: string, sig: string | null) => POST(makeReq(b, sig), { params: { provider: 'mipos' } });

beforeEach(() => {
  vi.resetAllMocks();
  process.env.POS_WEBHOOK_MASTER_SECRET = MASTER;
  process.env.MIPOS_WEBHOOK_SECRET = LEGACY;
  vi.mocked(posRepo.markConfigVerified).mockResolvedValue(undefined);
});

describe('POST /api/webhooks/[provider] — binding per config (062)', () => {
  it('firma valida con la chiave della SUA config → 200, ingest per l\'org della config, verifica registrata', async () => {
    vi.mocked(posRepo.resolvePosConfig).mockResolvedValue(cfgA);
    vi.mocked(ingest.ingestPosEvent).mockResolvedValue({ status: 'created', saleId: 'SALE-1' });
    const res = await call(body, sign(body, keyA));
    expect(res.status).toBe(200);
    expect(ingest.ingestPosEvent).toHaveBeenCalledWith('ORG-A', expect.anything(), expect.anything());
    expect(posRepo.markConfigVerified).toHaveBeenCalledWith(expect.anything(), 'CFG-A');
  });

  it('firma con la chiave di UN\'ALTRA config (stesso master) → 401, nessuna scrittura', async () => {
    vi.mocked(posRepo.resolvePosConfig).mockResolvedValue(cfgA);
    const res = await call(body, sign(body, keyB));
    expect(res.status).toBe(401);
    expect(ingest.ingestPosEvent).not.toHaveBeenCalled();
    expect(posRepo.markConfigVerified).not.toHaveBeenCalled();
  });

  it('il segreto GLOBALE non vale per una config derived → 401', async () => {
    vi.mocked(posRepo.resolvePosConfig).mockResolvedValue(cfgA);
    const res = await call(body, sign(body, LEGACY));
    expect(res.status).toBe(401);
  });

  it('config legacy_global (pre-062) continua a funzionare col segreto globale', async () => {
    vi.mocked(posRepo.resolvePosConfig).mockResolvedValue({ ...cfgA, secretScheme: 'legacy_global' });
    vi.mocked(ingest.ingestPosEvent).mockResolvedValue({ status: 'created', saleId: 'SALE-1' });
    const res = await call(body, sign(body, LEGACY));
    expect(res.status).toBe(200);
  });

  it('store sconosciuto → 401 identico alla firma errata (niente enumerazione), nessun ingest', async () => {
    vi.mocked(posRepo.resolvePosConfig).mockResolvedValue(null);
    const res = await call(body, sign(body, keyA));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid signature' });
    expect(ingest.ingestPosEvent).not.toHaveBeenCalled();
  });

  it('master non configurato → 503 (la cassa ritenta), nessun ingest', async () => {
    delete process.env.POS_WEBHOOK_MASTER_SECRET;
    vi.mocked(posRepo.resolvePosConfig).mockResolvedValue(cfgA);
    const res = await call(body, sign(body, keyA));
    expect(res.status).toBe(503);
    expect(ingest.ingestPosEvent).not.toHaveBeenCalled();
  });
});

describe('POST /api/webhooks/[provider] — semantica di retry (062)', () => {
  beforeEach(() => vi.mocked(posRepo.resolvePosConfig).mockResolvedValue(cfgA));

  it('duplicato già elaborato → 200 duplicate', async () => {
    vi.mocked(ingest.ingestPosEvent).mockResolvedValue({ status: 'duplicate' });
    const res = await call(body, sign(body, keyA));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('duplicate');
  });

  it('errore transitorio dopo la scrittura dell\'evento → 503 (la cassa ritenta, il reinvio riprende)', async () => {
    vi.mocked(ingest.ingestPosEvent).mockResolvedValue({ status: 'retry' });
    const res = await call(body, sign(body, keyA));
    expect(res.status).toBe(503);
  });

  it('evento NON scritto (accettazione non durevole) → 503', async () => {
    vi.mocked(ingest.ingestPosEvent).mockRejectedValue(new Error('db down'));
    const res = await call(body, sign(body, keyA));
    expect(res.status).toBe(503);
  });

  it('errore permanente registrato (es. storno senza vendita) → 200 failed, visibile in inbox', async () => {
    vi.mocked(ingest.ingestPosEvent).mockResolvedValue({ status: 'failed' });
    const res = await call(body, sign(body, keyA));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('failed');
  });

  it('JSON non valido → 400, firma non verificata, nessuna query', async () => {
    const res = await call('{not json', 'x');
    expect(res.status).toBe(400);
    expect(posRepo.resolvePosConfig).not.toHaveBeenCalled();
  });

  it('provider sconosciuto → 404', async () => {
    const res = await POST(makeReq('{}', null), { params: { provider: 'zzz' } });
    expect(res.status).toBe(404);
  });
});
