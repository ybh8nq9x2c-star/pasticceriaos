// =============================================================================
// app/supplier/orders/page.tsx
// Ordini clienti del fornitore: coda attiva + storico, filtro per stato.
// Dati reali da marketplace_orders (RLS: solo ordini in cui sono il fornitore).
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { getSupplierOrderFacts } from '@/modules/reporting/service';
import { StatusBadge } from '@/components/marketplace/StatusBadge';
import type { MarketplaceOrderStatus } from '@/modules/marketplace/types';
import { formatCurrency } from '@/lib/utils';

export const metadata: Metadata = { title: 'Ordini clienti' };

const FILTERS: { key: string; label: string; statuses: MarketplaceOrderStatus[] }[] = [
  { key: 'tutti',      label: 'Tutti',        statuses: [] },
  { key: 'in_attesa',  label: 'In attesa',    statuses: ['submitted'] },
  { key: 'in_corso',   label: 'In lavorazione', statuses: ['accepted', 'in_preparation', 'shipped'] },
  { key: 'evasi',      label: 'Evasi',        statuses: ['delivered'] },
  { key: 'annullati',  label: 'Annullati',    statuses: ['cancelled'] },
];

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default async function SupplierOrdersPage({
  searchParams,
}: {
  searchParams: { stato?: string };
}) {
  const facts = await getSupplierOrderFacts();
  // I draft del cliente non sono ancora "ordini ricevuti".
  const orders = facts.filter((o) => o.status !== 'draft');

  const activeFilter = FILTERS.find((f) => f.key === searchParams.stato) ?? FILTERS[0];
  const filtered =
    activeFilter.statuses.length === 0
      ? orders
      : orders.filter((o) => activeFilter.statuses.includes(o.status));

  const countFor = (f: (typeof FILTERS)[number]) =>
    f.statuses.length === 0 ? orders.length : orders.filter((o) => f.statuses.includes(o.status)).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <h1 className="font-playfair text-2xl sm:text-3xl font-bold mb-1">Ordini clienti</h1>
      <p className="text-sm text-[#6B7280] mb-5">
        {orders.length} ordini ricevuti dai clienti collegati
      </p>

      {/* Filtri stato */}
      <div className="flex flex-wrap gap-2 mb-5">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === 'tutti' ? '/supplier/orders' : `/supplier/orders?stato=${f.key}`}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              activeFilter.key === f.key
                ? 'bg-[#14B8A6] text-white border-[#14B8A6]'
                : 'bg-white text-[#6B7280] border-[#E5DDD0] hover:border-[#14B8A6]'
            }`}
          >
            {f.label} ({countFor(f)})
          </Link>
        ))}
      </div>

      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-8 sm:p-10 text-center text-[#6B7280]">
          Nessun ordine ricevuto. Genera una chiave in{' '}
          <Link href="/supplier/keys" className="text-[#14B8A6] underline">Chiavi di accesso</Link>{' '}
          e condividila con i tuoi clienti.
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-8 text-center text-[#6B7280]">
          Nessun ordine con questo stato.
        </div>
      ) : (
        <>
          {/* Mobile: card stack */}
          <ul className="md:hidden space-y-3">
            {filtered.map((o) => (
              <li key={o.orderId}>
                <Link
                  href={`/supplier/orders/${o.orderId}`}
                  className="block bg-white rounded-2xl border border-[#E5DDD0] p-4 active:bg-[#FAF7F2]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold leading-tight">{o.customerName ?? '—'}</span>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm text-[#6B7280]">
                    <span>{formatDateTime(o.submittedAt ?? o.createdAt)} · {o.lineCount} {o.lineCount === 1 ? 'riga' : 'righe'}</span>
                    <span className="font-mono font-semibold text-[#1A2B4A]">€{formatCurrency(o.totalValue)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Tablet/desktop: table */}
          <div className="hidden md:block bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#FAF7F2] text-[#6B7280] text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Cliente</th>
                  <th className="text-left px-4 py-3">Ricevuto</th>
                  <th className="text-left px-4 py-3">Stato</th>
                  <th className="text-right px-4 py-3">Righe</th>
                  <th className="text-right px-4 py-3">Totale</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.orderId} className="border-t border-[#F0EAE0]">
                    <td className="px-4 py-3 font-medium">{o.customerName ?? '—'}</td>
                    <td className="px-4 py-3 text-xs font-mono text-[#6B7280]">
                      {formatDateTime(o.submittedAt ?? o.createdAt)}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                    <td className="px-4 py-3 text-right">{o.lineCount}</td>
                    <td className="px-4 py-3 text-right font-mono">€{formatCurrency(o.totalValue)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/supplier/orders/${o.orderId}`} className="text-[#14B8A6] font-semibold hover:underline">Apri →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
