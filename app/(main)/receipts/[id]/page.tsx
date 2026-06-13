import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReceiptDetailView } from '@/components/receipts/ReceiptViews';

export const metadata: Metadata = { title: 'Ricevimento' };
export const dynamic = 'force-dynamic';

export default async function BakeryReceiptDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { imported?: string };
}) {
  try {
    return (
      <ReceiptDetailView mode="bakery" id={params.id} importedSummary={searchParams.imported} />
    );
  } catch {
    notFound();
  }
}
