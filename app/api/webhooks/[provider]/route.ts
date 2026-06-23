// =============================================================================
// app/api/webhooks/[provider]/route.ts
// Webhook POS (es. POST /api/webhooks/mipos). Verifica la FIRMA sul corpo grezzo
// PRIMA di qualunque scrittura, poi alimenta il motore vendite tramite il bordo
// POS (client service-role). Risponde SEMPRE 200 tranne firma non valida (401):
// i provider POS ritentano sui non-2xx, quindi non vogliamo loop su errori interni.
// =============================================================================

import { NextResponse } from 'next/server';
import { createAdminClient, isAdminClientConfigured } from '@/lib/supabase/admin';
import { getPosAdapter } from '@/modules/pos/adapter';
import { ingestPosEvent } from '@/modules/pos/ingest';
import * as posRepo from '@/modules/pos/repository';

// I provider firmano in header diversi; proviamo lo specifico poi i generici.
function readSignature(req: Request, provider: string): string | null {
  return (
    req.headers.get(`x-${provider}-signature`) ??
    req.headers.get('x-signature') ??
    req.headers.get('x-webhook-signature')
  );
}

export async function POST(req: Request, { params }: { params: { provider: string } }) {
  const provider = params.provider.toLowerCase();
  const adapter = getPosAdapter(provider);
  if (!adapter) {
    return NextResponse.json({ error: 'unknown provider' }, { status: 404 });
  }

  // Corpo GREZZO (letto UNA sola volta): necessario per l'HMAC.
  const rawBody = await req.text();

  // FIRMA prima di toccare il DB. Invalida → 401, nessuna scrittura.
  if (!adapter.verifySignature(rawBody, readSignature(req, provider))) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  // Da qui: rispondi 200 anche su errore (niente retry-loop), ma logga strutturato.
  try {
    if (!isAdminClientConfigured()) {
      console.error('[pos-webhook] service-role non configurato', { provider });
      return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 200 });
    }
    const admin = createAdminClient();

    let incoming;
    try {
      incoming = adapter.parsePayload(JSON.parse(rawBody));
    } catch (err) {
      console.error('[pos-webhook] payload non valido', { provider, error: (err as Error).message });
      return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 200 });
    }

    const orgId = await posRepo.resolveOrgId(admin, provider, incoming.store_id, incoming.merchant_code);
    if (!orgId) {
      console.error('[pos-webhook] organizzazione non risolta', {
        provider,
        store_id: incoming.store_id ?? null,
        merchant_code: incoming.merchant_code ?? null,
      });
      return NextResponse.json({ ok: false, error: 'org_not_resolved' }, { status: 200 });
    }

    const result = await ingestPosEvent(orgId, incoming, admin);
    if (result.status === 'error') {
      console.error('[pos-webhook] ingest fallito', { provider, receipt: incoming.external_receipt_id });
    }
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (err) {
    console.error('[pos-webhook] errore non gestito', { provider, error: (err as Error).message });
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
