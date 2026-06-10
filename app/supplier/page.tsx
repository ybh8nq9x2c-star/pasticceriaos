import Link from 'next/link';
import { listOrders } from '@/modules/marketplace/service';
import { StatusBadge } from '@/components/marketplace/StatusBadge';
import { formatCurrency } from '@/lib/utils';

export default async function SupplierOrdersPage() {
  const orders = await listOrders();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <h1 className="font-playfair text-2xl sm:text-3xl font-bold mb-1">Ordini in arrivo</h1>
      <p className="text-sm text-[#6B7280] mb-5 sm:mb-6">{orders.length} ordini dai clienti collegati</p>

      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-8 sm:p-10 text-center text-[#6B7280]">
          Nessun ordine ricevuto. Genera una chiave in <Link href="/supplier/keys" className="text-[#14B8A6] underline">Chiavi di accesso</Link> e condividila con i tuoi clienti.
        </div>
      ) : (
        <>
          {/* Mobile: card stack */}
          <ul className="md:hidden space-y-3">
            {orders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/supplier/orders/${o.id}`}
                  className="block bg-white rounded-2xl border border-[#E5DDD0] p-4 active:bg-[#FAF7F2]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold leading-tight">{o.counterpartyName}</span>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm text-[#6B7280]">
                    <span>{o.lineCount} {o.lineCount === 1 ? 'riga' : 'righe'}</span>
                    <span className="font-mono font-semibold text-[#1A2B4A]">{formatCurrency(o.total)} €</span>
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
                  <th className="text-left px-4 py-3">Stato</th>
                  <th className="text-right px-4 py-3">Righe</th>
                  <th className="text-right px-4 py-3">Totale</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-t border-[#F0EAE0]">
                    <td className="px-4 py-3 font-medium">{o.counterpartyName}</td>
                    <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                    <td className="px-4 py-3 text-right">{o.lineCount}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(o.total)} €</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/supplier/orders/${o.id}`} className="text-[#14B8A6] font-semibold hover:underline">Apri →</Link>
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
