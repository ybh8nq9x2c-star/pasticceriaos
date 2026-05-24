'use client';

// =============================================================================
// app/(auth)/login/page.tsx
// Pagina di login. Usa signInAction dal modulo identity.
// =============================================================================

import { useFormState } from 'react-dom';
import Link from 'next/link';
import { IDLE_STATE } from '@/lib/utils';
import { signInAction } from '@/modules/identity/actions';

export default function LoginPage() {
  const [state, formAction] = useFormState(signInAction, IDLE_STATE);
  const pending = false; // useFormStatus not available at this level in React 18

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="font-playfair text-3xl font-black mb-2">
          <span className="text-[#1A2B4A]">Pasticceria</span>
          <span className="text-[#C9962A]">OS</span>
        </div>
        <h1 className="font-playfair text-xl font-bold text-[#1A2B4A]">Accedi al tuo workspace</h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          Non hai un account?{' '}
          <Link href="/signup" className="text-[#C9962A] font-semibold hover:underline">
            Registrati
          </Link>
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        {state.status === 'error' && (
          <div className="rounded-xl bg-[#C0392B]/[0.06] border border-[#C0392B]/30 p-3 text-sm text-[#C0392B]">
            {state.error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-[#1A2B4A] mb-1.5">Email</label>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="marco@pasticceria.it"
            className="w-full rounded-xl border border-[#E5DDD0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30 focus:border-[#C9962A]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#1A2B4A] mb-1.5">Password</label>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="La tua password"
            className="w-full rounded-xl border border-[#E5DDD0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9962A]/30 focus:border-[#C9962A]"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full py-3 bg-[#1A2B4A] hover:bg-[#243660] text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-60"
        >
          {pending ? 'Accesso in corso…' : 'Accedi'}
        </button>
      </form>
    </div>
  );
}
