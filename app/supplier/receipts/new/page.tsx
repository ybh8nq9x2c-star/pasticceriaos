import type { Metadata } from 'next';
import { ReceiptNewView } from '@/components/receipts/ReceiptViews';

export const metadata: Metadata = { title: 'Nuovo ricevimento' };
export const dynamic = 'force-dynamic';

export default async function SupplierNewReceiptPage(
  props: {
    searchParams: Promise<{ order?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  return <ReceiptNewView mode="supplier" preselectedOrderId={searchParams.order} />;
}
