'use client';

// Renders only the status transitions the current side is allowed to perform.
// The DB trigger + service re-enforce this; this is just UX.

import { useFormState } from 'react-dom';
import { IDLE_STATE } from '@/lib/utils';
import { changeOrderStatusAction } from '@/modules/marketplace/actions';
import {
  ORDER_STATUS_LABELS, canTransition,
  type MarketplaceOrderStatus, type AccountType,
} from '@/modules/marketplace/types';

const ALL: MarketplaceOrderStatus[] = [
  'draft', 'submitted', 'accepted', 'in_preparation', 'shipped', 'delivered', 'cancelled',
];

export function StatusActions({
  orderId, status, side,
}: { orderId: string; status: MarketplaceOrderStatus; side: AccountType }) {
  const [state, formAction] = useFormState(changeOrderStatusAction, IDLE_STATE);
  const nexts = ALL.filter((to) => canTransition(status, to, side));
  if (nexts.length === 0) {
    return <p className="text-sm text-[#6B7280]">Nessuna azione disponibile in questo stato.</p>;
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      {state.status === 'error' && (
        <p role="alert" className="text-sm text-[#C0392B]">{state.error}</p>
      )}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
        {nexts.map((to) => (
          <button
            key={to}
            type="submit"
            name="toStatus"
            value={to}
            className={
              to === 'cancelled'
                ? 'w-full sm:w-auto px-4 py-3 min-h-[48px] rounded-xl border border-[#C0392B]/40 text-[#C0392B] text-sm font-semibold hover:bg-[#C0392B]/5'
                : 'w-full sm:w-auto px-4 py-3 min-h-[48px] rounded-xl bg-[#1A2B4A] text-white text-sm font-semibold hover:bg-[#243660]'
            }
          >
            → {ORDER_STATUS_LABELS[to]}
          </button>
        ))}
      </div>
    </form>
  );
}
