import Link from 'next/link';
import { listOrders } from '@/modules/marketplace/service';
import { StatusBadge } from '@/components/marketplace/StatusBadge';
import { formatCurrency } from '@/lib/utils';

export default async function CustomerOrdersPage() {
  const orders = await listOrders();
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-5 sm:mb-6">
        <div>
          <h1 className="font-playfair text-2xl sm:text-3xl font-bold mb-1">Ordini ai fornitori</h1>
          <p className="text-sm text-[#6B7280]">{orders.length} ordini</p>
        </div>
        <Link href="/marketplace/suppliers" className="shrink-0 px-3 sm:px-4 py-2 rounded-xl bg-[#1A2B4A] text-white text-sm font-semibold hover:bg-[#243660]">+ <span className="hidden sm:inline">Nuovo </span>Ordine</Link>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-8 sm:p-10 text-center text-[#6B7280]">
          Nessun ordine. Collega un fornitore in <Link href="/marketplace/suppliers" className="text-[#C9962A] underline">Fornitori</Link>.
        </div>
      ) : (
        <>
          {/* Mobile: card stack */}
          <ul className="md:hidden space-y-3">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/marketplace/orders/${o.id}`} className="block bg-white rounded-2xl border border-[#E5DDD0] p-4 active:bg-[#FAF7F2]">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold leading-tight">{o.counterpartyName}</span>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="mt-3 text-right font-mono font-semibold text-[#1A2B4A]">{formatCurrency(o.total)} €</div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Tablet/desktop: table */}
          <div className="hidden md:block bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#FAF7F2] text-[#6B7280] text-xs uppercase">
                <tr><th className="text-left px-4 py-3">Fornitore</th><th className="text-left px-4 py-3">Stato</th><th className="text-right px-4 py-3">Totale</th><th className="px-4 py-3"></th></tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-t border-[#F0EAE0]">
                    <td className="px-4 py-3 font-medium">{o.counterpartyName}</td>
                    <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                    <td className="px-4 py-3 text-right">{formatCurrency(o.total)} €</td>
                    <td className="px-4 py-3 text-right"><Link href={`/marketplace/orders/${o.id}`} className="text-[#C9962A] font-semibold hover:underline">Apri →</Link></td>
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
