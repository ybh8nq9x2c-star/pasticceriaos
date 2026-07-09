import Link from 'next/link';
import { listConnectedSuppliers, listCatalogForConnection } from '@/modules/marketplace/service';
import { matchDraftLinesToCatalog, UNMATCHED_REASON_COPY, type DraftMatchResult } from '@/modules/marketplace/draft-match';
import { getOrder } from '@/modules/ordering/service';
import { getSupplier } from '@/modules/catalog/service';
import { OrderComposer } from '@/components/marketplace/OrderComposer';

export default async function NewMarketplaceOrderPage({
  searchParams,
}: { searchParams: { connection?: string; fromDraft?: string } }) {
  const { connection, fromDraft } = searchParams;
  const suppliers = await listConnectedSuppliers();

  // No supplier chosen yet → let the customer pick one.
  if (!connection) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold mb-4">Nuovo ordine</h1>
        <p className="text-sm text-ink-muted mb-4">Scegli un fornitore collegato:</p>
        <div className="bg-surface-2 rounded-2xl border border-border divide-y divide-divider">
          {suppliers.length === 0 && <p className="p-6 text-center text-ink-muted">Nessun fornitore collegato. Vai su <Link href="/suppliers" className="text-primary underline">Fornitori</Link>.</p>}
          {suppliers.map((s) => (
            <Link key={s.connectionId} href={`/marketplace/orders/new?connection=${s.connectionId}`}
              className="flex items-center justify-between gap-2 px-4 sm:px-5 py-4 hover:bg-surface-offset min-h-[52px]"><span className="truncate">{s.supplierName}</span><span aria-hidden>→</span></Link>
          ))}
        </div>
      </div>
    );
  }

  const supplier = suppliers.find((s) => s.connectionId === connection);
  const catalog = await listCatalogForConnection(connection);

  // Conversione bozza PO standard → ordine condiviso: precompila le quantità
  // matchando le righe della bozza sul catalogo (nome + unità convertibile).
  // La bozza viene annullata SOLO dopo l'invio riuscito (vedi placeOrderAction).
  let match: DraftMatchResult | null = null;
  let draftId: string | null = null;
  if (fromDraft) {
    try {
      const draft = await getOrder(fromDraft); // org-checked (RLS + assert)
      const draftSupplier = await getSupplier(draft.supplierId);
      // La bozza deve essere DAVVERO una bozza e appartenere allo stesso
      // fornitore della connessione scelta — altrimenti ignora il prefill.
      if (draft.status === 'draft' && supplier && draftSupplier.supplierOrgId === supplier.supplierOrgId) {
        match = matchDraftLinesToCatalog(
          draft.lineItems.map((li) => ({ name: li.ingredientName, quantity: li.quantity, unit: li.unitSnapshot })),
          catalog.map((c) => ({ id: c.id, name: c.name, unit: c.unit })),
        );
        draftId = draft.id;
      }
    } catch {
      match = null; // bozza inesistente o non accessibile → composer vuoto, onesto
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <Link href={draftId ? `/orders/${draftId}` : '/suppliers'} className="inline-flex items-center min-h-[40px] text-sm text-ink-muted hover:text-ink">
        ← {draftId ? 'Bozza ordine' : 'Fornitori'}
      </Link>
      <h1 className="text-2xl sm:text-3xl font-bold mt-1 mb-1">Nuovo ordine</h1>
      <p className="text-sm text-ink-muted mb-5 sm:mb-6">Fornitore: <strong>{supplier?.supplierName ?? '—'}</strong></p>

      {/* Esito onesto della conversione: cosa è stato precompilato e cosa NO. */}
      {match && (
        <div className="mb-5 rounded-2xl border border-primary-soft bg-primary-light/60 px-4 py-3 text-sm text-ink">
          <p>
            <strong>{match.matchedCount}</strong> rig{match.matchedCount === 1 ? 'a' : 'he'} della bozza
            precompilat{match.matchedCount === 1 ? 'a' : 'e'} dal catalogo.
            {' '}Controlla le quantità e invia: la bozza email verrà annullata automaticamente.
          </p>
          {match.unmatched.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-ink-muted">
              {match.unmatched.map((u) => (
                <li key={u.name}>
                  <strong className="text-ink">{u.name}</strong> — {UNMATCHED_REASON_COPY[u.reason]}: aggiungilo a mano o chiedi al fornitore di metterlo a catalogo.
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <OrderComposer
        connectionId={connection}
        catalog={catalog}
        initialQty={match?.initialQty}
        fromDraftId={draftId ?? undefined}
      />
    </div>
  );
}
