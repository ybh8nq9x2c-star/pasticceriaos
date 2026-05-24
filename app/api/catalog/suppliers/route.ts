// =============================================================================
// app/api/catalog/suppliers/route.ts
// API JSON lista fornitori attivi (per dropdown lato client).
// =============================================================================

import { NextResponse } from 'next/server';
import { listSuppliers } from '@/modules/catalog/service';

export async function GET() {
  try {
    const suppliers = await listSuppliers();
    return NextResponse.json(
      suppliers.map((s) => ({ id: s.id, name: s.name, email: s.email })),
    );
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
