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
        <div className="rounded-xl bg-[#C0392B]/[0.06] border border-[#C0392B]/30 p-3 text-sm text-[#C0392B]">
          {feedback.error}
        </div>
      )}
      {feedback.status === 'success' && (
        <div className="rounded-xl bg-[#27AE60]/[0.07] border border-[#27AE60]/25 p-3 text-sm text-[#1E7E45]">
          ✓ {feedback.message}
        </div>
      )}

      {/* Aggiungi prodotto */}
      <div className="bg-white rounded-2xl border border-[#E5DDD0] p-5">
        <h2 className="text-sm font-semibold text-[#1A2B4A] mb-3">Aggiungi prodotto al listino</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={newIngredientId}
            onChange={(e) => setNewIngredientId(e.target.value)}
            className="flex-1 rounded-xl border border-[#E5DDD0] px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30"
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
            className="w-full sm:w-32 rounded-xl border border-[#E5DDD0] px-3 py-2.5 text-center font-mono focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30"
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
            className="min-h-[44px] px-5 bg-[#1A2B4A] text-white rounded-xl text-sm font-semibold hover:bg-[#243660] disabled:opacity-50"
          >
            Aggiungi
          </button>
        </div>
        {unpricedIngredients.length > 0 && (
          <p className="text-xs text-[#6B7280] mt-2">
            Prodotti senza prezzo concordato: {unpricedIngredients.length}
          </p>
        )}
      </div>

      {/* Listino */}
      {entries.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-10 text-center">
          <p className="text-4xl mb-3">💶</p>
          <p className="font-playfair text-lg font-bold text-[#1A2B4A]">Listino vuoto</p>
          <p className="text-sm text-[#6B7280] mt-1 max-w-md mx-auto">
            Aggiungi i prezzi concordati a mano, oppure importali dall'ultimo
            ordine ricevuto da questo fornitore.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="md:hidden space-y-2">
            {entries.map((e) => (
              <div key={e.id} className="bg-white rounded-xl border border-[#E5DDD0] p-4">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#1A2B4A] truncate">{e.ingredientName}</p>
                    <p className="text-[11px] text-[#6B7280] font-mono">dal {fmtDate(e.validFrom)}</p>
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
          <div className="hidden md:block bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#FAF7F2] border-b border-[#E5DDD0]">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Prodotto</th>
                  <th className="text-left px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">SKU</th>
                  <th className="text-right px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Prezzo</th>
                  <th className="text-right px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Dal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EBE1]">
                {entries.map((e) => (
                  <tr key={e.id} className="hover:bg-[#FAF7F2] transition-colors">
                    <td className="px-6 py-3 font-medium text-[#1A2B4A]">{e.ingredientName}</td>
                    <td className="px-6 py-3 font-mono text-xs text-[#6B7280]">{e.ingredientSku ?? '—'}</td>
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
                    <td className="px-6 py-3 text-right font-mono text-xs text-[#6B7280]">{fmtDate(e.validFrom)}</td>
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
        className="w-full min-h-[48px] border border-[#1A2B4A]/30 text-[#1A2B4A] rounded-xl text-sm font-semibold hover:bg-[#1A2B4A]/[0.04] disabled:opacity-60 transition-colors"
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
        className="font-mono font-semibold text-[#1A2B4A] hover:text-[#C9962A] underline decoration-dotted underline-offset-4 min-h-[44px] px-1"
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
        className="w-24 rounded-lg border border-[#C9962A] px-2 py-2 text-right font-mono focus:outline-none"
      />
      <button onClick={onSubmit} disabled={pending} className="text-[#27AE60] font-bold px-2 min-h-[44px]">✓</button>
      <button onClick={onCancel} disabled={pending} className="text-[#6B7280] px-1 min-h-[44px]">×</button>
    </span>
  );
}
