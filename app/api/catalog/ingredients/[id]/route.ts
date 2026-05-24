// =============================================================================
// app/api/catalog/ingredients/[id]/route.ts
// =============================================================================

import { NextResponse } from 'next/server';
import { getIngredient } from '@/modules/catalog/service';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ingredient = await getIngredient(params.id);
    return NextResponse.json(ingredient);
  } catch {
    return NextResponse.json(null, { status: 404 });
  }
}
