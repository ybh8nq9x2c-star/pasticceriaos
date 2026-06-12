'use client';

// =============================================================================
// app/(auth)/signup/page.tsx
// Pagina di registrazione. Crea solo l'utente auth;
// l'org viene creata nell'onboarding.
// =============================================================================

import { useFormState } from 'react-dom';
import Link from 'next/link';
import { IDLE_STATE } from '@/lib/utils';
import { signUpAction } from '@/modules/identity/actions';
import { Logo } from '@/components/shared/Logo';

export default function SignupPage() {
  const [state, formAction, pending] = useFormState(signUpAction, IDLE_STATE);

  return (
    <div className="space-y-8">
      <div>
        <Logo size={30} />
        <h1 className="text-xl font-bold text-ink">Crea il tuo account</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Hai già un account?{' '}
          <Link href="/login" className="text-primary font-semibold hover:underline">
            Accedi
          </Link>
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        {state.status === 'error' && (
          <div className="rounded-xl bg-danger-light border border-danger-soft p-3 text-sm text-danger">
            {state.error}
          </div>
        )}

        {state.status === 'success' && (
          <div className="rounded-xl bg-success-light border border-success-soft p-3 text-sm text-success-strong">
            Account creato! Controlla la tua email per confermare, poi accedi.
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
            autoComplete="new-password"
            minLength={8}
            placeholder="Minimo 8 caratteri"
            className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-ring focus:border-primary"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full py-3 bg-primary hover:bg-primary-hover text-primary-fg rounded-xl font-semibold text-sm transition-all disabled:opacity-60"
        >
          {pending ? 'Creazione account…' : 'Crea account'}
        </button>
      </form>

      <p className="text-xs text-center text-ink-muted">
        Dopo la registrazione configurerai la tua pasticceria nell&apos;onboarding.
      </p>
    </div>
  );
}
