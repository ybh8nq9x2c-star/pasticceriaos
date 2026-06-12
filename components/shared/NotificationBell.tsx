// =============================================================================
// <NotificationBell> — campanella con conteggio alert reali (scorte critiche).
// Il conteggio arriva dal server via props: zero dati inventati.
// =============================================================================

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

export function NotificationBell({
  count,
  href,
  label,
  className,
}: {
  count: number;
  href: string;
  /** Descrizione per screen reader, es. "3 ingredienti sotto soglia". */
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={count > 0 ? label : 'Nessuna notifica'}
      className={cn(
        'relative inline-flex items-center justify-center w-9 h-9 rounded-md text-ink-muted',
        'hover:text-ink hover:bg-surface-offset transition-colors',
        className,
      )}
    >
      <Bell size={16} aria-hidden="true" />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-danger text-danger-fg text-xs font-semibold leading-4 text-center"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
