// =============================================================================
// POST /api/pos/test-connection — checklist di attivazione POS per l'org della
// sessione. Route sottile: auth+validazione nel service, qui solo I/O.
// =============================================================================

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getErrorMessage } from '@/lib/errors';
import { getPosIntegrationStatus } from '@/modules/pos/service';

const bodySchema = z.object({ provider: z.string().trim().min(1).default('mipos') });

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json().catch(() => ({})));
    const status = await getPosIntegrationStatus(body.provider);
    return NextResponse.json({ ok: true, status });
  } catch (err) {
    return NextResponse.json({ ok: false, error: getErrorMessage(err) }, { status: 400 });
  }
}
