import { getOrder } from '@/modules/marketplace/service';
import { OrderDetail } from '@/components/marketplace/OrderDetail';
import { SupplierDocumentUpload } from '@/components/marketplace/SupplierDocumentUpload';

export default async function SupplierOrderPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const order = await getOrder(params.id);

  // DDT/fattura allegabili dagli stati operativi in poi.
  const canAttach = !['draft', 'cancelled'].includes(order.status);

  return (
    <OrderDetail
      order={order}
      side="supplier"
      footer={canAttach ? <SupplierDocumentUpload orderId={order.id} /> : undefined}
    />
  );
}
