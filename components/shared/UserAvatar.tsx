// =============================================================================
// <UserAvatar> — iniziali utente su cerchio neutro.
// =============================================================================

import { cn } from '@/lib/utils';

export function UserAvatar({
  name,
  size = 28,
  className,
}: {
  /** Nome o email da cui derivare le iniziali. */
  name: string;
  size?: number;
  className?: string;
}) {
  const initial = (name.trim().charAt(0) || '?').toUpperCase();
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-primary-light text-primary font-semibold shrink-0 select-none',
        className,
      )}
    >
      {initial}
    </span>
  );
}
