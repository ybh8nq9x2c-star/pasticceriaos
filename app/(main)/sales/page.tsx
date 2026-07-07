// =============================================================================
// app/(main)/sales/page.tsx — HUB dell'area commerciale unica "Vendite".
// In 5 secondi: quanto ho venduto, il POS funziona?, cosa devo risolvere,
// chi ritira nei prossimi giorni, le vendite recenti. Le azioni: registrare
// una vendita manuale, creare un ordine cliente, sistemare il POS.
// La mappatura prodotti vive in UN posto solo: /sales/pos (niente doppioni).
// DOMINIO: la vendita scala i PRODOTTI FINITI; le materie prime si muovono
// con ricezione e produzione, mai con lo scontrino.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { Receipt, Plus, Cake } from 'lucide-react';
import { listSales } from '@/modules/sales/service';
import { getPosHealth } from '@/modules/pos/service';
import { listCustomerOrders } from '@/modules/customers/service';
import { CUSTOMER_ORDER_STATUS_LABELS } from '@/modules/customers/types';
import type { SaleStatus } from '@/lib/database.types';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { SalesTabs } from '@/components/sales/SalesTabs';
import { PosStatusCard } from '@/components/sales/PosStatusCard';
import { formatCurrency } from '@/lib/utils';
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

function fmtPickup(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' });
}

export default async function SalesHubPage() {
  const [sales, health, customerOrders] = await Promise.all([
    listSales(),
    getPosHealth('mipos'),
    listCustomerOrders(),
  ]);

  const today = new Date().toDateString();
  const todaySales = sales.filter(
    (s) => new Date(s.soldAt).toDateString() === today && s.status !== 'reversed' && s.status !== 'void',
  );
  const todayRevenue = todaySales.reduce((sum, s) => sum + (s.totalAmount ?? 0), 0);
  const toResolve = health.unmappedCount + health.failedCount;
  const upcomingPickups = customerOrders
    .filter((o) => o.status !== 'delivered' && o.status !== 'cancelled')
    .slice(0, 4);
  const reversible = (s: SaleStatus) => s !== 'reversed' && s !== 'void';

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <SalesTabs active="overview" />

      <PageHeader
        title="Vendite"
        subtitle="Scontrini e prenotazioni in un posto solo. Ogni vendita scala i prodotti finiti."
        action={
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <Link
              href="/customers/new"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-border rounded-xl text-sm font-semibold text-ink hover:bg-surface-offset transition-colors whitespace-nowrap"
            >
              <Cake className="size-4" aria-hidden="true" /> Ordine cliente
            </Link>
            <Link
              href="/sales/new"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover transition-colors whitespace-nowrap"
            >
              <Plus className="size-4" aria-hidden="true" /> Registra vendita
            </Link>
          </div>
        }
      />

      {/* KPI essenziali di oggi */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border bg-surface-2 p-4">
          <p className="text-xs text-ink-muted">Vendite oggi</p>
          <p className="text-2xl font-bold text-ink mt-1 tnum">{todaySales.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface-2 p-4">
          <p className="text-xs text-ink-muted">Incasso oggi</p>
          <p className="text-2xl font-bold text-ink mt-1 tnum">
            {todayRevenue > 0 ? `€${formatCurrency(todayRevenue)}` : '—'}
          </p>
        </div>
        <Link
          href={toResolve > 0 ? health.cta.cta.href : '/sales/inbox'}
          className={`rounded-2xl border p-4 transition-colors ${
            toResolve > 0
              ? 'border-warning-soft bg-warning-light/40 hover:bg-warning-light/60'
              : 'border-border bg-surface-2 hover:bg-surface-offset'
          }`}
        >
          <p className="text-xs text-ink-muted">Da risolvere</p>
          <p className={`text-2xl font-bold mt-1 tnum ${toResolve > 0 ? 'text-warning-strong' : 'text-ink'}`}>
            {toResolve}
          </p>
        </Link>
      </div>

      {/* Stato POS: collegato? funziona? qual è l'unica azione giusta adesso? */}
      <div className="mt-4">
        <PosStatusCard health={health} />
      </div>

      {/* Prossimi ritiri (ordini cliente aperti) */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-ink">Prossimi ritiri</h2>
          <Link href="/customers" className="text-xs font-semibold text-primary hover:underline">
            Tutti gli ordini cliente →
          </Link>
        </div>
        {upcomingPickups.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface-2 px-5 py-4 text-sm text-ink-muted">
            Nessuna prenotazione in corso.{' '}
            <Link href="/customers/new" className="text-primary font-semibold hover:underline">
              Registra un ordine cliente →
            </Link>
          </p>
        ) : (
          <div className="rounded-2xl border border-border bg-surface-2 divide-y divide-divider overflow-hidden">
            {upcomingPickups.map((o) => (
              <div key={o.id} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{o.customerName}</p>
                  <p className="text-xs text-ink-muted mt-0.5 capitalize">
                    {fmtPickup(o.pickupDate)}
                    {o.pickupTime && ` · ${o.pickupTime.slice(0, 5)}`}
                    {` · ${o.piecesCount} ${o.piecesCount === 1 ? 'pezzo' : 'pezzi'}`}
                  </p>
                </div>
                <Badge
                  variant={o.status === 'ready' ? 'success' : o.status === 'in_production' ? 'primary' : 'info'}
                  size="sm"
                >
                  {CUSTOMER_ORDER_STATUS_LABELS[o.status]}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Vendite recenti */}
      <section className="mt-8">
        <h2 className="text-base font-bold text-ink mb-3">Vendite recenti</h2>
        {sales.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Nessuna vendita registrata"
            description="Registra la prima vendita o collega il POS: il magazzino prodotti finiti si aggiorna da solo."
            ctaHref="/sales/new"
            ctaLabel="Registra vendita"
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border">
            {/* Mobile: card list — scontrino, quando, stato, totale, storno */}
            <div className="md:hidden divide-y divide-divider bg-surface-2">
              {sales.map((s) => {
                const cfg = STATUS_CFG[s.status as SaleStatus] ?? STATUS_CFG.processed;
                return (
                  <div key={s.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/sales/${s.id}`} className="min-w-0">
                        <p className="font-mono text-sm text-primary truncate">{s.externalSaleId}</p>
                        <p className="text-xs text-ink-muted mt-0.5">
                          {dateFmt.format(new Date(s.soldAt))} · {s.source} · {s.lineCount} {s.lineCount === 1 ? 'riga' : 'righe'}
                        </p>
                      </Link>
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="font-mono text-sm text-ink">
                        {s.totalAmount != null ? formatCurrency(s.totalAmount) : '—'}
                      </span>
                      {reversible(s.status as SaleStatus) && <ReverseSaleButton saleId={s.id} />}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: tabella completa */}
            <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-offset text-ink-muted">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Scontrino</th>
                  <th className="text-left font-medium px-4 py-2.5">Quando</th>
                  <th className="text-center font-medium px-4 py-2.5">Righe</th>
                  <th className="text-left font-medium px-4 py-2.5">Stato</th>
                  <th className="text-right font-medium px-4 py-2.5">Totale</th>
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
                      <td className="px-4 py-3 text-ink-muted">{dateFmt.format(new Date(s.soldAt))}</td>
                      <td className="px-4 py-3 text-center font-mono text-ink-muted">{s.lineCount}</td>
                      <td className="px-4 py-3">
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-ink">
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
          </div>
        )}
      </section>
    </div>
  );
}
