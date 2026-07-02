// =============================================================================
// POST /api/pos/dry-run — normalizza un payload provider SENZA scritture:
// mostra come verrebbe interpretato (righe, mapping, non collegati).
// Utile per collaudare il setup prima di attivare il webhook live.
// =============================================================================

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getErrorMessage } from '@/lib/errors';
import { dryRunPosPayload } from '@/modules/pos/service';

const bodySchema = z.object({
  provider: z.string().trim().min(1).default('mipos'),
  payload: z.unknown(),
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());
    const result = await dryRunPosPayload(body.provider, body.payload);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: getErrorMessage(err) }, { status: 400 });
  }
}
