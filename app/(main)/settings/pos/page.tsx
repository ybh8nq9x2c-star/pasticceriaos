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

export const metadata: Metadata = { title: 'Mappature POS' };

export default async function PosSettingsPage() {
  const [mappings, unmapped, recipes] = await Promise.all([
    listPosMappings(),
    listUnmappedPosProducts(),
    listRecipeOptions(),
  ]);

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
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
              <div key={`${u.source}::${u.externalProductRef}`} className="rounded-xl border border-warning-soft bg-warning-light/40 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="warning" size="sm">Non collegato</Badge>
                  <span className="text-sm font-semibold text-ink">{u.productName}</span>
                  <span className="text-xs font-mono text-ink-muted">{u.externalProductRef}</span>
                </div>
                <PosMappingForm
                  source={u.source}
                  posItemId={u.externalProductRef}
                  posItemName={u.productName}
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
              <div key={m.id} className="rounded-xl border border-border bg-surface-2 p-3">
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
