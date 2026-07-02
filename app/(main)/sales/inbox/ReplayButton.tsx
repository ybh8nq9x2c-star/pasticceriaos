'use client';

// =============================================================================
// <ReplayButton> — rilancia un evento POS (failed → riesegui; unmapped → relink)
// e mostra l'esito inline. Un solo tap, feedback onesto.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { replayPosEventAction } from '@/modules/pos/actions';
import { cn } from '@/lib/utils';

export function ReplayButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function replay() {
    setMsg(null);
    startTransition(async () => {
      const res = await replayPosEventAction(eventId);
      if (res.status === 'success') {
        setMsg({ ok: true, text: res.message ?? 'Fatto.' });
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.status === 'error' ? res.error ?? 'Errore.' : 'Errore.' });
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={replay}
        disabled={pending}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border text-xs font-semibold text-ink hover:bg-surface-offset transition-colors disabled:opacity-50"
      >
        <RefreshCw size={13} className={cn(pending && 'animate-spin')} aria-hidden="true" />
        Riprova
      </button>
      {msg && (
        <span className={cn('text-xs', msg.ok ? 'text-success-strong' : 'text-danger')}>{msg.text}</span>
      )}
    </span>
  );
}
