import Link from 'next/link';
import { listOrders } from '@/modules/marketplace/service';
import { StatusBadge } from '@/components/marketplace/StatusBadge';
import { formatCurrency } from '@/lib/utils';

// Stessa resa data della lista fornitore: coerenza tra le due facce dell'ordine.
function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default async function CustomerOrdersPage() {
  const orders = await listOrders();
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-5 sm:mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-1">Ordini ai fornitori</h1>
          <p className="text-sm text-ink-muted">{orders.length} ordini</p>
        </div>
        <Link href="/marketplace/orders/new" className="shrink-0 px-3 sm:px-4 py-2 rounded-xl bg-primary text-primary-fg text-sm font-semibold hover:bg-primary-hover">+ <span className="hidden sm:inline">Nuovo </span>Ordine</Link>
      </div>

      {orders.length === 0 ? (
        <div className="bg-surface-2 rounded-2xl border border-border p-8 sm:p-10 text-center text-ink-muted">
          Nessun ordine. Collega un fornitore in <Link href="/suppliers" className="text-primary underline">Fornitori</Link>.
        </div>
      ) : (
        <>
          {/* Mobile: card stack */}
          <ul className="md:hidden space-y-3">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/marketplace/orders/${o.id}`} className="block bg-surface-2 rounded-2xl border border-border p-4 active:bg-surface-offset">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold leading-tight">{o.counterpartyName}</span>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm text-ink-muted">
                    <span>{formatDateTime(o.submittedAt ?? o.createdAt)} · {o.lineCount} {o.lineCount === 1 ? 'riga' : 'righe'}</span>
                    <span className="font-mono font-semibold text-ink">{formatCurrency(o.total)} €</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Tablet/desktop: table */}
          <div className="hidden md:block bg-surface-2 rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg text-ink-muted text-xs uppercase">
                <tr><th className="text-left px-4 py-3">Fornitore</th><th className="text-left px-4 py-3">Inviato</th><th className="text-left px-4 py-3">Stato</th><th className="text-right px-4 py-3">Righe</th><th className="text-right px-4 py-3">Totale</th><th className="px-4 py-3"></th></tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-t border-divider">
                    <td className="px-4 py-3 font-medium">{o.counterpartyName}</td>
                    <td className="px-4 py-3 text-xs font-mono text-ink-muted">{formatDateTime(o.submittedAt ?? o.createdAt)}</td>
                    <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                    <td className="px-4 py-3 text-right">{o.lineCount}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(o.total)} €</td>
                    <td className="px-4 py-3 text-right"><Link href={`/marketplace/orders/${o.id}`} className="text-primary font-semibold hover:underline">Apri →</Link></td>
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
