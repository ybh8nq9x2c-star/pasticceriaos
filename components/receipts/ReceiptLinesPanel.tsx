'use client';

// =============================================================================
// <ReceiptLinesPanel> — righe del ricevimento: attese vs ricevute, matching
// manuale dei prodotti non riconosciuti, lotto/scadenza, discrepanze.
// Mobile-first: card per riga; nessuna tabella sotto md.
// =============================================================================

import { Fragment, useState, useTransition } from 'react';
import { AlertTriangle, PackagePlus, Save } from 'lucide-react';
import { gs1DetailRows } from '@/modules/goods-receipts/gs1';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  addManualLineAction,
  createProductFromLineAction,
  resolveLineProductAction,
  updateLineAction,
} from '@/modules/goods-receipts/actions';
import { LINE_STATUS_LABELS, type ReceiptLineView, type ReceiptMode } from '@/modules/goods-receipts/types';
import type { CatalogProductRef } from '@/modules/goods-receipts/matching';
import { RECEIPT_LINE_BADGE } from '@/lib/status';
import { IDLE_STATE, UNIT_LABELS, cn, type ActionState } from '@/lib/utils';
import type { UnitOfMeasure } from '@/lib/database.types';

const UNITS: UnitOfMeasure[] = ['g', 'kg', 'ml', 'l', 'pz', 'bustina', 'foglio'];

