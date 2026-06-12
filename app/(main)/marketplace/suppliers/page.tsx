import Link from 'next/link';
import { listConnectedSuppliers } from '@/modules/marketplace/service';
import { ConnectSupplierForm } from '@/components/marketplace/ConnectSupplierForm';

export default async function MarketplaceSuppliersPage() {
  const suppliers = await listConnectedSuppliers();
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold mb-1">Fornitori collegati</h1>
        <p className="text-sm text-ink-muted">Grossisti a cui puoi inviare ordini.</p>
      </div>

      <ConnectSupplierForm />

      <div className="bg-surface-2 rounded-2xl border border-border divide-y divide-divider">
        {suppliers.length === 0 && <p className="p-6 text-center text-ink-muted">Nessun fornitore collegato.</p>}
        {suppliers.map((s) => (
          <div key={s.connectionId} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4">
            <div className="min-w-0">
              <p className="font-medium truncate">{s.supplierName}</p>
              <p className="text-xs text-ink-muted">Collegato il {new Date(s.connectedAt).toLocaleDateString('it-IT')}</p>
            </div>
            <Link href={`/marketplace/orders/new?connection=${s.connectionId}`}
              className="shrink-0 px-3 py-2 rounded-lg bg-primary text-primary-fg text-xs font-semibold hover:bg-primary-hover min-h-[40px] inline-flex items-center">
              + Ordine
            </Link>
          </div>
        ))}
      </div>

      <Link href="/marketplace/orders" className="inline-block text-sm text-primary font-semibold hover:underline">
        Vedi i tuoi ordini →
      </Link>
    </div>
  );
}
