'use client';

// =============================================================================
// Wizard "Nuovo ricevimento": due percorsi equivalenti, mai bloccanti.
//   <ImportDdtCard>   — upload PDF → parsing → receipt atteso
//   <NewReceiptForm>  — ricevimento libero o collegato a un ordine aperto
// Stesse server actions per bakery e supplier (prop `mode`).
// =============================================================================

import { useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { FileUp, PackagePlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { createReceiptAction, importDdtAction } from '@/modules/goods-receipts/actions';
import type { ReceivableOrder, SupplierOption } from '@/modules/goods-receipts/service';
import type { ReceiptMode } from '@/modules/goods-receipts/types';
import { IDLE_STATE } from '@/lib/utils';

function SubmitButton({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} fullWidth>
      {icon}
      {children}
    </Button>
  );
}

function SupplierSelect({
  suppliers,
  value,
  onChange,
  hint,
}: {
  suppliers: SupplierOption[];
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <Select
      label="Fornitore"
      name="supplierId"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      hint={hint}
    >
      <option value="">— Non specificato —</option>
      {suppliers.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
          {s.type === 'bakeryos_connected' ? ' · connesso BakeryOs' : ''}
        </option>
      ))}
    </Select>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function ImportDdtCard({
  mode,
  suppliers,
}: {
  mode: ReceiptMode;
  suppliers: SupplierOption[];
}) {
  const [state, formAction] = useFormState(importDdtAction, IDLE_STATE);
  const [supplierId, setSupplierId] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <section className="bg-surface-2 rounded-lg border border-border shadow-sm p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-md font-semibold text-ink mb-1">
        <FileUp size={16} aria-hidden="true" className="text-ink-muted" />
        Importa DDT (PDF)
      </h2>
      <p className="text-sm text-ink-muted mb-4">
        Il documento viene letto e conservato; le righe riconosciute creano un
        ricevimento atteso da confermare con scan o manualmente.
      </p>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="mode" value={mode} />
        {state.status === 'error' && (
          <p role="alert" className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger">
            {state.error}
          </p>
        )}

        <SupplierSelect
          suppliers={suppliers}
          value={supplierId}
          onChange={setSupplierId}
          hint="Opzionale: collega il DDT all'anagrafica fornitore."
        />

        <div>
          <label htmlFor="ddt-file" className="block text-sm font-medium text-ink mb-1.5">
            File PDF <span className="text-danger">*</span>
          </label>
          <input
            id="ddt-file"
            name="file"
            type="file"
            accept="application/pdf"
            required
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            className="block w-full text-sm text-ink-muted file:mr-3 file:min-h-[44px] file:px-4 file:rounded-md file:border-0 file:bg-primary file:text-primary-fg file:text-sm file:font-medium hover:file:bg-primary-hover file:cursor-pointer"
          />
          {fileName && <p className="mt-1 text-xs text-ink-muted">Selezionato: {fileName}</p>}
        </div>

        <SubmitButton icon={<FileUp size={16} aria-hidden="true" />}>
          Importa e crea ricevimento
        </SubmitButton>
      </form>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function NewReceiptForm({
  mode,
  suppliers,
  orders,
  initialOrderId,
}: {
  mode: ReceiptMode;
  suppliers: SupplierOption[];
  orders: ReceivableOrder[];
  initialOrderId?: string;
}) {
  const [state, formAction] = useFormState(createReceiptAction, IDLE_STATE);
  // Precompilazione da deep-link ordine: ordine + fornitore già selezionati.
  const [supplierId, setSupplierId] = useState(
    () => orders.find((o) => o.id === initialOrderId)?.supplierId ?? '',
  );
  const [orderId, setOrderId] = useState(initialOrderId ?? '');

  const filteredOrders = useMemo(
    () => (supplierId ? orders.filter((o) => o.supplierId === supplierId) : orders),
    [orders, supplierId],
  );

  return (
    <section className="bg-surface-2 rounded-lg border border-border shadow-sm p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-md font-semibold text-ink mb-1">
        <PackagePlus size={16} aria-hidden="true" className="text-ink-muted" />
        Nuovo ricevimento
      </h2>
      <p className="text-sm text-ink-muted mb-4">
        Collega un ordine aperto per un ricevimento atteso, oppure parti da zero
        e registra la merce con lo scanner.
      </p>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="mode" value={mode} />
        {state.status === 'error' && (
          <p role="alert" className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger">
            {state.error}
          </p>
        )}

        <SupplierSelect
          suppliers={suppliers}
          value={supplierId}
          onChange={(v) => {
            setSupplierId(v);
            setOrderId('');
          }}
        />

        <Select
          label="Ordine da ricevere"
          name="purchaseOrderId"
          value={orderId}
          onChange={(e) => {
            setOrderId(e.target.value);
            const order = orders.find((o) => o.id === e.target.value);
            if (order?.supplierId) setSupplierId(order.supplierId);
          }}
          hint={
            filteredOrders.length === 0
              ? 'Nessun ordine aperto da collegare: il ricevimento sarà libero.'
              : 'Le righe attese vengono precompilate dall\'ordine.'
          }
        >
          <option value="">— Ricevimento libero (senza ordine) —</option>
          {filteredOrders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.supplierName} · {o.orderDate} · {o.linesCount} righe ({o.status === 'sent' ? 'inviato' : 'confermato'})
            </option>
          ))}
        </Select>

        <div className="grid grid-cols-2 gap-3">
          <Input label="N° DDT (opz.)" name="ddtNumber" placeholder="es. 142/2026" />
          <Input label="Data DDT (opz.)" name="ddtDate" type="date" />
        </div>

        <Textarea label="Note (opz.)" name="notes" rows={2} maxLength={2000} />

        <SubmitButton icon={<PackagePlus size={16} aria-hidden="true" />}>
          Crea ricevimento
        </SubmitButton>
      </form>
    </section>
  );
}
