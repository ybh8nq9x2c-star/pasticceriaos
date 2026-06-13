import type { Metadata } from 'next';
import { ReceiptsIndexView } from '@/components/receipts/ReceiptViews';

export const metadata: Metadata = { title: 'Ricevimenti' };
export const dynamic = 'force-dynamic';

export default function BakeryReceiptsPage({
  searchParams,
}: {
  searchParams: { tab?: string; q?: string; supplier?: string };
}) {
  return <ReceiptsIndexView mode="bakery" searchParams={searchParams} />;
}
