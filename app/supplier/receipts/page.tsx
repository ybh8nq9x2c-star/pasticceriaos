import type { Metadata } from 'next';
import { ReceiptsIndexView } from '@/components/receipts/ReceiptViews';

export const metadata: Metadata = { title: 'Ricevimenti' };
export const dynamic = 'force-dynamic';

export default async function SupplierReceiptsPage(
  props: {
    searchParams: Promise<{ tab?: string; q?: string; supplier?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  return <ReceiptsIndexView mode="supplier" searchParams={searchParams} />;
}
