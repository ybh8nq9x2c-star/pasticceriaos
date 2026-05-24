// =============================================================================
// components/ui/PageHeader.tsx
// Intestazione pagina coerente: titolo Playfair + sottotitolo + azione.
// =============================================================================

import Link from 'next/link';

export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel,
  action,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      {backHref && (
        <Link
          href={backHref}
          className="text-sm text-[#6B7280] hover:text-[#1A2B4A] transition-colors"
        >
          ← {backLabel ?? 'Indietro'}
        </Link>
      )}
      <div className="flex items-start justify-between gap-4 mt-3">
        <div>
          <h1 className="font-playfair text-3xl font-bold text-[#1A2B4A] leading-tight">
            {title}
          </h1>
          {subtitle && <p className="text-sm text-[#6B7280] mt-1.5">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
