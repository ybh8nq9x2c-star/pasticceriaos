// =============================================================================
// app/api/production/requirements/route.ts
// Fabbisogno LIVE per un piano NON salvato (Task 1). Il form produzione lo chiama
// (debounced) a ogni modifica di righe/quantità → nessuno step "calcola" separato.
// =============================================================================

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { computePlanRequirements } from '@/modules/production/service';

const bodySchema = z.object({
  items: z
    .array(z.object({ recipeId: z.string().uuid(), batchCount: z.coerce.number().positive() }))
    .max(200)
    .default([]),
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());
    const requirements = await computePlanRequirements(body.items);
    return NextResponse.json({ requirements });
  } catch {
    // Sessione assente / payload non valido → lista vuota (la UI degrada al solo piano).
    return NextResponse.json({ requirements: [] }, { status: 200 });
  }
}
