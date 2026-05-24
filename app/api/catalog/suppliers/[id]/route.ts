// =============================================================================
// app/api/catalog/suppliers/[id]/route.ts
// =============================================================================

import { NextResponse } from 'next/server';
import { getSupplier } from '@/modules/catalog/service';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supplier = await getSupplier(params.id);
    return NextResponse.json(supplier);
  } catch {
    return NextResponse.json(null, { status: 404 });
  }
}
