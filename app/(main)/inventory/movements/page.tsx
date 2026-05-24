// =============================================================================
// app/(main)/inventory/movements/page.tsx
// Storico movimenti di magazzino — Server Component.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { listMovements } from '@/modules/inventory/service';
import { UNIT_LABELS } from '@/lib/utils';
import type { MovementType } from '@/modules/inventory/types';

export const metadata: Metadata = { title: 'Storico movimenti' };

const MOVEMENT_LABELS: Record<MovementType, string> = {
  purchase_receipt:   'Acquisto ricevuto',
  production_usage:   'Utilizzo produzione',
  waste:              'Scarico / Scarto',
  manual_adjustment:  'Rettifica manuale',
  initial_stock:      'Stock iniziale',
  return_to_supplier: 'Reso fornitore',
};

const MOVEMENT_BADGE: Record<MovementType, string> = {
  purchase_receipt:   'bg-[#27AE60]/10 text-[#1E7E45]',
  production_usage:   'bg-[#1A2B4A]/10 text-[#1A2B4A]',
  waste:              'bg-[#C0392B]/10 text-[#C0392B]',
  manual_adjustment:  'bg-amber-100 text-amber-700',
  initial_stock:      'bg-[#2A7D6B]/10 text-[#2A7D6B]',
  return_to_supplier: 'bg-indigo-100 text-indigo-700',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('it-IT', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default async function MovementsPage() {
  const movements = await listMovements(undefined, 100);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <Link href="/inventory" className="text-sm text-[#6B7280] hover:text-[#1A2B4A] transition-colors">
            ← Magazzino
          </Link>
          <h1 className="font-playfair text-3xl font-bold text-[#1A2B4A] mt-3 leading-tight">
            Storico movimenti
          </h1>
          <p className="text-sm text-[#6B7280] mt-1.5">
            Ultimi {movements.length} movimenti registrati
          </p>
        </div>
        <Link
          href="/inventory/movement"
          className="px-4 py-2.5 bg-[#1A2B4A] text-white rounded-xl text-sm font-semibold hover:bg-[#243660] transition-colors"
        >
          + Registra movimento
        </Link>
      </div>

      {movements.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-[#E5DDD0]">
          <p className="text-4xl mb-3">📋</p>
          <p className="font-playfair text-lg font-bold text-[#1A2B4A]">Nessun movimento</p>
          <p className="text-sm text-[#6B7280] mt-1">I movimenti vengono registrati automaticamente dagli ordini e dalla produzione.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#FAF7F2] border-b border-[#E5DDD0]">
              <tr>
                <th className="text-left px-6 py-3.5 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Data</th>
                <th className="text-left px-6 py-3.5 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Tipo</th>
                <th className="text-left px-6 py-3.5 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Ingrediente</th>
                <th className="text-right px-6 py-3.5 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Δ Quantità</th>
                <th className="text-left px-6 py-3.5 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0EBE1]">
              {movements.map((mv) => (
                <tr key={mv.id} className="hover:bg-[#FAF7F2] transition-colors">
                  <td className="px-6 py-3.5 text-[#6B7280] text-xs font-mono whitespace-nowrap">
                    {formatDate(mv.createdAt)}
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${MOVEMENT_BADGE[mv.movementType]}`}>
                      {MOVEMENT_LABELS[mv.movementType]}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 font-medium text-[#1A2B4A]">
                    {mv.ingredientName}
                  </td>
                  <td className="px-6 py-3.5 text-right font-mono font-medium">
                    <span className={mv.quantityDelta >= 0 ? 'text-[#27AE60]' : 'text-[#C0392B]'}>
                      {mv.quantityDelta >= 0 ? '+' : ''}{mv.quantityDelta}
                    </span>
                    <span className="text-xs text-[#6B7280] ml-1">{UNIT_LABELS[mv.unit]}</span>
                  </td>
                  <td className="px-6 py-3.5 text-[#6B7280] text-xs max-w-xs truncate">
                    {mv.notes ?? '—'}
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
