// =============================================================================
// app/(main)/documents/[id]/page.tsx
// Dettaglio documento: righe con varianze, anomalie con risoluzione,
// matching manuale verso un ordine, archiviazione.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDocument } from '@/modules/documents/service';
import { listOrders } from '@/modules/ordering/service';
import { getDocumentSignedUrl } from '@/lib/storage';
import { resolveAnomalyAction, archiveDocumentAction } from '@/modules/documents/actions';
import { MatchPanel } from './MatchPanel';
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_STATUS_LABELS,
  ANOMALY_TYPE_LABELS,
} from '@/modules/documents/types';
import { formatCurrency, IDLE_STATE, UNIT_SHORT } from '@/lib/utils';
import type { CommercialDocument } from '@/modules/documents/types';

export const metadata: Metadata = { title: 'Documento' };

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default async function DocumentDetailPage({ params }: { params: { id: string } }) {
  let doc: CommercialDocument;
  try {
    doc = await getDocument(params.id);
  } catch {
    notFound();
  }

  const orders = doc.documentStatus !== 'archived'
    ? (await listOrders())
        .filter((o) => o.status !== 'draft' && o.status !== 'cancelled' && (!doc.supplierId || o.supplierId === doc.supplierId))
        .slice(0, 30)
        .map((o) => ({ id: o.id, label: `${o.supplierName} · ${o.orderDate} · ${o.lineItemsCount} righe` }))
    : [];

  const openAnomalies = doc.anomalies.filter((a) => !a.resolved);
  const documentId = doc.id;

  // Signed URL generata server-side (1h): lo storage_path non arriva al client.
  let fileUrl: string | null = null;
  if (doc.storagePath) {
    try {
      fileUrl = await getDocumentSignedUrl(doc.storagePath);
    } catch {
      fileUrl = null; // file mancante/storage non disponibile: la pagina resta usabile
    }
  }
  const isPdf = doc.storagePath?.toLowerCase().endsWith('.pdf') ?? false;

  async function handleArchive(): Promise<void> {
    'use server';
    await archiveDocumentAction(documentId);
  }

  const STATUS_STYLE: Record<string, string> = {
    received: 'bg-primary-light text-primary-hover',
    matched:  'bg-success-light text-success-strong',
    anomaly:  'bg-danger-light text-danger',
    archived: 'bg-neutral-light text-ink-muted',
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/documents" className="text-sm text-ink-muted hover:text-ink transition-colors">
          ← Documenti
        </Link>
        <div className="flex items-start justify-between gap-4 mt-3">
          <div>
            <h1 className="text-3xl font-bold text-ink">
              {DOCUMENT_TYPE_LABELS[doc.documentType]}
              {doc.documentNumber && <span className="text-primary"> {doc.documentNumber}</span>}
            </h1>
            <p className="text-sm text-ink-muted mt-1">
              {doc.supplierName ?? 'Fornitore non collegato'} · {fmtDate(doc.documentDate)}
              {doc.uploadedByOrgId && doc.uploadedByOrgId !== doc.organizationId && ' · caricato dal fornitore'}
            </p>
          </div>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${STATUS_STYLE[doc.documentStatus]}`}>
            {DOCUMENT_STATUS_LABELS[doc.documentStatus]}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* File allegato (signed URL, 1h) */}
          {fileUrl && (
            <div className="bg-surface-2 rounded-2xl border border-border overflow-hidden">
              <div className="px-6 py-3 border-b border-divider flex items-center justify-between">
                <h2 className="font-semibold text-[15px] text-ink">File allegato</h2>
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Apri in nuova scheda ↗
                </a>
              </div>
              {isPdf ? (
                <iframe src={fileUrl} title="Documento" className="w-full h-96 bg-bg" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl} alt="Documento allegato" className="w-full max-h-96 object-contain bg-bg" />
              )}
            </div>
          )}

          {/* Righe con varianze */}
          <div className="bg-surface-2 rounded-2xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-divider">
              <h2 className="font-semibold text-[15px] text-ink">Righe documento</h2>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg border-b border-border">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Descrizione</th>
                  <th className="text-right px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Qtà</th>
                  <th className="text-right px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">€/u</th>
                  <th className="text-right px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Δ Qtà</th>
                  <th className="text-right px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Δ Prezzo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {doc.lines.map((l) => (
                  <tr key={l.id} className={l.orderLineItemId === null && doc.matchedAt ? 'bg-danger-light' : ''}>
                    <td className="px-6 py-3 text-ink">
                      {l.description}
                      {l.orderLineItemId === null && doc.purchaseOrderId && (
                        <span className="block text-xs text-danger">non corrisponde a righe ordine</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right font-mono">{l.quantity} <span className="text-xs text-ink-muted">{UNIT_SHORT[l.unit]}</span></td>
                    <td className="px-6 py-3 text-right font-mono text-ink-muted">
                      {l.unitPrice !== null ? `€${formatCurrency(l.unitPrice)}` : '—'}
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-xs">
                      {l.quantityVariance === null ? '—' : l.quantityVariance === 0 ? <span className="text-success-strong">0</span> : (
                        <span className="text-danger">{l.quantityVariance > 0 ? '+' : ''}{l.quantityVariance}</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-xs">
                      {l.priceVariance === null ? '—' : Math.abs(l.priceVariance) < 0.005 ? <span className="text-success-strong">0</span> : (
                        <span className="text-danger">{l.priceVariance > 0 ? '+' : ''}€{l.priceVariance.toFixed(4)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {doc.totalAmount !== null && (
                <tfoot className="border-t border-border bg-bg">
                  <tr>
                    <td className="px-6 py-3 text-right text-sm font-medium text-ink-muted" colSpan={2}>Totale dichiarato</td>
                    <td className="px-6 py-3 text-right font-mono font-bold text-ink" colSpan={3}>€{formatCurrency(doc.totalAmount)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
            </div>
          </div>

          {/* Anomalie */}
          {doc.anomalies.length > 0 && (
            <div className="bg-surface-2 rounded-2xl border border-border overflow-hidden">
              <div className="px-6 py-4 border-b border-divider flex items-center justify-between">
                <h2 className="font-semibold text-[15px] text-ink">Anomalie</h2>
                {openAnomalies.length > 0 && (
                  <span className="text-xs font-semibold text-danger">{openAnomalies.length} aperte</span>
                )}
              </div>
              <div className="divide-y divide-divider">
                {doc.anomalies.map((a) => (
                  <div key={a.id} className={`px-6 py-3.5 flex items-start gap-3 ${a.resolved ? 'opacity-50' : ''}`}>
                    <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${a.resolved ? 'bg-success' : 'bg-danger'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink">{ANOMALY_TYPE_LABELS[a.anomalyType]}</p>
                      <p className="text-xs text-ink-muted mt-0.5">{a.description}</p>
                      {(a.expectedValue || a.actualValue) && (
                        <p className="text-xs font-mono text-ink-muted mt-0.5">
                          atteso: {a.expectedValue ?? '—'} · documento: {a.actualValue ?? '—'}
                        </p>
                      )}
                    </div>
                    {!a.resolved && <ResolveButton anomalyId={a.id} />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Colonna azioni */}
        <div className="space-y-4">
          <div className="bg-surface-2 rounded-2xl border border-border p-5">
            <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">Dettagli</h2>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between"><dt className="text-ink-muted">Righe</dt><dd className="font-mono">{doc.lines.length}</dd></div>
              {doc.dueDate && (
                <div className="flex justify-between"><dt className="text-ink-muted">Scadenza pag.</dt><dd className="font-mono">{fmtDate(doc.dueDate)}</dd></div>
              )}
              {doc.purchaseOrderId && (
                <div className="flex justify-between items-center">
                  <dt className="text-ink-muted">Ordine</dt>
                  <dd><Link href={`/orders/${doc.purchaseOrderId}`} className="text-xs font-semibold text-primary hover:underline">Apri ordine →</Link></dd>
                </div>
              )}
              {doc.notes && <div><dt className="text-ink-muted text-xs">Note</dt><dd className="text-ink mt-0.5">{doc.notes}</dd></div>}
            </dl>
          </div>

          {doc.documentStatus !== 'archived' && (
            <MatchPanel
              documentId={doc.id}
              currentOrderId={doc.purchaseOrderId}
              orders={orders}
            />
          )}

          {doc.documentStatus !== 'archived' && (
            <form action={handleArchive}>
              <button
                type="submit"
                className="w-full py-3 border border-border text-ink-muted rounded-xl text-sm font-semibold hover:bg-surface-offset transition-colors"
              >
                Archivia documento
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// Bottone risoluzione anomalia: server-rendered form, action thin.
function ResolveButton({ anomalyId }: { anomalyId: string }) {
  async function handleResolve(formData: FormData): Promise<void> {
    'use server';
    await resolveAnomalyAction(IDLE_STATE, formData);
  }
  return (
    <form action={handleResolve} className="shrink-0">
      <input type="hidden" name="anomalyId" value={anomalyId} />
      <button
        type="submit"
        className="text-xs font-semibold text-success-strong hover:underline"
      >
        Risolvi ✓
      </button>
    </form>
  );
}