export function ReceiptLinesPanel({
  receiptId,
  mode,
  lines,
  catalog,
  editable,
}: {
  receiptId: string;
  mode: ReceiptMode;
  lines: ReceiptLineView[];
  catalog: CatalogProductRef[];
  editable: boolean;
}) {
  return (
    <section aria-label="Righe del ricevimento" className="bg-surface-2 rounded-lg border border-border shadow-sm">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-divider">
        <h2 className="text-md font-semibold text-ink">Righe</h2>
        <span className="text-xs text-ink-muted">
          {lines.length} rig{lines.length === 1 ? 'a' : 'he'}
        </span>
      </header>

      {lines.length === 0 ? (
        <EmptyState
          title="Nessuna riga ancora"
          description="Scansiona i colli con la fotocamera, importa un DDT oppure aggiungi le righe manualmente qui sotto."
          bare
        />
      ) : (
        <ul className="divide-y divide-divider">
          {lines.map((line) => (
            <LineRow
              key={line.id}
              line={line}
              receiptId={receiptId}
              mode={mode}
              catalog={catalog}
              editable={editable}
            />
          ))}
        </ul>
      )}

      {editable && <AddLineForm receiptId={receiptId} mode={mode} catalog={catalog} />}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function LineRow({
  line,
  receiptId,
  mode,
  catalog,
  editable,
}: {
  line: ReceiptLineView;
  receiptId: string;
  mode: ReceiptMode;
  catalog: CatalogProductRef[];
  editable: boolean;
}) {
  const [qty, setQty] = useState(String(line.qtyReceived));
  const [lot, setLot] = useState(line.lotNumber ?? '');
  const [expiry, setExpiry] = useState(line.expiryDate ?? '');
  const [pickedProduct, setPickedProduct] = useState('');
  const [discrepancyOpen, setDiscrepancyOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [state, setState] = useState<ActionState>(IDLE_STATE);
  const [pending, startTransition] = useTransition();

  const mismatch =
    line.qtyExpected !== null && line.qtyReceived !== line.qtyExpected && line.qtyReceived > 0;
  const dirty =
    qty !== String(line.qtyReceived) || lot !== (line.lotNumber ?? '') || expiry !== (line.expiryDate ?? '');

  function run(action: (prev: ActionState, fd: FormData) => Promise<ActionState>, fd: FormData) {
    fd.set('mode', mode);
    fd.set('receiptId', receiptId);
    startTransition(async () => setState(await action(IDLE_STATE, fd)));
  }

  function saveLine() {
    const fd = new FormData();
    fd.set('lineId', line.id);
    fd.set('qtyReceived', qty);
    fd.set('lotNumber', lot);
    fd.set('expiryDate', expiry);
    run(updateLineAction, fd);
  }

  return (
    <li className={cn('px-4 py-3 space-y-2', line.lineStatus === 'discrepancy' && 'bg-danger-light/50')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink truncate">
            {line.productName ?? line.rawProductName}
          </p>
          <p className="text-xs text-ink-muted truncate">
            {[
              line.productName && line.productName !== line.rawProductName ? `DDT: ${line.rawProductName}` : null,
              line.sku ? `SKU ${line.sku}` : null,
              line.barcode ? `cod. ${line.barcode}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || '—'}
          </p>
        </div>
        <Badge variant={RECEIPT_LINE_BADGE[line.lineStatus]} size="sm">
          {LINE_STATUS_LABELS[line.lineStatus]}
        </Badge>
      </div>

      {/* attesa vs ricevuta */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-ink-muted">
          Atteso:{' '}
          <span className="font-mono tnum text-ink">
            {line.qtyExpected !== null ? `${line.qtyExpected} ${line.unit}` : '—'}
          </span>
        </span>
        <span className={cn('text-ink-muted', mismatch && 'text-warning-strong font-medium')}>
          Ricevuto:{' '}
          <span className="font-mono tnum">
            {line.qtyReceived} {line.unit}
          </span>
          {mismatch && (
            <AlertTriangle size={14} aria-hidden="true" className="inline-block ml-1 -mt-0.5" />
          )}
        </span>
        {line.qtyPosted > 0 && (
          <span className="text-xs text-ink-faint">a magazzino: {line.qtyPosted} {line.unit}</span>
        )}
        {line.discrepancyReason && (
          <span className="basis-full text-xs text-danger">Discrepanza: {line.discrepancyReason}</span>
        )}
      </div>

      {editable && (
        <>
          {/* matching mancante → risoluzione manuale o creazione prodotto */}
          {!line.productId && (
            <div className="flex flex-wrap items-end gap-2 rounded-md bg-warning-light px-3 py-2">
              <Select
                label="Prodotto non riconosciuto — associa dal catalogo"
                value={pickedProduct}
                onChange={(e) => setPickedProduct(e.target.value)}
                wrapClassName="flex-1 min-w-[200px]"
              >
                <option value="">Seleziona prodotto…</option>
                {catalog.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.unit})
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="secondary"
                disabled={!pickedProduct}
                loading={pending}
                onClick={() => {
                  const fd = new FormData();
                  fd.set('lineId', line.id);
                  fd.set('productId', pickedProduct);
                  run(resolveLineProductAction, fd);
                }}
              >
                Associa
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCreateOpen(true)}>
                <PackagePlus size={14} aria-hidden="true" /> Crea prodotto
              </Button>
            </div>
          )}

          {/* qty / lotto / scadenza */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
            <Input
              label={`Ricevuto (${line.unit})`}
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
            <Input label="Lotto" value={lot} onChange={(e) => setLot(e.target.value)} placeholder="—" />
            <Input label="Scadenza" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" fullWidth disabled={!dirty} loading={pending} onClick={saveLine}>
                <Save size={14} aria-hidden="true" /> Salva
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                onClick={() => setDiscrepancyOpen(true)}
                aria-label="Segnala discrepanza su questa riga"
              >
                <AlertTriangle size={14} aria-hidden="true" />
              </Button>
            </div>
          </div>
        </>
      )}

      {state.status === 'error' && (
        <p role="alert" className="text-xs text-danger">{state.error}</p>
      )}

      {/* ── Dati GS1 rilevati (collapsible, leggera; visibile anche da chiusa) ── */}
      {(line.gs1Ai || line.sscc || line.gs1Raw) && (
        <details className="rounded-md bg-surface-offset/60 px-3 py-2">
          <summary className="cursor-pointer select-none text-xs font-medium text-ink-muted">
            Dati GS1 rilevati{line.sscc ? ' · SSCC (collo/pallet)' : ''}
          </summary>
          <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-xs">
            {gs1DetailRows(line.gs1Ai).map((r) => (
              <Fragment key={r.code}>
                <dt className="text-ink-muted">{r.label}</dt>
                <dd className="font-mono text-ink break-all">{r.value}</dd>
              </Fragment>
            ))}
          </dl>
          {line.gs1Raw && (
            <p className="mt-2 text-[11px] text-ink-faint break-all">
              raw: <span className="font-mono">{line.gs1Raw}</span>
            </p>
          )}
        </details>
      )}

      {/* ── Dialog discrepanza ───────────────────────────────────────────── */}
      {/* Montati SOLO da aperti: niente N×2 istanze di Modal nel fiber tree per
          una lista lunga, e lo stato del dialog parte pulito a ogni apertura. */}
      {discrepancyOpen && (
        <DiscrepancyDialog
          onClose={() => setDiscrepancyOpen(false)}
          line={line}
          onSubmit={(reason, receivedQty) => {
            const fd = new FormData();
            fd.set('lineId', line.id);
            fd.set('qtyReceived', receivedQty);
            fd.set('discrepancyReason', reason);
            run(updateLineAction, fd);
            setDiscrepancyOpen(false);
          }}
        />
      )}

      {/* ── Modal crea prodotto al volo ──────────────────────────────────── */}
      {createOpen && (
        <CreateProductModal
          onClose={() => setCreateOpen(false)}
          line={line}
          pending={pending}
          onSubmit={(name, unit) => {
            const fd = new FormData();
            fd.set('lineId', line.id);
            fd.set('name', name);
            fd.set('unit', unit);
            if (line.barcode) fd.set('barcode', line.barcode);
            if (line.sku) fd.set('sku', line.sku);
            run(createProductFromLineAction, fd);
            setCreateOpen(false);
          }}
        />
      )}
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function DiscrepancyDialog({
  onClose,
  line,
  onSubmit,
}: {
  onClose: () => void;
  line: ReceiptLineView;
  onSubmit: (reason: string, qtyReceived: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [qty, setQty] = useState(String(line.qtyReceived));

  return (
    <Modal
      open
      onClose={onClose}
      title="Segnala discrepanza"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Annulla</Button>
          <Button
            variant="danger"
            disabled={reason.trim().length < 3}
            onClick={() => onSubmit(reason.trim(), qty)}
          >
            Registra discrepanza
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">
          {line.qtyExpected !== null
            ? `Attesi ${line.qtyExpected} ${line.unit}, ricevuti ${qty || 0} ${line.unit}.`
            : 'Indica cosa non corrisponde su questa riga.'}{' '}
          La discrepanza resta tracciata e visibile al completamento.
        </p>
        <Input
          label={`Quantità effettivamente ricevuta (${line.unit})`}
          inputMode="decimal"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        <Input
          label="Motivo della discrepanza"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="es. collo danneggiato, quantità mancante, prodotto errato…"
          required
        />
      </div>
    </Modal>
  );
}

function CreateProductModal({
  onClose,
  line,
  pending,
  onSubmit,
}: {
  onClose: () => void;
  line: ReceiptLineView;
  pending: boolean;
  onSubmit: (name: string, unit: UnitOfMeasure) => void;
}) {
  const [name, setName] = useState(line.rawProductName.replace(/^Codice\s+/i, ''));
  const [unit, setUnit] = useState<UnitOfMeasure>(line.unit);

  return (
    <Modal
      open
      onClose={onClose}
      title="Crea prodotto dal ricevimento"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Annulla</Button>
          <Button loading={pending} disabled={name.trim().length < 2} onClick={() => onSubmit(name.trim(), unit)}>
            Crea e associa
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">
          Il prodotto viene aggiunto al catalogo dell&apos;organizzazione
          {line.barcode ? ` con il codice ${line.barcode} memorizzato per i prossimi scan` : ''}.
        </p>
        <Input label="Nome prodotto" value={name} onChange={(e) => setName(e.target.value)} required />
        <Select label="Unità di misura" value={unit} onChange={(e) => setUnit(e.target.value as UnitOfMeasure)}>
          {UNITS.map((u) => (
            <option key={u} value={u}>{UNIT_LABELS[u]}</option>
          ))}
        </Select>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function AddLineForm({
  receiptId,
  mode,
  catalog,
}: {
  receiptId: string;
  mode: ReceiptMode;
  catalog: CatalogProductRef[];
}) {
  const [productId, setProductId] = useState('');
  const [freeName, setFreeName] = useState('');
  const [qty, setQty] = useState('');
  const [state, setState] = useState<ActionState>(IDLE_STATE);
  const [pending, startTransition] = useTransition();

  const picked = catalog.find((p) => p.id === productId) ?? null;
  const canSubmit = (picked || freeName.trim().length >= 2) && parseFloat(qty.replace(',', '.')) > 0;

  function submit() {
    const fd = new FormData();
    fd.set('mode', mode);
    fd.set('receiptId', receiptId);
    if (picked) {
      fd.set('productId', picked.id);
      fd.set('rawProductName', picked.name);
      fd.set('unit', picked.unit);
    } else {
      fd.set('rawProductName', freeName.trim());
      fd.set('unit', 'pz');
    }
    fd.set('qtyReceived', qty);
    startTransition(async () => {
      const res = await addManualLineAction(IDLE_STATE, fd);
      setState(res);
      if (res.status === 'success') {
        setProductId('');
        setFreeName('');
        setQty('');
      }
    });
  }

  return (
    <div className="border-t border-divider px-4 py-3 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
        Aggiungi riga manualmente
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr,1fr,auto] gap-2 items-end">
        <Select
          label="Prodotto a catalogo"
          value={productId}
          onChange={(e) => { setProductId(e.target.value); if (e.target.value) setFreeName(''); }}
        >
          <option value="">— Fuori catalogo —</option>
          {catalog.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
          ))}
        </Select>
        {!picked && (
          <Input
            label="Descrizione (fuori catalogo)"
            value={freeName}
            onChange={(e) => setFreeName(e.target.value)}
            placeholder="es. Amarene sciroppate 3kg"
          />
        )}
        <Input
          label={`Quantità${picked ? ` (${picked.unit})` : ''}`}
          inputMode="decimal"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          wrapClassName={picked ? 'sm:col-start-2' : undefined}
        />
        <Button onClick={submit} disabled={!canSubmit} loading={pending} className="sm:mb-0">
          Aggiungi
        </Button>
      </div>
      {state.status === 'error' && (
        <p role="alert" className="text-xs text-danger">{state.error}</p>
      )}
    </div>
  );
}
