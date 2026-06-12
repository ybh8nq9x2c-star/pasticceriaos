import Link from 'next/link';
import { listConnectedSuppliers, listCatalogForConnection } from '@/modules/marketplace/service';
import { OrderComposer } from '@/components/marketplace/OrderComposer';

export default async function NewMarketplaceOrderPage({
  searchParams,
}: { searchParams: { connection?: string } }) {
  const { connection } = searchParams;
  const suppliers = await listConnectedSuppliers();

  // No supplier chosen yet → let the customer pick one.
  if (!connection) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold mb-4">Nuovo ordine</h1>
        <p className="text-sm text-ink-muted mb-4">Scegli un fornitore collegato:</p>
        <div className="bg-surface-2 rounded-2xl border border-border divide-y divide-divider">
          {suppliers.length === 0 && <p className="p-6 text-center text-ink-muted">Nessun fornitore collegato. Vai su <Link href="/marketplace/suppliers" className="text-primary underline">Fornitori</Link>.</p>}
          {suppliers.map((s) => (
            <Link key={s.connectionId} href={`/marketplace/orders/new?connection=${s.connectionId}`}
              className="flex items-center justify-between gap-2 px-4 sm:px-5 py-4 hover:bg-surface-offset min-h-[52px]"><span className="truncate">{s.supplierName}</span><span aria-hidden>→</span></Link>
          ))}
        </div>
      </div>
    );
  }

  const supplier = suppliers.find((s) => s.connectionId === connection);
  const catalog = await listCatalogForConnection(connection);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <Link href="/marketplace/suppliers" className="inline-flex items-center min-h-[40px] text-sm text-ink-muted hover:text-ink">← Fornitori</Link>
      <h1 className="text-2xl sm:text-3xl font-bold mt-1 mb-1">Nuovo ordine</h1>
      <p className="text-sm text-ink-muted mb-5 sm:mb-6">Fornitore: <strong>{supplier?.supplierName ?? '—'}</strong></p>
      <OrderComposer connectionId={connection} catalog={catalog} />
    </div>
  );
}
