// =============================================================================
// <StatusBadge> (marketplace) — wrapper di <Badge> con la mappa canonica
// stato→tono dell'hub lib/status.ts. Prima usava palette Tailwind hardcoded
// (bg-gray-100, bg-purple-100, …) fuori dal design system: era l'unico dominio
// senza "stesso stato = stesso colore ovunque".
// =============================================================================

import { Badge } from '@/components/ui/Badge';
import { MARKETPLACE_ORDER_BADGE } from '@/lib/status';
import { ORDER_STATUS_LABELS, type MarketplaceOrderStatus } from '@/modules/marketplace/types';

export function StatusBadge({ status }: { status: MarketplaceOrderStatus }) {
  return (
    <Badge variant={MARKETPLACE_ORDER_BADGE[status]}>
      {ORDER_STATUS_LABELS[status]}
    </Badge>
  );
}
