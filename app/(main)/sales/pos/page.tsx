// =============================================================================
// app/(main)/sales/pos/page.tsx — "Connetti il tuo POS", wizard operativo.
// Sostituisce la vecchia pagina tecnica /settings/pos (che ora redirige qui).
// Sei passi, ognuno con stato reale (mai spunte finte): provider → server →
// negozio → prova → mappatura → tracking attivo. La verità viene da
// getPosHealth(); i write-path sono quelli esistenti (config, mapping, dry-run).
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, Check, Receipt } from 'lucide-react';
import {
  getPosConfig,
  getPosHealth,
  listPosMappings,
  listRecipeOptions,
  listUnmappedPosProducts,
} from '@/modules/pos/service';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { SalesTabs } from '@/components/sales/SalesTabs';
import { PosStatusCard } from '@/components/sales/PosStatusCard';
import { PosMappingForm } from './PosMappingForm';
import { PosConfigForm } from './PosConfigForm';
import { DryRunTester } from './DryRunTester';
import { HighlightScroll } from './HighlightScroll';
import { RefreshStatusButton } from './RefreshStatusButton';

export const metadata: Metadata = { title: 'Connetti il POS' };

// id DOM stabile per la riga di un prodotto POS (evidenziazione + scroll).
const rowId = (ref: string) => `pos-row-${ref.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

function StepCard({
  n, title, done, children, id,
}: {
  n: number; title: string; done: boolean; children: React.ReactNode; id?: string;
}) {
  return (
    <section id={id} className="rounded-2xl border border-border bg-surface-2 p-4 sm:p-5 scroll-mt-4">
      <div className="flex items-center gap-3 mb-3">
        <span
          aria-hidden="true"
          className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
            done ? 'bg-success-light text-success-strong' : 'bg-surface-offset text-ink-muted'
          }`}
        >
          {done ? <Check className="size-4" /> : n}
        </span>
        <h2 className="text-base font-bold text-ink flex-1">{title}</h2>
        {done && <Badge variant="success" size="sm">Fatto</Badge>}
      </div>
      {children}
    </section>
  );
}

export default async function PosWizardPage({ searchParams }: { searchParams: { highlight?: string } }) {
  const [health, config, mappings, unmapped, recipes] = await Promise.all([
    getPosHealth('mipos'),
    getPosConfig('mipos'),
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

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');
  const webhookUrl = appUrl ? `${appUrl}/api/webhooks/mipos` : '/api/webhooks/mipos';

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <SalesTabs active="pos" />
      {highlightTargetId && <HighlightScroll targetId={rowId(highlightTargetId)} />}

      <PageHeader
        title="Connetti il tuo POS"
        subtitle="Sei passi e ogni scontrino entra da solo in BakeryOS, scalando i prodotti finiti."
        action={
          <div className="flex items-center gap-2">
            <RefreshStatusButton />
            <Link
              href="/sales/inbox"
              className="px-4 py-2.5 border border-border rounded-xl text-sm font-semibold text-ink hover:bg-surface-offset transition-colors whitespace-nowrap"
            >
              Inbox eventi →
            </Link>
          </div>
        }
      />

      <div className="mb-6">
        <PosStatusCard health={health} />
      </div>

      <div className="space-y-4">
        {/* 1 · Provider */}
        <StepCard n={1} title="La tua cassa" done={health.adapterRegistered}>
          <p className="text-sm text-ink-muted">
            Provider supportato: <strong className="text-ink">MiPOS</strong>. Usi un&apos;altra cassa?
            Scrivici: l&apos;integrazione è pronta ad accoglierne altre.
          </p>
        </StepCard>

        {/* 2 · Server / webhook */}
        <StepCard n={2} title="Collega il server" done={health.webhookSecretConfigured}>
          <p className="text-sm text-ink-muted mb-2">
            Nel pannello MiPOS imposta questo indirizzo come <strong>webhook</strong> delle ricevute:
          </p>
          <input
            readOnly
            value={webhookUrl}
            className="w-full rounded-xl border border-border bg-bg px-3 py-2.5 font-mono text-xs text-ink select-all"
            aria-label="URL webhook da incollare nel pannello MiPOS"
          />
          {health.webhookSecretConfigured ? (
            <p className="text-xs text-success-strong mt-2">
              La firma di sicurezza (secret) è configurata: gli scontrini non firmati vengono rifiutati.
            </p>
          ) : (
            <p className="text-xs text-warning-strong mt-2">
              Manca la firma di sicurezza sul server (MIPOS_WEBHOOK_SECRET): senza, nessuno scontrino
              viene accettato. Chiedi a chi gestisce l&apos;installazione di configurarla.
            </p>
          )}
        </StepCard>

        {/* 3 · Store/merchant → org */}
        <StepCard n={3} title="Il tuo negozio" done={health.configActive && health.storeConfigured}>
          <PosConfigForm provider="mipos" storeId={config?.storeId ?? null} merchantCode={config?.merchantCode ?? null} />
        </StepCard>

        {/* 4 · Prova */}
        <StepCard n={4} id="prova" title="Fai una prova" done={health.processedEventsCount > 0}>
          <p className="text-sm text-ink-muted mb-3">
            Prima verifica qui come verrebbe letto uno scontrino (nessuna scrittura), poi{' '}
            <strong>batti uno scontrino di prova reale dalla cassa</strong>: quando compare
            nell&apos;inbox, il collegamento è vivo.
          </p>
          <DryRunTester provider="mipos" />
        </StepCard>

        {/* 5 · Mappatura prodotti */}
        <StepCard
          n={5}
          id="mappatura"
          title="Collega i prodotti alle ricette"
          done={health.mappingsCount > 0 && health.unmappedCount === 0}
        >
          <p className="text-sm text-ink-muted mb-3">
            Ogni prodotto della cassa va collegato a una ricetta: è così che la vendita scala i{' '}
            <strong>prodotti finiti</strong> (le materie prime si muovono in produzione, mai qui).
          </p>

          {unmapped.length > 0 && (
            <div className="mb-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-ink mb-2">
                <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
                Da collegare ({unmapped.length})
              </h3>
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
            </div>
          )}

          <h3 className="text-sm font-bold text-ink mb-2">Mappature attive ({mappings.length})</h3>
          {mappings.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Nessuna mappatura"
              description="Aggiungine una qui sotto, oppure collega i prodotti man mano che arrivano dalle vendite."
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

          <div className="mt-4">
            <h3 className="text-sm font-bold text-ink mb-2">Aggiungi a mano</h3>
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <PosMappingForm recipes={recipes} editablePosId submitLabel="Aggiungi" />
            </div>
          </div>
        </StepCard>

        {/* 6 · Live */}
        <StepCard n={6} title="Tracking attivo" done={health.readyForLive && health.failedCount === 0}>
          {health.readyForLive ? (
            <p className="text-sm text-success-strong">
              Tutto collegato: ogni scontrino entra in BakeryOS, le vendite scalano i prodotti finiti e
              le anomalie finiscono nell&apos;<Link href="/sales/inbox" className="underline">inbox</Link>.
            </p>
          ) : (
            <p className="text-sm text-ink-muted">
              Completa i passi sopra: questo punto diventa verde da solo quando il primo scontrino
              reale è stato elaborato. Niente spunte finte.
            </p>
          )}
        </StepCard>
      </div>
    </div>
  );
}
