// =============================================================================
// app/(main)/documents/new/page.tsx
// Server Component: registrazione documento con prefill righe da un ordine
// reale (?order=<id>) — il caso d'uso tipico: arriva il DDT/fattura di un PO.
// =============================================================================

import type { Metadata } from 'next';
import { listSuppliers } from '@/modules/catalog/service';
import { listOrders, getOrder } from '@/modules/ordering/service';
import { NewDocumentForm, type DocLinePrefill } from './NewDocumentForm';

export const metadata: Metadata = { title: 'Registra documento' };

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: { order?: string };
}) {
  const [suppliers, orders] = await Promise.all([listSuppliers(), listOrders()]);

  // Ordini agganciabili: tutto lo storico recente non-draft (DDT/fatture
  // arrivano tipicamente per ordini inviati/confermati/ricevuti).
  const attachableOrders = orders
    .filter((o) => o.status !== 'draft' && o.status !== 'cancelled')
    .slice(0, 50)
    .map((o) => ({
      id: o.id,
      label: `${o.supplierName} · ${o.orderDate} · ${o.lineItemsCount} righe`,
      supplierId: o.supplierId,
    }));

  let prefillLines: DocLinePrefill[] | undefined;
  let prefillOrderId: string | undefined;
  let prefillSupplierId: string | undefined;

  if (searchParams.order) {
    try {
      const order = await getOrder(searchParams.order);
      prefillOrderId = order.id;
      prefillSupplierId = order.supplierId;
      prefillLines = order.lineItems.map((li) => ({
        orderLineItemId: li.id,
        ingredientProductId: li.ingredientProductId,
        description: li.ingredientName,
        quantity: String(li.quantity),
        unit: li.unitSnapshot,
        unitPrice: li.unitPriceSnapshot !== null ? String(li.unitPriceSnapshot) : '',
      }));
    } catch {
      // ordine non trovato/non proprio: si parte dal form vuoto
    }
  }

  return (
    <NewDocumentForm
      suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
      orders={attachableOrders}
      prefillOrderId={prefillOrderId}
      prefillSupplierId={prefillSupplierId}
      prefillLines={prefillLines}
    />
  );
}
