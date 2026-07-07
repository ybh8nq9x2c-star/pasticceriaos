// =============================================================================
// app/(main)/settings/pos/page.tsx — COMPATIBILITÀ deep-link.
// La configurazione POS ora vive nell'area commerciale: /sales/pos (wizard
// "Connetti il tuo POS"). Questo redirect preserva i vecchi link, incluso
// ?highlight= usato da inbox e dettaglio vendita.
// =============================================================================

import { redirect } from 'next/navigation';

export default function LegacyPosSettingsRedirect({
  searchParams,
}: {
  searchParams: { highlight?: string };
}) {
  const q = searchParams.highlight ? `?highlight=${encodeURIComponent(searchParams.highlight)}` : '';
  redirect(`/sales/pos${q}`);
}
