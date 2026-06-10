// =============================================================================
// app/api/customers/orders/route.ts
// Ordini clienti attivi per data ritiro (alimenta il form piano produzione).
// =============================================================================

import { NextResponse } from 'next/server';
import { getCustomerOrdersForDate } from '@/modules/customers/service';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Parametro date non valido' }, { status: 400 });
  }
  try {
    const orders = await getCustomerOrdersForDate(date);
    return NextResponse.json(
      orders.map((o) => ({
        id: o.id,
        customerName: o.customerName,
        pickupTime: o.pickupTime,
        items: o.items.map((i) => ({
          recipeId: i.recipeId,
          recipeName: i.recipeName,
          description: i.description,
          quantity: i.quantity,
        })),
      })),
    );
  } catch {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }
}
