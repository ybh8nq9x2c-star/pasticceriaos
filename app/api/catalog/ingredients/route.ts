// =============================================================================
// app/api/catalog/ingredients/route.ts
// API route JSON per caricare ingredienti lato client (es. form ricette).
// =============================================================================

import { NextResponse } from 'next/server';
import { listIngredients } from '@/modules/catalog/service';

export async function GET() {
  try {
    const ingredients = await listIngredients();
    return NextResponse.json(
      ingredients.map((i) => ({ id: i.id, name: i.name, unit: i.unit })),
    );
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
