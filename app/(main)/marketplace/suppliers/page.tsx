// =============================================================================
// /marketplace/suppliers → assorbita dall'HUB /suppliers (anagrafica + canale +
// collegamento via chiave in un posto solo). Redirect permanente: un solo posto
// dove ragionare sui fornitori, zero doppioni di concetto.
// =============================================================================

import { redirect } from 'next/navigation';

export default function MarketplaceSuppliersPage() {
  redirect('/suppliers');
}
