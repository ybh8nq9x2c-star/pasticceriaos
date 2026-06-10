import { getOrder } from '@/modules/marketplace/service';
import { OrderDetail } from '@/components/marketplace/OrderDetail';

export default async function CustomerOrderPage({ params }: { params: { id: string } }) {
  const order = await getOrder(params.id);
  return <OrderDetail order={order} side="customer" />;
}
