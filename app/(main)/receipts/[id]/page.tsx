import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReceiptDetailView } from '@/components/receipts/ReceiptViews';

export const metadata: Metadata = { title: 'Ricevimento' };
export const dynamic = 'force-dynamic';

export default async function BakeryReceiptDetailPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ imported?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  try {
    return (
      <ReceiptDetailView mode="bakery" id={params.id} importedSummary={searchParams.imported} />
    );
  } catch {
    notFound();
  }
}
