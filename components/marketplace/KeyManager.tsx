'use client';

import { useEffect } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import { IDLE_STATE } from '@/lib/utils';
import { generateKeyAction, revokeKeyAction } from '@/modules/marketplace/actions';
import type { ConnectionKeyView } from '@/modules/marketplace/types';

export function KeyManager({ keys }: { keys: ConnectionKeyView[] }) {
  const router = useRouter();
  const [genState, genAction] = useFormState(generateKeyAction, IDLE_STATE);
  const [revState, revAction] = useFormState(revokeKeyAction, IDLE_STATE);

  useEffect(() => { if (revState.status === 'success') router.refresh(); }, [revState, router]);
  useEffect(() => { if (genState.status === 'success') router.refresh(); }, [genState, router]);

  // On success the action returns the one-time plaintext key in `message`.
  const newKey = genState.status === 'success' ? genState.message : null;

  return (
    <div className="space-y-6">
      <form action={genAction} className="bg-surface-2 rounded-2xl border border-border p-5 space-y-3">
        <h2 className="font-semibold">Genera una nuova chiave</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input name="label" placeholder="Etichetta (es. Bar Centrale)"
            className="flex-1 rounded-xl border border-border px-3 py-2.5 text-base sm:text-sm min-h-[44px]" />
          <button type="submit" className="px-4 py-2.5 rounded-xl bg-primary text-primary-fg text-sm font-semibold hover:bg-primary-hover min-h-[44px]">
            Genera
          </button>
        </div>
        {genState.status === 'error' && <p className="text-sm text-danger">{genState.error}</p>}
        {newKey && (
          <div className="rounded-xl bg-primary-light border border-primary-soft p-4">
            <p className="text-xs text-ink-muted mb-1">Condividi questa chiave col cliente. Viene mostrata una sola volta:</p>
            <code className="block break-all text-base sm:text-lg font-mono font-bold tracking-wider text-ink select-all">{newKey}</code>
          </div>
        )}
      </form>

      {/* Mobile: card stack */}
      <ul className="md:hidden space-y-3">
        {keys.length === 0 && <li className="bg-surface-2 rounded-2xl border border-border p-6 text-center text-ink-muted">Nessuna chiave generata.</li>}
        {keys.map((k) => (
          <li key={k.id} className="bg-surface-2 rounded-2xl border border-border p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono font-semibold truncate">{k.keyPrefix}…</p>
              <p className="text-xs text-ink-muted truncate">{k.label ?? '—'}</p>
            </div>
            <div className="shrink-0 text-right">
              {k.isActive
                ? <span className="badge badge-green">Attiva</span>
                : <span className="badge badge-gray">Revocata</span>}
              {k.isActive && (
                <form action={revAction} className="mt-2">
                  <input type="hidden" name="keyId" value={k.id} />
                  <button type="submit" className="text-danger text-xs font-semibold hover:underline min-h-[36px]">Revoca</button>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Tablet/desktop: table */}
      <div className="hidden md:block bg-surface-2 rounded-2xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg text-ink-muted text-xs uppercase">
            <tr><th className="text-left px-4 py-3">Prefisso</th><th className="text-left px-4 py-3">Etichetta</th><th className="text-left px-4 py-3">Stato</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody>
            {keys.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-muted">Nessuna chiave generata.</td></tr>}
            {keys.map((k) => (
              <tr key={k.id} className="border-t border-divider">
                <td className="px-4 py-3 font-mono">{k.keyPrefix}…</td>
                <td className="px-4 py-3">{k.label ?? '—'}</td>
                <td className="px-4 py-3">{k.isActive ? <span className="text-green-700">Attiva</span> : <span className="text-ink-muted">Revocata</span>}</td>
                <td className="px-4 py-3 text-right">
                  {k.isActive && (
                    <form action={revAction}>
                      <input type="hidden" name="keyId" value={k.id} />
                      <button type="submit" className="text-danger text-xs font-semibold hover:underline">Revoca</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {revState.status === 'error' && <p className="text-sm text-danger p-3">{revState.error}</p>}
      </div>
    </div>
  );
}
