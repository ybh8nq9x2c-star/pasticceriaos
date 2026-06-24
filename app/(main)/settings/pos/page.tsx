// =============================================================================
// app/(main)/settings/pos/page.tsx
// Mappature POS → ricetta. Ogni prodotto del registratore di cassa (SKU/PLU) va
// collegato a una ricetta interna perché la vendita scarichi il magazzino.
// Prodotti visti in vendita ma non mappati = "Non collegato" (badge ambra).
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { Receipt, AlertTriangle } from 'lucide-react';
import { listPosMappings, listUnmappedPosProducts, listRecipeOptions } from '@/modules/pos/service';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { PosMappingForm } from './PosMappingForm';
import { HighlightScroll } from './HighlightScroll';

export const metadata: Metadata = { title: 'Mappature POS' };

// id DOM stabile per la riga di un prodotto POS (per evidenziazione + scroll).
const rowId = (ref: string) => `pos-row-${ref.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

export default async function PosSettingsPage({ searchParams }: { searchParams: { highlight?: string } }) {
  const [mappings, unmapped, recipes] = await Promise.all([
    listPosMappings(),
    listUnmappedPosProducts(),
    listRecipeOptions(),
  ]);

  const highlight = searchParams.highlight?.trim().toLowerCase() ?? null;
  const isHi = (ref: string) => highlight !== null && ref.trim().toLowerCase() === highlight;
  const hiClass = (ref: string) => (isHi(ref) ? 'ring-2 ring-primary ring-offset-2 ring-offset-bg' : '');
  const highlightTargetId =
    highlight !== null
      ? [...unmapped.map((u) => u.externalProductRef), ...mappings.map((m) => m.posItemId)].find(
          (ref) => ref.trim().toLowerCase() === highlight,
        )
      : undefined;

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
      {highlightTargetId && <HighlightScroll targetId={rowId(highlightTargetId)} />}
      <PageHeader
        title="Mappature POS"
        subtitle="Collega ogni prodotto della cassa a una ricetta: alla vendita il magazzino si scarica da solo."
      />

      {/* Prodotti non collegati (visti in vendita, senza mappatura) */}
      {unmapped.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-base font-bold text-ink mb-1">
            <AlertTriangle className="size-4 text-warning" /> Prodotti non collegati ({unmapped.length})
          </h2>
          <p className="text-sm text-ink-muted mb-3">
            Venduti ma <strong>senza ricetta</strong>: queste vendite non hanno scaricato il magazzino. Collegali.
          </p>
          <div className="space-y-2">
            {unmapped.map((u) => (
              <div
                key={`${u.source}::${u.externalProductRef}`}
                id={rowId(u.externalProductRef)}
                className={`rounded-xl border border-warning-soft bg-warning-light/40 p-3 ${hiClass(u.externalProductRef)}`}
              >
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge variant="warning" size="sm">Non collegato</Badge>
                  <span className="text-sm font-semibold text-ink">{u.productName}</span>
                  <span className="text-xs font-mono text-ink-muted">{u.externalProductRef}</span>
                  {u.suggestedRecipeName && (
                    <span className="text-xs text-ink-muted">
                      · suggerito: <span className="font-semibold text-primary">{u.suggestedRecipeName}</span>
                    </span>
                  )}
                </div>
                <PosMappingForm
                  source={u.source}
                  posItemId={u.externalProductRef}
                  posItemName={u.productName}
                  recipeId={u.suggestedRecipeId}
                  recipes={recipes}
                  submitLabel="Collega"
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Mappature esistenti */}
      <section>
        <h2 className="text-base font-bold text-ink mb-3">Mappature attive</h2>
        {mappings.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Nessuna mappatura POS"
            description="Aggiungi una mappatura manuale qui sotto, oppure collega i prodotti man mano che arrivano dalle vendite."
          />
        ) : (
          <div className="space-y-2">
            {mappings.map((m) => (
              <div
                key={m.id}
                id={rowId(m.posItemId)}
                className={`rounded-xl border border-border bg-surface-2 p-3 ${hiClass(m.posItemId)}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-mono text-ink-muted">{m.posItemId}</span>
                  <span className="text-sm font-semibold text-ink">{m.posItemName ?? m.recipeName ?? '—'}</span>
                  <span className="text-xs text-ink-faint">→ {m.recipeName ?? 'ricetta'}</span>
                </div>
                <PosMappingForm
                  source={m.source}
                  posItemId={m.posItemId}
                  posItemName={m.posItemName}
                  recipeId={m.recipeId}
                  portionsPerUnit={m.portionsPerUnit}
                  recipes={recipes}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Aggiunta manuale */}
      <section>
        <h2 className="text-base font-bold text-ink mb-3">Aggiungi mappatura manuale</h2>
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <PosMappingForm recipes={recipes} editablePosId submitLabel="Aggiungi" />
        </div>
      </section>
    </div>
  );
}
