// =============================================================================
// app/(main)/settings/pos/page.tsx
// Mappature POS → ricetta. Ogni prodotto del registratore di cassa (SKU/PLU) va
// collegato a una ricetta interna perché la vendita scarichi il magazzino.
// Prodotti visti in vendita ma non mappati = "Non collegato" (badge ambra).
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { Receipt, AlertTriangle } from 'lucide-react';
import { listPosMappings, listUnmappedPosProducts, listRecipeOptions, getPosIntegrationStatus } from '@/modules/pos/service';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { PosMappingForm } from './PosMappingForm';
import { HighlightScroll } from './HighlightScroll';

export const metadata: Metadata = { title: 'Mappature POS' };

// id DOM stabile per la riga di un prodotto POS (per evidenziazione + scroll).
const rowId = (ref: string) => `pos-row-${ref.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

export default async function PosSettingsPage({ searchParams }: { searchParams: { highlight?: string } }) {
  const [mappings, unmapped, recipes, integration] = await Promise.all([
    listPosMappings(),
    listUnmappedPosProducts(),
    listRecipeOptions(),
    getPosIntegrationStatus('mipos'),
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
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-8">
      {highlightTargetId && <HighlightScroll targetId={rowId(highlightTargetId)} />}
      <PageHeader
        title="Integrazione POS"
        subtitle="Collega ogni prodotto della cassa a una ricetta: alla vendita i prodotti finiti si scalano da soli."
        action={
          <Link
            href="/sales/inbox"
            className="px-4 py-2.5 border border-border rounded-xl text-sm font-semibold text-ink hover:bg-surface-offset transition-colors whitespace-nowrap"
          >
            Inbox eventi →
          </Link>
        }
      />

      {/* Checklist di attivazione: cosa manca prima di andare live (onesta). */}
      <section className="rounded-2xl border border-border bg-surface-2 p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-base font-bold text-ink">Stato integrazione MiPOS</h2>
          {integration.readyForLive ? (
            <Badge variant="success">Pronto</Badge>
          ) : (
            <Badge variant="warning">Setup incompleto</Badge>
          )}
        </div>
        <ul className="space-y-1.5 text-sm">
          {[
            { ok: integration.adapterRegistered, label: 'Adapter provider registrato' },
            { ok: integration.webhookSecretConfigured, label: 'Secret webhook configurato (server)' },
            { ok: integration.configActive, label: 'Configurazione POS attiva per questa organizzazione' },
            { ok: integration.storeConfigured, label: 'Store/merchant collegato (risoluzione organizzazione)' },
            { ok: integration.mappingsCount > 0, label: `Prodotti mappati (${integration.mappingsCount})` },
            { ok: integration.processedEventsCount > 0, label: `Almeno un evento di test elaborato (${integration.processedEventsCount})` },
          ].map((c) => (
            <li key={c.label} className="flex items-center gap-2">
              <span className={c.ok ? 'text-success-strong' : 'text-ink-faint'}>{c.ok ? '✓' : '○'}</span>
              <span className={c.ok ? 'text-ink' : 'text-ink-muted'}>{c.label}</span>
            </li>
          ))}
        </ul>
        {integration.lastEventAt && (
          <p className="mt-3 text-xs text-ink-muted">
            Ultimo evento ricevuto: {new Date(integration.lastEventAt).toLocaleString('it-IT')}
          </p>
        )}
        {!integration.readyForLive && (
          <p className="mt-3 text-xs text-warning-strong">
            Non attivare il POS live finché tutti i punti non sono verdi. Puoi collaudare con un evento di
            prova (dry-run) senza toccare il magazzino.
          </p>
        )}
      </section>

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
