// =============================================================================
// GET /api/pos/reconciliation?days=14 — confronto giornaliero POS vs BakeryOS
// (eventi/importi ricevuti vs vendite registrate). Sola lettura, RLS.
// Cron-abile: la stessa risposta alimenta la UI e un eventuale check periodico.
// =============================================================================

import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import { getPosReconciliation } from '@/modules/pos/service';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days') ?? 14) || 14));
    const rows = await getPosReconciliation(days);
    return NextResponse.json({
      ok: true,
      days,
      rows,
      mismatches: rows.filter((r) => r.mismatch).length,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: getErrorMessage(err) }, { status: 400 });
  }
}
