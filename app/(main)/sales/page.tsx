// =============================================================================
// app/(main)/sales/page.tsx
// Vendite: hub V1 della deduzione magazzino AL MOMENTO DELLA VENDITA.
//   • registra una vendita (→ /sales/new) che deduce il magazzino
//   • alert "prodotti venduti ma non collegati a una ricetta" (regola #4)
//   • elenco vendite recenti con stato deduzione + storno (regola #3)
// Il ledger movimenti e gli alert scorte restano su /inventory.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { Receipt, Plus, AlertTriangle, Warehouse } from 'lucide-react';
import { listSales, listUnlinkedProducts, listLinkableRecipes } from '@/modules/sales/service';
import type { SaleStatus } from '@/lib/database.types';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/utils';
import { LinkProductForm } from './LinkProductForm';
import { ReverseSaleButton } from './ReverseSaleButton';

export const metadata: Metadata = { title: 'Vendite' };

const STATUS_CFG: Record<SaleStatus, { variant: BadgeVariant; label: string }> = {
  processed: { variant: 'success', label: 'Dedotto' },
  partially_linked: { variant: 'warning', label: 'Parziale' },
  unlinked: { variant: 'danger', label: 'Non dedotto' },
  reversed: { variant: 'neutral', label: 'Stornato' },
  void: { variant: 'neutral', label: 'Annullato' },
};

const dateFmt = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

export default async function SalesPage() {
  const [sales, unlinked, recipes] = await Promise.all([
    listSales(),
    listUnlinkedProducts(),
    listLinkableRecipes(),
  ]);

  const today = new Date().toDateString();
  const todayCount = sales.filter((s) => new Date(s.soldAt).toDateString() === today).length;
  const reversible = (s: SaleStatus) => s !== 'reversed' && s !== 'void';

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <PageHeader
        title="Vendite"
        subtitle="Ogni vendita scarica automaticamente le materie prime dal magazzino."
        action={
          <Link
            href="/sales/new"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover transition-colors"
          >
            <Plus className="size-4" /> Registra vendita
          </Link>
        }
      />

      {/* Riepilogo */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border bg-surface-2 p-4">
          <p className="text-xs text-ink-muted">Vendite oggi</p>
          <p className="text-2xl font-bold text-ink mt-1">{todayCount}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface-2 p-4">
          <p className="text-xs text-ink-muted">Totale registrate</p>
          <p className="text-2xl font-bold text-ink mt-1">{sales.length}</p>
        </div>
        <Link
          href="/inventory"
          className="rounded-2xl border border-border bg-surface-2 p-4 hover:bg-surface-offset transition-colors"
        >
          <p className="text-xs text-ink-muted inline-flex items-center gap-1">
            <Warehouse className="size-3.5" /> Magazzino
          </p>
          <p className="text-sm font-semibold text-primary mt-2">Giacenze e movimenti →</p>
        </Link>
      </div>

      {/* Prodotti non collegati (regola #4) */}
      {unlinked.length > 0 && (
        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <AlertTriangle className="size-4 text-warning" />
            Prodotti venduti ma non collegati ({unlinked.length})
          </h2>
          <p className="text-sm text-ink-muted mt-1">
            Queste vendite sono registrate ma <strong>non hanno scaricato il magazzino</strong>.
            Collega ogni prodotto a una ricetta: le vendite future verranno dedotte in automatico.
          </p>
          <div className="mt-3 space-y-2">
            {unlinked.map((u) => (
              <div
                key={`${u.source}::${u.externalProductRef}`}
                className="rounded-xl border border-warning-soft bg-warning-light/40 p-3 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{u.productName}</p>
                  <p className="text-xs text-ink-muted">
                    <span className="font-mono">{u.externalProductRef}</span> · {u.source} ·{' '}
                    {u.occurrences} {u.occurrences === 1 ? 'riga' : 'righe'}
                  </p>
                </div>
                <LinkProductForm
                  source={u.source}
                  externalProductRef={u.externalProductRef}
                  recipes={recipes}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Vendite recenti */}
      <section className="mt-8">
        <h2 className="text-base font-bold text-ink mb-3">Vendite recenti</h2>
        {sales.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Nessuna vendita registrata"
            description="Registra la prima vendita: il magazzino si aggiorna da solo, ricetta per ricetta."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-offset text-ink-muted">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Scontrino</th>
                  <th className="text-left font-medium px-4 py-2.5 hidden sm:table-cell">Quando</th>
                  <th className="text-center font-medium px-4 py-2.5">Righe</th>
                  <th className="text-left font-medium px-4 py-2.5">Stato</th>
                  <th className="text-right font-medium px-4 py-2.5 hidden sm:table-cell">Totale</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {sales.map((s) => {
                  const cfg = STATUS_CFG[s.status as SaleStatus] ?? STATUS_CFG.processed;
                  return (
                    <tr key={s.id} className="bg-surface-2">
                      <td className="px-4 py-3">
                        <Link href={`/sales/${s.id}`} className="font-mono text-primary hover:underline">
                          {s.externalSaleId}
                        </Link>
                        <span className="block text-xs text-ink-faint">{s.source}</span>
                      </td>
                      <td className="px-4 py-3 text-ink-muted hidden sm:table-cell">
                        {dateFmt.format(new Date(s.soldAt))}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-ink-muted">{s.lineCount}</td>
                      <td className="px-4 py-3">
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-ink hidden sm:table-cell">
                        {s.totalAmount != null ? formatCurrency(s.totalAmount) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {reversible(s.status as SaleStatus) && <ReverseSaleButton saleId={s.id} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
