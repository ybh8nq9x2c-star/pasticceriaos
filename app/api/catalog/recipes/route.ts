// =============================================================================
// app/api/catalog/recipes/route.ts
// API JSON lista ricette attive (per dropdown lato client).
// =============================================================================

import { NextResponse } from 'next/server';
import { listRecipes } from '@/modules/catalog/service';

export async function GET() {
  try {
    const recipes = await listRecipes();
    return NextResponse.json(
      recipes.map((r) => ({
        id:           r.id,
        name:         r.name,
        emoji:        r.emoji,
        basePortions: r.basePortions,
      })),
    );
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
