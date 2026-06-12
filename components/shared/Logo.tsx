// =============================================================================
// components/shared/Logo.tsx
// Marchio BakeryOs: "B" geometrica costruita da due archi sovrapposti (sezione
// di sfoglia). Monocromatico, usa currentColor: funziona da 20px a 120px e su
// qualsiasi superficie chiara/scura. Unico SVG custom consentito nell'app.
// =============================================================================

import { cn } from '@/lib/utils';

export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      {/* Stelo */}
      <path d="M9 5v22" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      {/* Lobo superiore */}
      <path
        d="M9 5h7.5a6 6 0 0 1 0 12H9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Lobo inferiore, più ampio — la "sfoglia" che cresce */}
      <path
        d="M9 17h9.5a5 5 0 0 1 0 10H9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({
  size = 24,
  withWordmark = true,
  className,
}: {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-ink', className)}>
      <LogoMark size={size} />
      {withWordmark && (
        <span className="font-semibold tracking-tight leading-none" style={{ fontSize: Math.max(14, size * 0.66) }}>
          BakeryOs
        </span>
      )}
    </span>
  );
}
