import { getOrder, getLinkedPurchaseOrderId } from '@/modules/marketplace/service';
import { OrderDetail } from '@/components/marketplace/OrderDetail';
import { ReceiveIntoInventory } from '@/components/marketplace/ReceiveIntoInventory';

export default async function CustomerOrderPage({ params }: { params: { id: string } }) {
  const order = await getOrder(params.id);

  // CTA ricezione: solo quando il fornitore ha consegnato. Se già registrato,
  // mostra il link al purchase_order locale (idempotenza visibile in UI).
  const linkedPoId =
    order.status === 'delivered' ? await getLinkedPurchaseOrderId(order.id) : null;

  return (
    <OrderDetail
      order={order}
      side="customer"
      footer={
        order.status === 'delivered' ? (
          <ReceiveIntoInventory orderId={order.id} linkedPurchaseOrderId={linkedPoId} />
        ) : undefined
      }
    />
  );
}
