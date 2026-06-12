// =============================================================================
// <Card> — contenitore base. Niente border-left colorati, niente gradient.
// Hover state SOLO se cliccabile (interactive).
// =============================================================================

import { cn } from '@/lib/utils';

type CardProps<T extends React.ElementType> = {
  as?: T;
  interactive?: boolean;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>;

export function Card<T extends React.ElementType = 'div'>({
  as,
  interactive = false,
  className,
  children,
  ...rest
}: CardProps<T>) {
  const Tag = (as ?? 'div') as React.ElementType;
  return (
    <Tag
      className={cn(
        'bg-surface border border-border rounded-lg shadow-sm',
        interactive &&
          'transition-all duration-150 ease-smooth cursor-pointer hover:shadow-md hover:border-[color:var(--color-primary)]/20',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 px-4 py-3 border-b border-divider sm:px-5', className)}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return <h2 className={cn('text-md font-semibold text-ink', className)}>{children}</h2>;
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('p-4 sm:p-5', className)}>{children}</div>;
}

export function CardFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('px-4 py-3 border-t border-divider sm:px-5 flex items-center gap-3', className)}>
      {children}
    </div>
  );
}
