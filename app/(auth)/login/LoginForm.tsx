'use client';

// =============================================================================
// app/(auth)/login/LoginForm.tsx
// Form di login (client). `next` arriva come prop dal Server Component padre
// (niente useSearchParams → niente Suspense/prerender issues). Stato di
// caricamento reale via useFormStatus.
// =============================================================================

import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { IDLE_STATE } from '@/lib/utils';
import { signInAction } from '@/modules/identity/actions';
import { Logo } from '@/components/shared/Logo';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className="w-full py-3 bg-primary hover:bg-primary-hover text-primary-fg rounded-xl font-semibold text-sm transition-all disabled:opacity-60"
    >
      {pending ? 'Accesso in corso…' : 'Accedi'}
    </button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useFormState(signInAction, IDLE_STATE);

  return (
    <div className="space-y-8">
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
        {next && <input type="hidden" name="next" value={next} />}

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

        <SubmitButton />
      </form>
    </div>
  );
}
