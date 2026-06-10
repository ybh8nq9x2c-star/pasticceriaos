'use client';

import { useEffect } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import { IDLE_STATE } from '@/lib/utils';
import { connectSupplierAction } from '@/modules/marketplace/actions';

export function ConnectSupplierForm() {
  const router = useRouter();
  const [state, action] = useFormState(connectSupplierAction, IDLE_STATE);
  useEffect(() => { if (state.status === 'success') router.refresh(); }, [state, router]);

  return (
    <form action={action} className="bg-white rounded-2xl border border-[#E5DDD0] p-5 space-y-3">
      <h2 className="font-semibold">Collega un fornitore</h2>
      <p className="text-xs text-[#6B7280]">Inserisci la chiave che ti ha condiviso il fornitore (formato PSOS-XXXX-XXXX-XXXX).</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input name="key" required placeholder="PSOS-XXXX-XXXX-XXXX" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
          className="flex-1 rounded-xl border border-[#E5DDD0] px-3 py-2.5 text-base sm:text-sm font-mono uppercase min-h-[44px]" />
        <button type="submit" className="px-4 py-2.5 rounded-xl bg-[#C9962A] text-white text-sm font-semibold hover:bg-[#b3851f] min-h-[44px]">Collega</button>
      </div>
      {state.status === 'error' && <p className="text-sm text-[#C0392B]">{state.error}</p>}
      {state.status === 'success' && <p className="text-sm text-green-700">{state.message}</p>}
    </form>
  );
}
