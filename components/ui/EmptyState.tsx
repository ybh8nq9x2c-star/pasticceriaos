// =============================================================================
// components/ui/EmptyState.tsx
// Stato vuoto coerente con CTA opzionale.
// =============================================================================

import Link from 'next/link';

export function EmptyState({
  emoji,
  title,
  description,
  ctaHref,
  ctaLabel,
}: {
  emoji: string;
  title: string;
  description?: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div className="text-center py-20 bg-white rounded-2xl border border-[#E5DDD0]">
      <p className="text-4xl mb-3">{emoji}</p>
      <p className="font-playfair text-lg font-bold text-[#1A2B4A]">{title}</p>
      {description && (
        <p className="text-sm text-[#6B7280] mt-1 mb-6 max-w-sm mx-auto">{description}</p>
      )}
      {ctaHref && ctaLabel && (
        <Link
          href={ctaHref}
          className="inline-flex items-center px-5 py-2.5 bg-[#1A2B4A] text-white rounded-xl text-sm font-semibold hover:bg-[#243660] transition-colors"
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}
