// =============================================================================
// app/(main)/documents/page.tsx
// Documenti commerciali (DDT, fatture, conferme) — lista con stato matching.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { listDocuments } from '@/modules/documents/service';
import { DOCUMENT_TYPE_LABELS, DOCUMENT_STATUS_LABELS } from '@/modules/documents/types';
import { formatCurrency } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import type { DocumentStatus } from '@/lib/database.types';

export const metadata: Metadata = { title: 'Documenti' };

const STATUS_BADGE: Record<DocumentStatus, string> = {
  received: 'bg-primary-light text-primary-hover',
  matched:  'bg-success-light text-success-strong',
  anomaly:  'bg-danger-light text-danger',
  archived: 'bg-neutral-light text-ink-muted',
};

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: { stato?: string };
}) {
  const docs = await listDocuments();
  const filter = searchParams.stato as DocumentStatus | undefined;
  const filtered = filter ? docs.filter((d) => d.documentStatus === filter) : docs.filter((d) => d.documentStatus !== 'archived');

  const counts = {
    da_verificare: docs.filter((d) => d.documentStatus === 'received').length,
    anomalie: docs.filter((d) => d.documentStatus === 'anomaly').length,
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Documenti"
        subtitle="DDT, fatture e conferme ordine — matching con gli ordini reali"
        action={
          <Link
            href="/documents/new"
            className="px-4 py-2.5 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover transition-colors"
          >
            + Registra documento
          </Link>
        }
      />

      {/* Filtri */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: undefined, label: `Attivi (${docs.filter((d) => d.documentStatus !== 'archived').length})` },
          { key: 'received', label: `Da verificare (${counts.da_verificare})` },
          { key: 'anomaly', label: `Con anomalie (${counts.anomalie})` },
          { key: 'matched', label: 'Verificati' },
          { key: 'archived', label: 'Archiviati' },
        ].map((f) => (
          <Link
            key={f.key ?? 'all'}
            href={f.key ? `/documents?stato=${f.key}` : '/documents'}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              filter === f.key
                ? 'bg-primary text-primary-fg border-primary'
                : 'bg-surface-2 text-ink-muted border-border hover:border-primary-soft'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-surface-2 rounded-2xl border border-border p-10 text-center">
          <p className="text-4xl mb-3">🧾</p>
          <p className="text-lg font-bold text-ink">Nessun documento</p>
          <p className="text-sm text-ink-muted mt-1 max-w-md mx-auto">
            Registra DDT e fatture dei fornitori: il sistema li confronta con gli
            ordini e segnala automaticamente differenze di quantità e prezzo.
          </p>
          <Link href="/documents/new" className="inline-block mt-4 text-sm font-semibold text-primary hover:underline">
            Registra il primo documento →
          </Link>
        </div>
      ) : (
        <>
        {/* Mobile: card stack */}
        <div className="md:hidden space-y-3">
          {filtered.map((d) => (
            <Link
              key={d.id}
              href={`/documents/${d.id}`}
              className="block bg-surface-2 rounded-xl border border-border p-4 active:bg-surface-offset"
            >
              <div className="flex justify-between items-start gap-3 mb-1.5">
                <span className="text-sm font-semibold text-ink">
                  {DOCUMENT_TYPE_LABELS[d.documentType]}
                  {d.documentNumber && <span className="font-mono font-normal text-ink-muted"> {d.documentNumber}</span>}
                </span>
                <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[d.documentStatus]}`}>
                  {DOCUMENT_STATUS_LABELS[d.documentStatus]}{d.openAnomalies > 0 && ` (${d.openAnomalies})`}
                </span>
              </div>
              <p className="text-xs text-ink-muted">{d.supplierName ?? '—'}</p>
              <div className="mt-2 flex justify-between items-center text-xs">
                <span className="font-mono text-ink-muted">{fmtDate(d.documentDate)}</span>
                <span className="font-mono font-semibold text-ink">
                  {d.totalAmount !== null ? `€${formatCurrency(d.totalAmount)}` : `${d.linesCount} righe`}
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* Desktop: tabella */}
        <div className="hidden md:block bg-surface-2 rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg border-b border-border">
              <tr>
                <th className="text-left px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Documento</th>
                <th className="text-left px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Fornitore</th>
                <th className="text-left px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Data</th>
                <th className="text-left px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Stato</th>
                <th className="text-right px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Totale</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {filtered.map((d) => (
                <tr key={d.id} className="hover:bg-surface-offset transition-colors">
                  <td className="px-6 py-3.5">
                    <p className="font-medium text-ink">{DOCUMENT_TYPE_LABELS[d.documentType]}</p>
                    <p className="text-xs text-ink-muted font-mono">{d.documentNumber ?? `${d.linesCount} righe`}</p>
                  </td>
                  <td className="px-6 py-3.5 text-ink">{d.supplierName ?? '—'}</td>
                  <td className="px-6 py-3.5 text-xs font-mono text-ink-muted whitespace-nowrap">{fmtDate(d.documentDate)}</td>
                  <td className="px-6 py-3.5">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[d.documentStatus]}`}>
                      {DOCUMENT_STATUS_LABELS[d.documentStatus]}
                      {d.openAnomalies > 0 && ` (${d.openAnomalies})`}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-right font-mono font-medium text-ink">
                    {d.totalAmount !== null ? `€${formatCurrency(d.totalAmount)}` : '—'}
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <Link href={`/documents/${d.id}`} className="text-xs font-semibold text-primary hover:underline">
                      Apri →
                    </Link>
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
