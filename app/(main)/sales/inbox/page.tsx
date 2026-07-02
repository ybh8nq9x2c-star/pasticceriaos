// =============================================================================
// app/(main)/sales/inbox/page.tsx
// Inbox eventi POS: cosa è arrivato dalla cassa e che fine ha fatto.
// Tecnica ma leggibile: stato onesto, errore visibile, azioni contestuali
// (Riprova, payload, apri mapping). I duplicati non vengono persistiti (il
// ledger tiene solo la prima occorrenza): nessun tab "Duplicati" finto.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { Inbox as InboxIcon } from 'lucide-react';
import { listPosEvents, getPosReconciliation, type PosInboxFilter } from '@/modules/pos/service';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { ReplayButton } from './ReplayButton';

export const metadata: Metadata = { title: 'Inbox POS' };
export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
  pending:   { label: 'Ricevuto',  variant: 'info' },
  processed: { label: 'Elaborato', variant: 'success' },
  failed:    { label: 'Fallito',   variant: 'danger' },
  reversed:  { label: 'Stornato',  variant: 'warning' },
  duplicate: { label: 'Duplicato', variant: 'neutral' },
};

const TABS: { key: PosInboxFilter; label: string }[] = [
  { key: 'all',      label: 'Tutti' },
  { key: 'unmapped', label: 'Da collegare' },
  { key: 'failed',   label: 'Falliti' },
  { key: 'reversed', label: 'Stornati' },
];

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default async function PosInboxPage({ searchParams }: { searchParams: { tab?: string } }) {
  const tab = (TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab : 'all') as PosInboxFilter;
  const [events, reconciliation] = await Promise.all([
    listPosEvents(tab),
    getPosReconciliation(7),
  ]);
  const mismatchDays = reconciliation.filter((r) => r.mismatch).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Inbox POS"
        subtitle="Ogni scontrino arrivato dalla cassa e che fine ha fatto."
        backHref="/sales"
        backLabel="Vendite"
        action={
          <Link
            href="/settings/pos"
            className="px-4 py-2.5 border border-border rounded-xl text-sm font-semibold text-ink hover:bg-surface-offset transition-colors whitespace-nowrap"
          >
            Mappature →
          </Link>
        }
      />

      {/* Riconciliazione ultimi 7 giorni: onesta, senza correzioni automatiche. */}
      {mismatchDays > 0 && (
        <div className="rounded-2xl border border-warning-soft bg-warning-light/50 px-5 py-3 text-sm text-ink">
          <strong>{mismatchDays} giorn{mismatchDays === 1 ? 'o' : 'i'}</strong> negli ultimi 7 con differenze tra POS e
          BakeryOS (eventi falliti, prodotti non collegati o importi che non tornano). Controlla gli eventi qui sotto.
        </div>
      )}

      {/* Tab filtri */}
      <div className="flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === 'all' ? '/sales/inbox' : `/sales/inbox?tab=${t.key}`}
            className={`shrink-0 flex items-center min-h-[40px] px-4 rounded-xl border text-sm font-semibold transition-colors ${
              tab === t.key
                ? 'border-primary-soft bg-primary-light text-primary'
                : 'border-border bg-surface-2 text-ink-muted hover:bg-surface-offset'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon={InboxIcon}
          title="Nessun evento POS"
          description={
            tab === 'all'
              ? 'Quando la cassa invierà scontrini li vedrai qui, con il loro stato.'
              : 'Nessun evento in questo stato. ✓'
          }
        />
      ) : (
        <div className="bg-surface-2 rounded-2xl border border-border divide-y divide-divider overflow-hidden">
          {events.map((e) => {
            const badge = STATUS_BADGE[e.status] ?? { label: e.status, variant: 'neutral' as BadgeVariant };
            const replayable = e.status === 'failed' || (e.status === 'processed' && e.unlinked.length > 0);
            return (
              <div key={e.id} className="px-4 sm:px-5 py-3.5 space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono text-sm font-semibold text-ink">{e.externalReceiptId}</span>
                  <Badge variant={badge.variant} size="sm">{badge.label}</Badge>
                  {e.eventType === 'reversal' && <Badge variant="warning" size="sm">Storno</Badge>}
                  {e.unlinked.length > 0 && (
                    <Badge variant="warning" size="sm">{e.unlinked.length} non collegat{e.unlinked.length === 1 ? 'o' : 'i'}</Badge>
                  )}
                  <span className="ml-auto text-xs font-mono text-ink-muted">{fmtDateTime(e.receivedAt)}</span>
                </div>
                <p className="text-xs text-ink-muted">
                  {e.provider}
                  {e.externalStoreId && ` · store ${e.externalStoreId}`}
                  {` · ${e.linesCount} rig${e.linesCount === 1 ? 'a' : 'he'}`}
                  {e.saleId && (
                    <> · <Link href={`/sales/${e.saleId}`} className="text-primary hover:underline">vendita →</Link></>
                  )}
                </p>
                {e.errorText && (
                  <p className="rounded-md bg-danger-light px-3 py-1.5 text-xs text-danger">{e.errorText}</p>
                )}
                <div className="flex items-center gap-3 flex-wrap">
                  {replayable && <ReplayButton eventId={e.id} />}
                  {e.unlinked.length > 0 && (
                    <Link
                      href={`/settings/pos?highlight=${encodeURIComponent(e.unlinked[0])}`}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Collega prodotti →
                    </Link>
                  )}
                  <details className="text-xs text-ink-muted">
                    <summary className="cursor-pointer select-none font-semibold hover:text-ink">Payload</summary>
                    <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-bg border border-divider p-2 font-mono text-[11px] leading-snug">
                      {JSON.stringify(e.rawPayload, null, 2)}
                    </pre>
                  </details>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
