// =============================================================================
// app/api/inventory/level/[ingredientId]/route.ts
// Giacenza corrente di un ingrediente + flag permesso rettifica.
// Usata dal pannello "Rettifica stock" nella scheda ingrediente (client).
// =============================================================================

import { NextResponse } from 'next/server';
import { requireSession } from '@/modules/identity/service';
import { getLevelForIngredient } from '@/modules/inventory/service';

export async function GET(
  _req: Request,
  { params }: { params: { ingredientId: string } },
) {
  try {
    const session = await requireSession();
    const level = await getLevelForIngredient(params.ingredientId);
    return NextResponse.json({
      currentQuantity: level?.currentQuantity ?? 0,
      unit: level?.unit ?? null,
      // viewer = sola lettura; rettifica riservata a owner/baker.
      canAdjust: session.role !== 'viewer',
    });
  } catch {
    return NextResponse.json(null, { status: 404 });
  }
}
