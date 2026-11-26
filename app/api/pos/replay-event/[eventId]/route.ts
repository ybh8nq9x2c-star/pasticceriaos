// =============================================================================
// POST /api/pos/replay-event/[eventId] — rilancia un evento failed/unmapped
// dopo la correzione (mapping o errore transitorio). Sessione + RLS nel service.
// =============================================================================

import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import { replayPosEvent } from '@/modules/pos/service';

export async function POST(_req: Request, props: { params: Promise<{ eventId: string }> }) {
  const params = await props.params;
  try {
    const result = await replayPosEvent(params.eventId);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: getErrorMessage(err) }, { status: 400 });
  }
}
