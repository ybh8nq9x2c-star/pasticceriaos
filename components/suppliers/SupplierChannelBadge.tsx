// =============================================================================
// <SupplierChannelBadge> — segnale visivo UNICO del canale fornitore/ordine.
// Sobrio, premium, mai rumoroso: connesso su BakeryOS (accento brand) vs
// email/manuale (neutro). variant 'short' per le liste, 'full' per hero/dettaglio.
// Presentational: la decisione del canale sta in lib/supplier-channel.
// =============================================================================

import { Link2, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CHANNEL_COPY, type SupplierChannel } from '@/lib/supplier-channel';

export function SupplierChannelBadge({
  channel,
  variant = 'short',
  size = 'sm',
  className,
}: {
  channel: SupplierChannel;
  variant?: 'short' | 'full';
  size?: 'sm' | 'md';
  className?: string;
}) {
  const isBakeryos = channel === 'bakeryos';
  const Icon = isBakeryos ? Link2 : Mail;
  const label = variant === 'full' ? CHANNEL_COPY[channel].label : CHANNEL_COPY[channel].short;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap',
        size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        isBakeryos ? 'bg-primary-light text-primary' : 'bg-neutral-light text-ink-muted',
        className,
      )}
    >
      <Icon size={size === 'sm' ? 12 : 14} aria-hidden="true" className="shrink-0" />
      {label}
    </span>
  );
}
