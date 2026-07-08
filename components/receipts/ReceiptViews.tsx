// =============================================================================
// Viste server condivise del goods receipt engine (bakery e supplier montano
// le stesse viste con `mode` e basePath diversi). Dati SOLO dal service.
// =============================================================================

import Link from 'next/link';
import { FileUp, PackagePlus, ScanLine, Inbox } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScannerPanel } from './ScannerPanel';
import { ReceiptLinesPanel } from './ReceiptLinesPanel';
import { CompleteReceiptBar } from './CompleteReceiptBar';
import { ImportDdtCard, NewReceiptForm } from './NewReceiptForms';
import * as service from '@/modules/goods-receipts/service';
import {
  RECEIPT_STATUS_BADGE,
  RECEIPT_STATUS_LABELS,
  type ReceiptMode,
} from '@/modules/goods-receipts/types';
import type { ReceiptStatus } from '@/lib/database.types';
import { cn, formatDateShort } from '@/lib/utils';

function basePath(mode: ReceiptMode): string {
  return mode === 'supplier' ? '/supplier/receipts' : '/receipts';
}

// ── Tabs stato ────────────────────────────────────────────────────────────────

const TABS: { key: string; label: string; statuses: ReceiptStatus[] | null }[] = [
  { key: 'open',        label: 'In corso',    statuses: ['draft', 'partial'] },
  { key: 'expected',    label: 'Attesi',      statuses: ['expected'] },
  { key: 'completed',   label: 'Completati',  statuses: ['completed'] },
  { key: 'discrepancy', label: 'Discrepanze', statuses: ['discrepancy'] },
  { key: 'all',         label: 'Tutti',       statuses: null },
];

