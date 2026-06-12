'use client';

// =============================================================================
// app/(auth)/login/page.tsx
// Pagina di login. Usa signInAction dal modulo identity.
// =============================================================================

import { useFormState } from 'react-dom';
import Link from 'next/link';
import { IDLE_STATE } from '@/lib/utils';
import { signInAction } from '@/modules/identity/actions';
import { Logo } from '@/components/shared/Logo';

export default function LoginPage() {
  const [state, formAction] = useFormState(signInAction, IDLE_STATE);
  const pending = false; // useFormStatus not available at this level in React 18

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Logo size={30} />
        <h1 className="text-xl font-bold text-ink">Accedi al tuo workspace</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Non hai un account?{' '}
          <Link href="/signup" className="text-primary font-semibold hover:underline">
            Registrati
          </Link>
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        {state.status === 'error' && (
          <div className="rounded-xl bg-danger-light border border-danger-soft p-3 text-sm text-danger">
            {state.error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">Email</label>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="marco@pasticceria.it"
            className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring focus:border-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">Password</label>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="La tua password"
            className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring focus:border-primary"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full py-3 bg-primary hover:bg-primary-hover text-primary-fg rounded-xl font-semibold text-sm transition-all disabled:opacity-60"
        >
          {pending ? 'Accesso in corso…' : 'Accedi'}
        </button>
      </form>
    </div>
  );
}
