// =============================================================================
// app/api/webhooks/[provider]/route.ts — webhook POS (server-to-server).
//
// AUTENTICAZIONE = FIRMA HMAC, non la sessione. È un'eccezione dichiarata al gate
// di login: vedi lib/server-routes.ts (unico elenco, usato da middleware.ts) e
// docs/adr/003-pos-webhook-binding.md.
//
// Flusso (062):
//   1. provider noto (404 altrimenti) · body grezzo · JSON valido (400)
//   2. instradamento: store/merchant dal payload NON verificato → config attiva
//      (sconosciuta → 401 identico alla firma errata: niente enumerazione)
//   3. chiave della CONFIG (segreto derivato per config, o legacy globale per le
//      config pre-062) → verifica HMAC sul body grezzo (401)
//   4. parse completo (400) · ingest con accettazione DUREVOLE
//
// Semantica delle risposte (la cassa ritenta solo su 5xx):
//   200  evento scritto in pos_events (elaborato, duplicato già elaborato, o
//        fallito per errore PERMANENTE — visibile e rielaborabile dall'inbox)
//   4xx  richiesta da non ritentare (firma, formato, provider)
//   503  errore TRANSITORIO o server non configurato: ritentare. Il reinvio di
//        un evento non terminale viene riprocessato, non scartato.
// =============================================================================

import { NextResponse } from 'next/server';
import { createAdminClient, isAdminClientConfigured } from '@/lib/supabase/admin';
import { getPosAdapter } from '@/modules/pos/adapter';
import { ingestPosEvent } from '@/modules/pos/ingest';
import * as posRepo from '@/modules/pos/repository';
import { webhookKeyFor } from '@/modules/pos/secret';

function readSignature(req: Request, provider: string): string | null {
  return (
    req.headers.get(`x-${provider}-signature`) ??
    req.headers.get('x-signature') ??
    req.headers.get('x-webhook-signature')
  );
}

const unauthorized = () => NextResponse.json({ error: 'invalid signature' }, { status: 401 });
const retryLater = (error: string) => NextResponse.json({ ok: false, error }, { status: 503 });

export async function POST(req: Request, { params }: { params: { provider: string } }) {
  const provider = params.provider.toLowerCase();
  const adapter = getPosAdapter(provider);
  if (!adapter) {
    return NextResponse.json({ error: 'unknown provider' }, { status: 404 });
  }

  const rawBody = await req.text();
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  if (!isAdminClientConfigured()) {
    console.error('[pos-webhook] service-role non configurato', { provider });
    return retryLater('not_configured');
  }
  const admin = createAdminClient();

  // 2) config dalla chiave di instradamento (nessun effetto prima della firma)
  const routing = adapter.peekRouting(body);
  let binding: Awaited<ReturnType<typeof posRepo.resolvePosConfig>>;
  try {
    binding = await posRepo.resolvePosConfig(admin, provider, routing.storeId, routing.merchantCode);
  } catch (err) {
    console.error('[pos-webhook] risoluzione config fallita', { provider, error: (err as Error).message });
    return retryLater('config_lookup_failed');
  }
  if (!binding) {
    console.warn('[pos-webhook] nessuna config attiva per lo store', { provider });
    return unauthorized();
  }

  // 3) chiave di QUESTA config + verifica
  const key = webhookKeyFor(binding);
  if (!key) {
    console.error('[pos-webhook] chiave webhook non configurata sul server', {
      provider, scheme: binding.secretScheme,
    });
    return retryLater('not_configured');
  }
  if (!adapter.verifySignature(rawBody, readSignature(req, provider), key)) {
    return unauthorized();
  }
  if (!binding.verifiedAt) {
    // prova di possesso: prima ricevuta firmata col segreto di questa config
    await posRepo.markConfigVerified(admin, binding.configId).catch((err: Error) =>
      console.error('[pos-webhook] verified_at non aggiornato', { error: err.message }),
    );
  }

  // 4) parse completo + ingest
  let incoming;
  try {
    incoming = adapter.parsePayload(body);
  } catch (err) {
    console.error('[pos-webhook] payload non valido', { provider, error: (err as Error).message });
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
  }

  try {
    const result = await ingestPosEvent(binding.organizationId, incoming, admin);
    if (result.status === 'retry') {
      console.error('[pos-webhook] errore transitorio, la cassa ritenterà', {
        provider, receipt: incoming.external_receipt_id,
      });
      return retryLater('transient_error');
    }
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (err) {
    // l'evento NON è stato scritto (accettazione non durevole): far ritentare
    console.error('[pos-webhook] accettazione non durevole', { provider, error: (err as Error).message });
    return retryLater('not_persisted');
  }
}
