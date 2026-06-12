'use client';

// =============================================================================
// PriceListEditor — edit inline dei prezzi (click → input → Enter salva),
// aggiunta prodotto al listino, import dall'ultimo ordine ricevuto.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { IDLE_STATE, type ActionState, formatCurrency, UNIT_SHORT } from '@/lib/utils';
import { setSupplierPriceAction, importPricesFromLastOrderAction } from '@/modules/catalog/actions';
import type { UnitOfMeasure } from '@/lib/database.types';

interface Entry {
  id: string;
  ingredientProductId: string;
  ingredientName: string;
  ingredientSku: string | null;
  unit: string;
  unitPrice: number;
  validFrom: string;
}

interface UnpricedIngredient {
  id: string;
  name: string;
  unit: UnitOfMeasure;
  currentPrice: number | null;
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function PriceListEditor({
  supplierId,
  entries,
  unpricedIngredients,
}: {
  supplierId: string;
  entries: Entry[];
  unpricedIngredients: UnpricedIngredient[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [feedback, setFeedback] = useState<ActionState>(IDLE_STATE);

  // Aggiunta nuovo prodotto al listino
  const [newIngredientId, setNewIngredientId] = useState('');
  const [newPrice, setNewPrice] = useState('');

  function submitPrice(ingredientProductId: string, unit: string, value: string) {
    const fd = new FormData();
    fd.set('supplierId', supplierId);
    fd.set('ingredientProductId', ingredientProductId);
    fd.set('unit', unit);
    fd.set('unitPrice', value);
    startTransition(async () => {
      const result = await setSupplierPriceAction(IDLE_STATE, fd);
      setFeedback(result);
      setEditingId(null);
      if (result.status === 'success') router.refresh();
    });
  }

  function handleImport() {
    startTransition(async () => {
      const result = await importPricesFromLastOrderAction(supplierId);
      setFeedback(result);
      if (result.status === 'success') router.refresh();
    });
  }

  const selectedNew = unpricedIngredients.find((i) => i.id === newIngredientId);

  return (
    <div className="space-y-5">
      {feedback.status === 'error' && (
        <div className="rounded-xl bg-danger-light border border-danger-soft p-3 text-sm text-danger">
          {feedback.error}
        </div>
      )}
      {feedback.status === 'success' && (
        <div className="rounded-xl bg-success-light border border-success-soft p-3 text-sm text-success-strong">
          ✓ {feedback.message}
        </div>
      )}

      {/* Aggiungi prodotto */}
      <div className="bg-surface-2 rounded-2xl border border-border p-5">
        <h2 className="text-sm font-semibold text-ink mb-3">Aggiungi prodotto al listino</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={newIngredientId}
            onChange={(e) => setNewIngredientId(e.target.value)}
            className="flex-1 rounded-xl border border-border px-3 py-2.5 bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary-ring"
          >
            <option value="">Seleziona ingrediente…</option>
            {unpricedIngredients.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}{i.currentPrice !== null ? ` (attuale €${formatCurrency(i.currentPrice)})` : ''}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.0001"
            min="0"
            inputMode="decimal"
            placeholder={selectedNew ? `€/${UNIT_SHORT[selectedNew.unit]}` : '€/unità'}
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            className="w-full sm:w-32 rounded-xl border border-border px-3 py-2.5 text-center font-mono focus:outline-none focus:ring-2 focus:ring-primary-ring"
          />
          <button
            disabled={!newIngredientId || !newPrice || isPending}
            onClick={() => {
              if (selectedNew) {
                submitPrice(selectedNew.id, selectedNew.unit, newPrice);
                setNewIngredientId('');
                setNewPrice('');
              }
            }}
            className="min-h-[44px] px-5 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover disabled:opacity-50"
          >
            Aggiungi
          </button>
        </div>
        {unpricedIngredients.length > 0 && (
          <p className="text-xs text-ink-muted mt-2">
            Prodotti senza prezzo concordato: {unpricedIngredients.length}
          </p>
        )}
      </div>

      {/* Listino */}
      {entries.length === 0 ? (
        <div className="bg-surface-2 rounded-2xl border border-border p-10 text-center">
          <p className="text-4xl mb-3">💶</p>
          <p className="text-lg font-bold text-ink">Listino vuoto</p>
          <p className="text-sm text-ink-muted mt-1 max-w-md mx-auto">
            Aggiungi i prezzi concordati a mano, oppure importali dall'ultimo
            ordine ricevuto da questo fornitore.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="md:hidden space-y-2">
            {entries.map((e) => (
              <div key={e.id} className="bg-surface-2 rounded-xl border border-border p-4">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{e.ingredientName}</p>
                    <p className="text-xs text-ink-muted font-mono">dal {fmtDate(e.validFrom)}</p>
                  </div>
                  <PriceCell
                    entry={e}
                    editing={editingId === e.id}
                    editValue={editValue}
                    pending={isPending}
                    onStart={() => { setEditingId(e.id); setEditValue(String(e.unitPrice)); }}
                    onChange={setEditValue}
                    onSubmit={() => submitPrice(e.ingredientProductId, e.unit, editValue)}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: tabella */}
          <div className="hidden md:block bg-surface-2 rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg border-b border-border">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Prodotto</th>
                  <th className="text-left px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">SKU</th>
                  <th className="text-right px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Prezzo</th>
                  <th className="text-right px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Dal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {entries.map((e) => (
                  <tr key={e.id} className="hover:bg-surface-offset transition-colors">
                    <td className="px-6 py-3 font-medium text-ink">{e.ingredientName}</td>
                    <td className="px-6 py-3 font-mono text-xs text-ink-muted">{e.ingredientSku ?? '—'}</td>
                    <td className="px-6 py-3 text-right">
                      <PriceCell
                        entry={e}
                        editing={editingId === e.id}
                        editValue={editValue}
                        pending={isPending}
                        onStart={() => { setEditingId(e.id); setEditValue(String(e.unitPrice)); }}
                        onChange={setEditValue}
                        onSubmit={() => submitPrice(e.ingredientProductId, e.unit, editValue)}
                        onCancel={() => setEditingId(null)}
                      />
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-xs text-ink-muted">{fmtDate(e.validFrom)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Import da ultimo ordine */}
      <button
        onClick={handleImport}
        disabled={isPending}
        className="w-full min-h-[48px] border border-border text-ink rounded-xl text-sm font-semibold hover:bg-surface-offset disabled:opacity-60 transition-colors"
      >
        {isPending ? 'Operazione in corso…' : '⬇️ Importa prezzi dall\'ultimo ordine ricevuto'}
      </button>
    </div>
  );
}

function PriceCell({
  entry, editing, editValue, pending, onStart, onChange, onSubmit, onCancel,
}: {
  entry: Entry;
  editing: boolean;
  editValue: string;
  pending: boolean;
  onStart: () => void;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  if (!editing) {
    return (
      <button
        onClick={onStart}
        title="Clicca per modificare"
        className="font-mono font-semibold text-ink hover:text-primary underline decoration-dotted underline-offset-4 min-h-[44px] px-1"
      >
        €{formatCurrency(entry.unitPrice)}/{UNIT_SHORT[entry.unit as UnitOfMeasure] ?? entry.unit}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input
        autoFocus
        type="number"
        step="0.0001"
        min="0"
        inputMode="decimal"
        value={editValue}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onSubmit(); }
          if (e.key === 'Escape') onCancel();
        }}
        className="w-24 rounded-lg border border-primary-soft px-2 py-2 text-right font-mono focus:outline-none"
      />
      <button onClick={onSubmit} disabled={pending} className="text-success-strong font-bold px-2 min-h-[44px]">✓</button>
      <button onClick={onCancel} disabled={pending} className="text-ink-muted px-1 min-h-[44px]">×</button>
    </span>
  );
}