export async function ReceiptsIndexView({
  mode,
  searchParams,
}: {
  mode: ReceiptMode;
  searchParams: { tab?: string; q?: string; supplier?: string };
}) {
  const tab = TABS.find((t) => t.key === searchParams.tab) ?? TABS[0];

  // P1-B: pulizia best-effort dei draft vuoti >7gg (gusci senza righe, zero
  // ledger). Un errore qui non deve mai impedire di vedere la lista.
  try {
    await service.archiveStaleDraftReceipts();
  } catch {
    /* best-effort */
  }

  const [receipts, suppliers] = await Promise.all([
    service.listReceipts({
      status: tab.statuses,
      supplierId: searchParams.supplier || null,
      search: searchParams.q || null,
    }),
    service.listSupplierOptions(),
  ]);
  const base = basePath(mode);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <PageHeader
        title="Ricevimenti merce"
        subtitle="Scan, DDT e conferme: l'unico ingresso a magazzino."
        actions={
          <div className="flex gap-2">
            <ButtonLink href={`${base}/new`} variant="secondary" size="sm">
              <FileUp size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Importa DDT</span>
            </ButtonLink>
            <ButtonLink href={`${base}/new`} size="sm">
              <PackagePlus size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Nuovo ricevimento</span>
            </ButtonLink>
          </div>
        }
      />

      {/* Tabs + filtri */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <nav aria-label="Filtra per stato" className="flex gap-1.5 overflow-x-auto -mx-1 px-1">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`${base}?tab=${t.key}${searchParams.supplier ? `&supplier=${searchParams.supplier}` : ''}`}
              aria-current={t.key === tab.key ? 'page' : undefined}
              className={cn(
                'whitespace-nowrap rounded-full px-3 min-h-[36px] inline-flex items-center text-sm border transition-colors',
                t.key === tab.key
                  ? 'bg-primary-light text-primary border-primary-soft font-medium'
                  : 'border-border text-ink-muted hover:bg-surface-offset',
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <form method="get" className="flex items-center gap-2 ml-auto">
          <input type="hidden" name="tab" value={tab.key} />
          <label htmlFor="receipt-supplier" className="sr-only">Filtra per fornitore</label>
          <select
            id="receipt-supplier"
            name="supplier"
            defaultValue={searchParams.supplier ?? ''}
            className="rounded-md border border-border bg-surface-2 px-2.5 min-h-[36px] text-sm text-ink"
          >
            <option value="">Tutti i fornitori</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md border border-border px-3 min-h-[36px] text-sm text-ink-muted hover:bg-surface-offset"
          >
            Filtra
          </button>
        </form>
      </div>

      {receipts.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={
            tab.key === 'expected'
              ? 'Nessun ricevimento atteso'
              : tab.key === 'completed'
                ? 'Nessun ricevimento completato'
                : 'Nessun ricevimento qui'
          }
          description="Crea un ricevimento dal DDT del fornitore oppure parti dallo scanner: la merce entra a magazzino solo da qui."
          ctaHref={`${base}/new`}
          ctaLabel="Nuovo ricevimento"
        />
      ) : (
        <ul className="space-y-2">
          {receipts.map((r) => (
            <li key={r.id}>
              <Link
                href={`${base}/${r.id}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-4 py-3 shadow-sm hover:border-primary-soft hover:shadow-md transition-all"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink truncate">
                    {r.supplierName ?? 'Fornitore non specificato'}
                  </p>
                  <p className="text-xs text-ink-muted truncate">
                    {[
                      r.ddtNumber ? `DDT ${r.ddtNumber}` : null,
                      r.ddtDate ? formatDateShort(r.ddtDate) : formatDateShort(r.createdAt),
                      `${r.linesCount} righe`,
                      r.purchaseOrderId ? 'da ordine' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                {r.linesCount > 0 && (
                  <span className="hidden sm:block text-xs font-mono tnum text-ink-muted shrink-0">
                    {r.receivedCount}/{r.linesCount}
                  </span>
                )}
                <Badge variant={RECEIPT_STATUS_BADGE[r.status]} size="sm">
                  {RECEIPT_STATUS_LABELS[r.status]}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Nuovo ricevimento ─────────────────────────────────────────────────────────

export async function ReceiptNewView({
  mode,
  preselectedOrderId,
}: {
  mode: ReceiptMode;
  preselectedOrderId?: string;
}) {
  const [suppliers, orders] = await Promise.all([
    service.listSupplierOptions(),
    service.listReceivableOrders(),
  ]);
  const base = basePath(mode);

  // Deep-link da un ordine (es. "Ricevi merce" dal dettaglio PO): precompila il
  // form solo se l'ordine è ancora ricevibile (non già ricevuto/annullato/altra org).
  const initialOrder = preselectedOrderId
    ? orders.find((o) => o.id === preselectedOrderId) ?? null
    : null;
  const orderUnavailable = !!preselectedOrderId && !initialOrder;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-4">
        <Link href={base} className="text-sm text-ink-muted hover:text-ink transition-colors">
          ← Ricevimenti
        </Link>
      </div>
      <PageHeader
        title="Nuovo ricevimento"
        subtitle="Importa il DDT del fornitore oppure crea il ricevimento e scansiona la merce."
      />
      {initialOrder && (
        <p role="status" className="mb-4 rounded-md bg-info-light px-3 py-2 text-sm text-info-strong">
          Ricevimento collegato all&apos;ordine di <strong>{initialOrder.supplierName}</strong>:
          le righe e le quantità attese vengono precompilate. Potrai correggere il ricevuto reale prima di confermare.
        </p>
      )}
      {orderUnavailable && (
        <p role="status" className="mb-4 rounded-md bg-warning-light px-3 py-2 text-sm text-warning-strong">
          L&apos;ordine indicato non è più ricevibile (già ricevuto o annullato).
          Puoi creare un ricevimento libero qui sotto.
        </p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <ImportDdtCard mode={mode} suppliers={suppliers} />
        <NewReceiptForm
          mode={mode}
          suppliers={suppliers}
          orders={orders}
          initialOrderId={initialOrder?.id}
        />
      </div>
    </div>
  );
}

// ── Dettaglio ─────────────────────────────────────────────────────────────────

export async function ReceiptDetailView({
  mode,
  id,
  importedSummary,
}: {
  mode: ReceiptMode;
  id: string;
  importedSummary?: string;
}) {
  const [receipt, catalog] = await Promise.all([
    service.getReceipt(id),
    service.listCatalogForPicker(),
  ]);
  const base = basePath(mode);
  const editable = ['draft', 'expected', 'partial'].includes(receipt.status);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-4">
      <div>
        <Link href={base} className="text-sm text-ink-muted hover:text-ink transition-colors">
          ← Ricevimenti
        </Link>
      </div>

      <PageHeader
        title={receipt.supplier?.name ?? 'Ricevimento merce'}
        subtitle={[
          receipt.ddtNumber ? `DDT ${receipt.ddtNumber}` : null,
          receipt.ddtDate ? formatDateShort(receipt.ddtDate) : null,
          receipt.supplier?.type === 'bakeryos_connected' ? 'Fornitore connesso BakeryOs' : null,
        ]
          .filter(Boolean)
          .join(' · ') || undefined}
        actions={
          <Badge variant={RECEIPT_STATUS_BADGE[receipt.status]}>
            {RECEIPT_STATUS_LABELS[receipt.status]}
          </Badge>
        }
      />

      {importedSummary && (
        <p role="status" className="rounded-md bg-info-light px-3 py-2 text-sm text-info-strong animate-state-fade">
          DDT importato: {importedSummary}
        </p>
      )}
      {receipt.notes && (
        <p className="rounded-md bg-surface-offset px-3 py-2 text-sm text-ink-muted">{receipt.notes}</p>
      )}

      {/* Collegamenti di tracciabilità */}
      <div className="flex flex-wrap gap-2 text-sm">
        {receipt.purchaseOrderId && mode === 'bakery' && (
          <Link
            href={`/orders/${receipt.purchaseOrderId}`}
            className="inline-flex items-center min-h-[36px] px-3 rounded-md border border-border text-ink-muted hover:bg-surface-offset"
          >
            Ordine collegato →
          </Link>
        )}
        {receipt.sourceDocumentId && mode === 'bakery' && (
          <Link
            href={`/documents/${receipt.sourceDocumentId}`}
            className="inline-flex items-center min-h-[36px] px-3 rounded-md border border-border text-ink-muted hover:bg-surface-offset"
          >
            DDT archiviato →
          </Link>
        )}
        {editable && (
          <span className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-md bg-primary-light text-primary text-sm">
            <ScanLine size={14} aria-hidden="true" /> Scanner attivo qui sotto
          </span>
        )}
      </div>

      <ScannerPanel receiptId={receipt.id} mode={mode} disabled={!editable} />

      <ReceiptLinesPanel
        receiptId={receipt.id}
        mode={mode}
        lines={receipt.lines}
        catalog={catalog}
        editable={editable}
      />

      <CompleteReceiptBar receipt={receipt} mode={mode} />

      {/* Cronologia essenziale */}
      <section aria-label="Cronologia" className="text-xs text-ink-faint space-y-0.5">
        <p>Creato il {new Date(receipt.createdAt).toLocaleString('it-IT')}</p>
        {receipt.completedAt && (
          <p>Contabilizzato il {new Date(receipt.completedAt).toLocaleString('it-IT')}</p>
        )}
      </section>
    </div>
  );
}
