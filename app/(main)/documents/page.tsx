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
  received: 'bg-[#C9962A]/15 text-[#8A6418]',
  matched:  'bg-[#27AE60]/10 text-[#1E7E45]',
  anomaly:  'bg-[#C0392B]/10 text-[#C0392B]',
  archived: 'bg-[#6B7280]/10 text-[#6B7280]',
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
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Documenti"
        subtitle="DDT, fatture e conferme ordine — matching con gli ordini reali"
        action={
          <Link
            href="/documents/new"
            className="px-4 py-2.5 bg-[#1A2B4A] text-white rounded-xl text-sm font-semibold hover:bg-[#243660] transition-colors"
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
                ? 'bg-[#1A2B4A] text-white border-[#1A2B4A]'
                : 'bg-white text-[#6B7280] border-[#E5DDD0] hover:border-[#C9962A]'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-10 text-center">
          <p className="text-4xl mb-3">🧾</p>
          <p className="font-playfair text-lg font-bold text-[#1A2B4A]">Nessun documento</p>
          <p className="text-sm text-[#6B7280] mt-1 max-w-md mx-auto">
            Registra DDT e fatture dei fornitori: il sistema li confronta con gli
            ordini e segnala automaticamente differenze di quantità e prezzo.
          </p>
          <Link href="/documents/new" className="inline-block mt-4 text-sm font-semibold text-[#C9962A] hover:underline">
            Registra il primo documento →
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#FAF7F2] border-b border-[#E5DDD0]">
              <tr>
                <th className="text-left px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Documento</th>
                <th className="text-left px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Fornitore</th>
                <th className="text-left px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Data</th>
                <th className="text-left px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Stato</th>
                <th className="text-right px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Totale</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0EBE1]">
              {filtered.map((d) => (
                <tr key={d.id} className="hover:bg-[#FAF7F2] transition-colors">
                  <td className="px-6 py-3.5">
                    <p className="font-medium text-[#1A2B4A]">{DOCUMENT_TYPE_LABELS[d.documentType]}</p>
                    <p className="text-xs text-[#6B7280] font-mono">{d.documentNumber ?? `${d.linesCount} righe`}</p>
                  </td>
                  <td className="px-6 py-3.5 text-[#1A1A2E]">{d.supplierName ?? '—'}</td>
                  <td className="px-6 py-3.5 text-xs font-mono text-[#6B7280] whitespace-nowrap">{fmtDate(d.documentDate)}</td>
                  <td className="px-6 py-3.5">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_BADGE[d.documentStatus]}`}>
                      {DOCUMENT_STATUS_LABELS[d.documentStatus]}
                      {d.openAnomalies > 0 && ` (${d.openAnomalies})`}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-right font-mono font-medium text-[#1A2B4A]">
                    {d.totalAmount !== null ? `€${formatCurrency(d.totalAmount)}` : '—'}
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <Link href={`/documents/${d.id}`} className="text-xs font-semibold text-[#C9962A] hover:underline">
                      Apri →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
