import type { Metadata } from 'next';
import { ReceiptNewView } from '@/components/receipts/ReceiptViews';

export const metadata: Metadata = { title: 'Nuovo ricevimento' };
export const dynamic = 'force-dynamic';

export default function SupplierNewReceiptPage({
  searchParams,
}: {
  searchParams: { order?: string };
}) {
  return <ReceiptNewView mode="supplier" preselectedOrderId={searchParams.order} />;
}
