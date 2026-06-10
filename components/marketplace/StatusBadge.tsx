import { ORDER_STATUS_LABELS, type MarketplaceOrderStatus } from '@/modules/marketplace/types';

const COLORS: Record<MarketplaceOrderStatus, string> = {
  draft:          'bg-gray-100 text-gray-600',
  submitted:      'bg-blue-100 text-blue-700',
  accepted:       'bg-indigo-100 text-indigo-700',
  in_preparation: 'bg-amber-100 text-amber-700',
  shipped:        'bg-purple-100 text-purple-700',
  delivered:      'bg-green-100 text-green-700',
  cancelled:      'bg-red-100 text-red-700',
};

export function StatusBadge({ status }: { status: MarketplaceOrderStatus }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${COLORS[status]}`}>
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
