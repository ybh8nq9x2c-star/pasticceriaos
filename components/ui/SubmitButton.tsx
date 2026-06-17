'use client';

// =============================================================================
// <SubmitButton> — bottone submit con stato LOADING reale.
// In React 18 `useFormState` NON espone `pending` (ritorna [state, action]):
// lo stato di invio va letto con useFormStatus dentro un figlio del <form>.
// Questo componente incapsula quel pattern e preserva lo stile passato via
// className, così sostituisce 1:1 i vecchi bottoni `disabled={pending}` rotti.
// =============================================================================

import { useFormStatus } from 'react-dom';
import { Spinner } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export function SubmitButton({
  children,
  pendingLabel,
  className,
  disabled,
}: {
  children: React.ReactNode;
  /** Etichetta mostrata durante l'invio (default: i children). */
  pendingLabel?: string;
  className?: string;
  /** Disabilitazione aggiuntiva (oltre al pending automatico). */
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      className={cn('inline-flex items-center justify-center gap-2 disabled:opacity-60', className)}
    >
      {pending && <Spinner />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
