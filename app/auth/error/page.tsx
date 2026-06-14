// =============================================================================
// app/auth/error/page.tsx
// Pagina errore auth LEGGIBILE (niente 500/pagina tecnica). Mostra un messaggio
// chiaro e offre azioni: tornare al login o ripetere la registrazione.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/shared/Logo';

export const metadata: Metadata = { title: 'Accesso non riuscito' };

export default function AuthErrorPage({ searchParams }: { searchParams: { reason?: string } }) {
  const reason = searchParams.reason?.trim();

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6">
          <Logo size={30} className="justify-center" />
        </div>

        <div className="bg-surface-2 rounded-2xl border border-border p-8">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-warning-light flex items-center justify-center text-2xl">
            ⚠️
          </div>
          <h1 className="text-xl font-bold text-ink">Conferma non riuscita</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {reason ||
              'Il link non è valido o è scaduto. I link di conferma hanno una durata limitata e si possono usare una sola volta.'}
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <Link
              href="/login"
              className="w-full py-3 bg-primary hover:bg-primary-hover text-primary-fg rounded-xl font-semibold text-sm transition-colors"
            >
              Vai al login
            </Link>
            <Link
              href="/signup"
              className="w-full py-3 border border-border text-ink rounded-xl font-semibold text-sm hover:bg-surface-offset transition-colors"
            >
              Registrati di nuovo
            </Link>
          </div>
        </div>

        <p className="text-xs text-center text-ink-muted mt-4">
          Se hai già confermato l&apos;email, accedi normalmente dal login.
        </p>
      </div>
    </div>
  );
}
