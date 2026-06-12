// =============================================================================
// app/(main)/dashboard/page.tsx
// OGGI — dashboard orientata all'azione. Risponde a "cosa faccio adesso?":
//   1. Situazione di oggi (piano, copertura stock, ordini clienti)
//   2. Richiede attenzione (ordini fermi, documenti, anomalie, scadenze, margini)
//   3. Azioni suggerite (contestuali, spiegabili, mai automatiche)
//   4. KPI operativi (tutti da query reali; '—' quando non ci sono dati)
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getDashboardSummary,
  getOpenOrders,
  getIngredientRequirements,
  getRecipeCosts,
  getIngredientPurchaseStats,
} from '@/modules/reporting/service';
import { getLowStockAlerts, getExpiringBatches } from '@/modules/inventory/service';
import { listDocuments } from '@/modules/documents/service';
import { listCustomerOrders } from '@/modules/customers/service';
import { requireSession } from '@/modules/identity/service';
import { formatCurrency, todayISODate } from '@/lib/utils';

export const metadata: Metadata = { title: 'Oggi' };

const ORDER_STATUS_LABELS: Record<string, string> = {
  draft: 'Bozza', sent: 'Inviato', confirmed: 'Confermato',
};

function todayLabel() {
  return new Date().toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function KpiCard({ label, value, sub, href, accentClass }: {
  label: string; value: string | number; sub?: string; href?: string; accentClass?: string;
}) {
  const inner = (
    <div className="relative rounded-2xl border border-border bg-surface-2 px-5 py-4 overflow-hidden transition-all hover:shadow-[0_4px_24px_rgba(26,43,74,0.10)] hover:-translate-y-px">
      {accentClass && <span className={`absolute top-0 left-0 h-full w-1 rounded-l-2xl ${accentClass}`} />}
      <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">{label}</p>
      <p className="text-[28px] font-bold text-ink mt-1 leading-none">{value}</p>
      {sub && <p className="text-xs text-ink-muted mt-1.5">{sub}</p>}
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

interface AttentionItem {
  emoji: string;
  text: string;
  detail: string;
  href: string;
  severity: 'red' | 'amber';
}

interface SuggestedAction {
  emoji: string;
  text: string;
  cta: string;
  href: string;
}

export default async function TodayPage() {
  const session = await requireSession();
  const today = todayISODate();

  const [summary, openOrders, stockAlerts, recipeCosts, expiring, documents, customerOrders, topSpend] =
    await Promise.all([
      getDashboardSummary(),
      getOpenOrders(),
      getLowStockAlerts(),
      getRecipeCosts(),
      getExpiringBatches(3),
      listDocuments(),
      listCustomerOrders(),
      getIngredientPurchaseStats(3),
    ]);

  // Fabbisogno del piano di oggi (se esiste): copertura stock reale.
  const todayRequirements = summary.todayPlan
    ? await getIngredientRequirements(summary.todayPlan.id)
    : [];
  const todayShortages = todayRequirements.filter((r) => r.estimatedShortage > 0);

  // ── SEZIONE 2: richiede attenzione ─────────────────────────────────────────
  const now = Date.now();
  const staleOrders = openOrders.filter(
    (o) => o.status === 'sent' && o.sentAt && now - new Date(o.sentAt).getTime() > 24 * 3600_000,
  );
  const docsToVerify = documents.filter((d) => d.documentStatus === 'received');
  const docsWithAnomalies = documents.filter((d) => d.documentStatus === 'anomaly');
  const lowMarginRecipes = recipeCosts.filter(
    (r) => r.isActive && r.marginPct !== null && r.marginPct < 30,
  );
  const negativeMarginRecipes = lowMarginRecipes.filter((r) => (r.marginPct ?? 0) < 0);

  const attention: AttentionItem[] = [];
  if (negativeMarginRecipes.length > 0) {
    attention.push({
      emoji: '🛑', severity: 'red',
      text: `Stai producendo in perdita: ${negativeMarginRecipes.map((r) => r.name).join(', ')}`,
      detail: 'food cost sopra il prezzo di vendita',
      href: '/analytics',
    });
  }
  if (docsWithAnomalies.length > 0) {
    attention.push({
      emoji: '⚠️', severity: 'red',
      text: `${docsWithAnomalies.length} ${docsWithAnomalies.length === 1 ? 'documento con anomalie' : 'documenti con anomalie'} di prezzo/quantità`,
      detail: docsWithAnomalies.map((d) => d.supplierName).filter(Boolean).slice(0, 3).join(', '),
      href: '/documents?stato=anomaly',
    });
  }
  if (expiring.length > 0) {
    attention.push({
      emoji: '⏳', severity: 'red',
      text: `${expiring.length} ${expiring.length === 1 ? 'lotto scade' : 'lotti scadono'} entro 3 giorni`,
      detail: expiring.slice(0, 3).map((b) => b.ingredientName).join(', '),
      href: '/inventory/batches',
    });
  }
  if (staleOrders.length > 0) {
    attention.push({
      emoji: '📨', severity: 'amber',
      text: `${staleOrders.length} ${staleOrders.length === 1 ? 'ordine inviato' : 'ordini inviati'} senza conferma da oltre 24h`,
      detail: staleOrders.map((o) => o.supplierName).slice(0, 3).join(', '),
      href: '/orders',
    });
  }
  if (docsToVerify.length > 0) {
    attention.push({
      emoji: '🧾', severity: 'amber',
      text: `${docsToVerify.length} ${docsToVerify.length === 1 ? 'documento da verificare' : 'documenti da verificare'}`,
      detail: 'esegui il matching con gli ordini',
      href: '/documents?stato=received',
    });
  }
  if (lowMarginRecipes.length > negativeMarginRecipes.length) {
    const risky = lowMarginRecipes.filter((r) => (r.marginPct ?? 0) >= 0);
    attention.push({
      emoji: '📉', severity: 'amber',
      text: `${risky.length} ${risky.length === 1 ? 'ricetta' : 'ricette'} con margine sotto il 30%`,
      detail: risky.slice(0, 3).map((r) => `${r.name} (${r.marginPct}%)`).join(', '),
      href: '/analytics',
    });
  }

  // ── SEZIONE 3: azioni suggerite ─────────────────────────────────────────────
  const suggested: SuggestedAction[] = [];
  if (summary.todayPlan && todayShortages.length > 0) {
    suggested.push({
      emoji: '🛒',
      text: `Mancano ${todayShortages.length} ingredienti per il piano di oggi (${todayShortages.slice(0, 3).map((s) => s.ingredientName).join(', ')})`,
      cta: 'Genera bozze ordine',
      href: `/production/${summary.todayPlan.id}`,
    });
  }
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  const ordersTomorrow = customerOrders.filter((o) => o.pickupDate === tomorrowIso);
  if (ordersTomorrow.length > 0 && !summary.todayPlan) {
    suggested.push({
      emoji: '🎂',
      text: `Hai ${ordersTomorrow.reduce((s, o) => s + o.piecesCount, 0)} pezzi da consegnare domani (${ordersTomorrow.length} ordini clienti)`,
      cta: 'Pianifica la produzione',
      href: '/production/new',
    });
  } else if (ordersTomorrow.length > 0) {
    suggested.push({
      emoji: '🎂',
      text: `${ordersTomorrow.length} ordini clienti con ritiro domani: verifica che il piano li copra`,
      cta: 'Vedi ordini',
      href: '/customers',
    });
  }
  for (const b of expiring.slice(0, 2)) {
    if (b.suggestedRecipes.length > 0) {
      suggested.push({
        emoji: '♻️',
        text: `${b.quantityRemaining} ${b.unit} di ${b.ingredientName} ${b.daysToExpiry <= 0 ? 'scadono oggi' : `scadono tra ${b.daysToExpiry}g`} — usali in: ${b.suggestedRecipes.slice(0, 2).join(', ')}`,
        cta: 'Vedi lotti',
        href: '/inventory/batches',
      });
    }
  }
  if (!summary.todayPlan) {
    suggested.push({
      emoji: '🧮',
      text: 'Nessun piano di produzione per oggi',
      cta: 'Crea il piano',
      href: '/production/new',
    });
  }

  const totalAlerts = summary.lowStockCount + summary.outOfStockCount;
  const ordersToday = customerOrders.filter((o) => o.pickupDate === today);
  const pricedRecipes = recipeCosts.filter((r) => r.isActive && r.costPerPortion !== null);
  const avgFoodCostPct = (() => {
    const withMargin = pricedRecipes.filter((r) => r.sellPricePerPortion !== null && r.sellPricePerPortion > 0);
    if (withMargin.length === 0) return null;
    const avg = withMargin.reduce((s, r) => s + ((r.costPerPortion ?? 0) / (r.sellPricePerPortion ?? 1)) * 100, 0) / withMargin.length;
    return Math.round(avg);
  })();

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-ink leading-tight">
          Buongiorno — <span className="text-primary">{session.organizationName}</span>
        </h1>
        <p className="text-sm text-ink-muted mt-1 capitalize">{todayLabel()}</p>
      </div>

      {/* ── 1 · SITUAZIONE DI OGGI ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Piano di oggi */}
        <Link
          href={summary.todayPlan ? `/production/${summary.todayPlan.id}` : '/production/new'}
          className="block bg-surface-2 rounded-2xl border border-border p-5 hover:shadow-[0_4px_24px_rgba(26,43,74,0.10)] transition-all"
        >
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Piano produzione di oggi</p>
          {summary.todayPlan ? (
            <>
              <p className="text-2xl font-bold text-ink mt-1.5">
                {summary.todayPlan.status === 'completed' ? '✅ Completato' : `${summary.todayPlan.totalPortions} porzioni`}
              </p>
              <p className="text-xs text-ink-muted mt-1">
                {summary.todayPlan.itemsCount} ricette · stato {summary.todayPlan.status === 'in_progress' ? 'in corso' : summary.todayPlan.status === 'completed' ? 'completato' : 'bozza'}
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-ink-muted mt-1.5">—</p>
              <p className="text-xs text-primary font-semibold mt-1">Crea il piano →</p>
            </>
          )}
        </Link>

        {/* Copertura stock per il piano */}
        <div className="bg-surface-2 rounded-2xl border border-border p-5">
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Stock per il piano</p>
          {!summary.todayPlan ? (
            <p className="text-2xl font-bold text-ink-muted mt-1.5">—</p>
          ) : summary.todayPlan.status === 'completed' ? (
            <p className="text-2xl font-bold text-success-strong mt-1.5">Consumato ✓</p>
          ) : todayShortages.length === 0 ? (
            <>
              <p className="text-2xl font-bold text-success-strong mt-1.5">Coperto ✓</p>
              <p className="text-xs text-ink-muted mt-1">{todayRequirements.length} ingredienti verificati</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-danger mt-1.5">
                Mancano {todayShortages.length}
              </p>
              <p className="text-xs text-ink-muted mt-1 truncate">
                {todayShortages.map((s) => s.ingredientName).join(', ')}
              </p>
            </>
          )}
        </div>

        {/* Ordini clienti oggi */}
        <Link
          href="/customers"
          className="block bg-surface-2 rounded-2xl border border-border p-5 hover:shadow-[0_4px_24px_rgba(26,43,74,0.10)] transition-all"
        >
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Ritiri clienti oggi</p>
          {ordersToday.length === 0 ? (
            <>
              <p className="text-2xl font-bold text-ink-muted mt-1.5">Nessuno</p>
              <p className="text-xs text-ink-muted mt-1">nessun ritiro previsto per oggi</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-ink mt-1.5">
                {ordersToday.reduce((s, o) => s + o.piecesCount, 0)} pezzi
              </p>
              <p className="text-xs text-ink-muted mt-1 truncate">
                {ordersToday.map((o) => `${o.customerName}${o.pickupTime ? ` (${o.pickupTime.slice(0, 5)})` : ''}`).join(', ')}
              </p>
            </>
          )}
        </Link>
      </div>

      {/* ── 2 · RICHIEDE ATTENZIONE ────────────────────────────────────────── */}
      <div>
        <h2 className="font-semibold text-sm text-ink-muted uppercase tracking-wide mb-3">Richiede attenzione</h2>
        {attention.length === 0 ? (
          <div className="bg-surface-2 rounded-2xl border border-border px-6 py-5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-success-light flex items-center justify-center">
              <span className="text-success-strong font-bold">✓</span>
            </div>
            <p className="text-sm text-ink-muted">Tutto sotto controllo: nessuna anomalia, scadenza o ordine fermo.</p>
          </div>
        ) : (
          <div className="bg-surface-2 rounded-2xl border border-border divide-y divide-divider overflow-hidden">
            {attention.map((item, i) => (
              <Link key={i} href={item.href} className="flex items-center gap-4 px-6 py-3.5 hover:bg-surface-offset transition-colors group">
                <span className="text-xl leading-none shrink-0">{item.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${item.severity === 'red' ? 'text-danger' : 'text-ink'}`}>
                    {item.text}
                  </p>
                  {item.detail && <p className="text-xs text-ink-muted mt-0.5 truncate">{item.detail}</p>}
                </div>
                <span className="text-xs font-semibold text-primary group-hover:underline shrink-0">Apri →</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── 3 · AZIONI SUGGERITE ───────────────────────────────────────────── */}
      {suggested.length > 0 && (
        <div>
          <h2 className="font-semibold text-sm text-ink-muted uppercase tracking-wide mb-3">Azioni suggerite</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {suggested.slice(0, 4).map((a, i) => (
              <div key={i} className="bg-surface-2 rounded-2xl border border-border p-5 text-ink flex items-start gap-3 shadow-sm">
                <span className="text-xl leading-none shrink-0">{a.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug">{a.text}</p>
                  <Link href={a.href} className="inline-block mt-2 text-xs font-semibold text-primary hover:underline">
                    {a.cta} →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 4 · KPI OPERATIVI (tutti da query reali) ───────────────────────── */}
      <div>
        <h2 className="font-semibold text-sm text-ink-muted uppercase tracking-wide mb-3">KPI operativi</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            label="Spesa mese corrente"
            value={summary.monthSpend > 0 ? `€${formatCurrency(summary.monthSpend)}` : '—'}
            sub={summary.monthOrdersReceived > 0 ? `${summary.monthOrdersReceived} ordini ricevuti` : 'in attesa di dati'}
            href="/analytics"
            accentClass={summary.monthSpend > 0 ? 'bg-primary' : undefined}
          />
          <KpiCard
            label="Food cost medio"
            value={avgFoodCostPct !== null ? `${avgFoodCostPct}%` : '—'}
            sub={avgFoodCostPct !== null ? `${pricedRecipes.length} ricette prezzate` : 'imposta prezzi di vendita'}
            href="/analytics"
            accentClass={avgFoodCostPct !== null ? (avgFoodCostPct <= 40 ? 'bg-success' : 'bg-warning') : undefined}
          />
          <KpiCard
            label="Ordini in corso"
            value={summary.openOrdersCount}
            sub={
              summary.openOrdersTotalValue !== null && summary.openOrdersCount > 0
                ? `valore €${formatCurrency(summary.openOrdersTotalValue)}`
                : summary.openOrdersCount > 0 ? 'valore parziale' : 'nessun ordine aperto'
            }
            href="/orders"
            accentClass={summary.openOrdersCount > 0 ? 'bg-primary' : undefined}
          />
          <KpiCard
            label="Sotto soglia"
            value={totalAlerts}
            sub={
              summary.outOfStockCount > 0 ? `${summary.outOfStockCount} esauriti` :
              totalAlerts > 0 ? 'scorte in alert' : 'scorte OK'
            }
            href="/inventory"
            accentClass={
              summary.outOfStockCount > 0 ? 'bg-danger' :
              totalAlerts > 0 ? 'bg-warning' : 'bg-success'
            }
          />
        </div>
      </div>

      {/* Ordini aperti + top spesa (sintesi operative) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="bg-surface-2 rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-divider">
            <h2 className="font-semibold text-[15px] text-ink">Ordini fornitore aperti</h2>
            <Link href="/orders" className="text-xs font-semibold text-primary hover:underline">Tutti →</Link>
          </div>
          {openOrders.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-muted text-center">
              Nessun ordine aperto. Le bozze si generano dal piano produzione.
            </p>
          ) : (
            <div className="divide-y divide-divider">
              {openOrders.slice(0, 5).map((o) => (
                <Link key={o.orderId} href={`/orders/${o.orderId}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-offset transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{o.supplierName}</p>
                    <p className="text-xs text-ink-muted font-mono mt-0.5">{o.orderDate} · {o.lineItemsCount} righe</p>
                  </div>
                  {o.totalAmount !== null && (
                    <span className="text-xs font-mono font-semibold text-ink">€{formatCurrency(o.totalAmount)}</span>
                  )}
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-light text-primary-hover">
                    {ORDER_STATUS_LABELS[o.status] ?? o.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-surface-2 rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-divider">
            <h2 className="font-semibold text-[15px] text-ink">Scorte critiche</h2>
            <Link href="/inventory" className="text-xs font-semibold text-primary hover:underline">Magazzino →</Link>
          </div>
          {stockAlerts.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-muted text-center">Tutte le scorte sono sopra soglia. ✓</p>
          ) : (
            <div className="divide-y divide-divider">
              {stockAlerts.slice(0, 5).map((a) => (
                <div key={a.ingredientProductId} className="flex items-center gap-3 px-5 py-3">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${a.alertLevel === 'out_of_stock' ? 'bg-danger' : a.alertLevel === 'critical' ? 'bg-warning' : 'bg-primary'}`} />
                  <span className="flex-1 text-sm text-ink truncate">{a.ingredientName}</span>
                  <span className="text-xs font-mono text-ink-muted">{a.currentQuantity}/{a.minThreshold} {a.unit}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top spesa ingredienti (se ci sono acquisti reali) */}
      {topSpend.length > 0 && (
        <div className="bg-surface-2 rounded-2xl border border-border px-6 py-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Top ingredienti per spesa</p>
            <Link href="/analytics" className="text-xs font-semibold text-primary hover:underline">Analisi →</Link>
          </div>
          <div className="mt-3 space-y-2">
            {topSpend.map((item, idx) => {
              const max = topSpend[0]?.totalSpend || 1;
              return (
                <div key={item.ingredientProductId} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-ink-muted w-4">{idx + 1}</span>
                  <span className="text-sm text-ink w-40 truncate">{item.ingredientName}</span>
                  <div className="flex-1 h-2 bg-surface-offset rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${Math.max(4, Math.round((item.totalSpend / max) * 100))}%` }} />
                  </div>
                  <span className="text-xs font-mono font-semibold text-ink w-20 text-right">€{formatCurrency(item.totalSpend)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
