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
import type { LucideIcon } from 'lucide-react';
import {
  Package, Ban, AlertTriangle, Hourglass, Mail, ReceiptText, TrendingDown,
  ShoppingCart, Cake, Recycle, Calculator, ChevronDown, ChefHat,
} from 'lucide-react';
import { getMobilePriorityTasks, type PriorityTaskKind } from '@/lib/priority-tasks';
import { RecordWasteButton } from '@/components/inventory/RecordWasteButton';
import { MobileTaskCard, type TaskTone } from '@/components/mobile/MobileTaskCard';
import { MobileSectionHeader } from '@/components/mobile/MobileSectionHeader';
import {
  getDashboardSummary,
  getOpenOrders,
  getIngredientRequirements,
  getRecipeCosts,
  getIngredientPurchaseStats,
  getTodayFinishedGoodsTheoreticalSummary,
  getActivationSnapshot,
} from '@/modules/reporting/service';
import { getPosConfig, getPosHealth } from '@/modules/pos/service';
import { buildCloseDaySteps } from '@/lib/close-day';
import { buildActivationTasks } from '@/lib/activation';
import { CloseDayCard } from '@/components/dashboard/CloseDayCard';
import { ActivationChecklist } from '@/components/dashboard/ActivationChecklist';
import type { DashboardSummary } from '@/modules/reporting/types';
import { getLowStockAlerts, getExpiringBatches } from '@/modules/inventory/service';
import { listReceipts } from '@/modules/goods-receipts/service';
import { listDocuments } from '@/modules/documents/service';
import { listCustomerOrders } from '@/modules/customers/service';
import { listPlans } from '@/modules/production/service';
import { isPendingConfirmation } from '@/modules/production/status';
import { requireSession } from '@/modules/identity/service';
import { formatCurrency, todayISODate } from '@/lib/utils';

export const metadata: Metadata = { title: 'Oggi' };

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
      <p className="text-[28px] font-bold text-ink mt-1 leading-none tnum">{value}</p>
      {sub && <p className="text-xs text-ink-muted mt-1.5">{sub}</p>}
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

interface AttentionItem {
  icon: LucideIcon;
  text: string;
  detail: string;
  href: string;
  severity: 'red' | 'amber';
}

interface SuggestedAction {
  icon: LucideIcon;
  text: string;
  cta: string;
  href: string;
}

export default async function TodayPage() {
  const session = await requireSession();
  const today = todayISODate();

  // RESILIENZA (P3): allSettled + fallback per sorgente → se una query fallisce, il
  // resto della dashboard resta utile (niente crash totale). Le sezioni con dati
  // mancanti degradano al loro stato vuoto; un avviso discreto segnala il degrado.
  const results = await Promise.allSettled([
    getDashboardSummary(),
    getOpenOrders(),
    getLowStockAlerts(),
    getRecipeCosts(),
    getExpiringBatches(3),
    listDocuments(),
    listCustomerOrders(),
    getIngredientPurchaseStats(3),
    listReceipts({ status: ['draft', 'expected', 'partial'] }),
    listPlans(),
    getTodayFinishedGoodsTheoreticalSummary(5),
    getPosHealth('mipos'),
    getActivationSnapshot(),
    getPosConfig('mipos'),
  ]);
  const val = <T,>(r: PromiseSettledResult<T>, fb: T): T => (r.status === 'fulfilled' ? r.value : fb);
  const emptySummary: DashboardSummary = {
    lowStockCount: 0, outOfStockCount: 0, openOrdersCount: 0, openOrdersTotalValue: null,
    activePlansCount: 0, todayPlan: null, monthSpend: 0, monthOrdersReceived: 0,
  };
  const summary = val(results[0] as PromiseSettledResult<DashboardSummary>, emptySummary);
  const openOrders = val(results[1] as PromiseSettledResult<Awaited<ReturnType<typeof getOpenOrders>>>, []);
  const stockAlerts = val(results[2] as PromiseSettledResult<Awaited<ReturnType<typeof getLowStockAlerts>>>, []);
  const recipeCosts = val(results[3] as PromiseSettledResult<Awaited<ReturnType<typeof getRecipeCosts>>>, []);
  const expiring = val(results[4] as PromiseSettledResult<Awaited<ReturnType<typeof getExpiringBatches>>>, []);
  const documents = val(results[5] as PromiseSettledResult<Awaited<ReturnType<typeof listDocuments>>>, []);
  const customerOrders = val(results[6] as PromiseSettledResult<Awaited<ReturnType<typeof listCustomerOrders>>>, []);
  const topSpend = val(results[7] as PromiseSettledResult<Awaited<ReturnType<typeof getIngredientPurchaseStats>>>, []);
  const openReceiptsRaw = val(results[8] as PromiseSettledResult<Awaited<ReturnType<typeof listReceipts>>>, []);
  const allPlans = val(results[9] as PromiseSettledResult<Awaited<ReturnType<typeof listPlans>>>, []);
  const finishedGoods = val(results[10] as PromiseSettledResult<Awaited<ReturnType<typeof getTodayFinishedGoodsTheoreticalSummary>>>, []);
  const posHealth = results[11].status === 'fulfilled'
    ? (results[11].value as Awaited<ReturnType<typeof getPosHealth>>)
    : null;
  const activation = results[12].status === 'fulfilled'
    ? (results[12].value as Awaited<ReturnType<typeof getActivationSnapshot>>)
    : null;
  const posConfig = results[13].status === 'fulfilled'
    ? (results[13].value as Awaited<ReturnType<typeof getPosConfig>>)
    : null;
  const dataDegraded = results.some((r) => r.status === 'rejected');

  // Piani passati non confermati (stato derivato, niente auto-completamento).
  const pendingPlans = allPlans.filter((p) => isPendingConfirmation(p.planDate, p.status));

  // ── CHIUDI LA GIORNATA (P0-A): i 4 passi serali in un posto solo ────────────
  // Ora locale della pasticceria (Europe/Rome): decide se il rito serale include
  // anche il piano di OGGI e l'invenduto. Logica pura testata in lib/close-day.
  const romeHour = Number(
    new Intl.DateTimeFormat('it-IT', { hour: 'numeric', hour12: false, timeZone: 'Europe/Rome' })
      .format(new Date()),
  );
  const openPlansForClose = allPlans
    .filter((p) => p.status !== 'completed' && p.status !== 'cancelled' && p.planDate <= today)
    .map((p) => ({ id: p.id, planDate: p.planDate }));
  const closeDaySteps = buildCloseDaySteps({
    pendingPlans: openPlansForClose,
    leftoverProducts: finishedGoods
      .filter((g) => g.remainingTheoretical > 0)
      .map((g) => ({ name: g.productName, remaining: g.remainingTheoretical })),
    openReceipts: openReceiptsRaw
      .filter((r) => r.linesCount > 0)
      .map((r) => ({ id: r.id, supplierName: r.supplierName })),
    posFailed: posHealth?.failedCount ?? 0,
    posUnmapped: posHealth?.unmappedCount ?? 0,
    hour: romeHour,
    today,
  });

  // ── ATTIVAZIONE GIORNO-1 (P0-E): sparisce da sola al 100% ───────────────────
  const activationView = activation
    ? buildActivationTasks({
        ...activation,
        posReady: posHealth?.readyForLive ?? false,
        posConfigured: posConfig !== null,
      })
    : null;

  // Fabbisogno del piano di oggi (se esiste): copertura stock reale. Isolato: un
  // suo errore non deve togliere il resto della dashboard.
  let todayRequirements: Awaited<ReturnType<typeof getIngredientRequirements>> = [];
  if (summary.todayPlan) {
    try {
      todayRequirements = await getIngredientRequirements(summary.todayPlan.id);
    } catch {
      todayRequirements = [];
    }
  }
  const todayShortages = todayRequirements.filter((r) => r.estimatedShortage > 0);

  // Ordini fornitore in tre secchi distinti e onesti: BOZZE da inviare (lavoro da
  // fare), IN ATTESA di consegna (inviati/confermati), PARZIALI (arrivati solo in
  // parte, da completare). Stessa verità di /orders.
  const draftOrders = openOrders.filter((o) => o.status === 'draft');
  const awaitingOrders = openOrders.filter((o) => o.status === 'sent' || o.status === 'confirmed');
  const partialOrders = openOrders.filter((o) => o.status === 'partial');
  // "In attesa di consegna" a livello KPI = tutto ciò che è inviato e non ancora
  // completo (inclusi i parziali, che attendono il resto).
  const deliveryPending = [...awaitingOrders, ...partialOrders];
  const deliveryValue =
    deliveryPending.length > 0 && deliveryPending.every((o) => o.totalAmount !== null)
      ? deliveryPending.reduce((s, o) => s + (o.totalAmount ?? 0), 0)
      : null;

  // ── "Da fare adesso" (mobile): max 2 task prioritari, logica centralizzata ──
  const priorityTasks = getMobilePriorityTasks({
    alerts: stockAlerts.map((a) => ({
      ingredientProductId: a.ingredientProductId,
      // Riordino suggerito: riporta la scorta a 2× la soglia (regola canonica).
      suggestedQty: Math.max(0, Math.round((a.minThreshold * 2 - a.currentQuantity) * 1000) / 1000),
    })),
    awaitingOrders: deliveryPending.map((o) => ({ id: o.orderId, supplierName: o.supplierName })),
    todayPlan: summary.todayPlan,
  });
  const TASK_UI: Record<PriorityTaskKind, { icon: LucideIcon; tone: TaskTone }> = {
    order_missing: { icon: ShoppingCart, tone: 'danger' },
    receive_order: { icon: Package,      tone: 'primary' },
    complete_plan: { icon: Calculator,   tone: 'warning' },
    create_plan:   { icon: ChefHat,      tone: 'primary' },
  };

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

  // Ricevimenti rimasti aperti = merce fisicamente presente ma NON ancora a
  // magazzino. È la verità del magazzino a rischio: massima priorità.
  const OPEN_RECEIPT_HOURS = 2;
  const openReceipts = openReceiptsRaw.filter(
    (r) => r.linesCount > 0 && now - new Date(r.createdAt).getTime() > OPEN_RECEIPT_HOURS * 3600_000,
  );
  if (openReceipts.length > 0) {
    attention.push({
      icon: Package, severity: 'red',
      text: `${openReceipts.length} riceviment${openReceipts.length === 1 ? 'o' : 'i'} non contabilizzat${openReceipts.length === 1 ? 'o' : 'i'}: il magazzino non è ancora aggiornato`,
      detail: openReceipts.map((r) => r.supplierName).filter(Boolean).slice(0, 3).join(', ') || 'conferma per aggiornare le giacenze',
      href: '/receipts?tab=open',
    });
  }

  // Piani di produzione passati non ancora confermati (stato derivato). Promemoria
  // soft: nessun auto-completamento, solo l'invito a chiudere esplicitamente.
  if (pendingPlans.length > 0) {
    attention.push({
      icon: Calculator, severity: 'amber',
      text: `${pendingPlans.length} pian${pendingPlans.length === 1 ? 'o' : 'i'} di produzione da confermare`,
      detail: 'produzione di giorni passati non ancora chiusa: confermala per aggiornare il magazzino',
      href: pendingPlans.length === 1 ? `/production/${pendingPlans[0].id}` : '/production',
    });
  }

  if (negativeMarginRecipes.length > 0) {
    attention.push({
      icon: Ban, severity: 'red',
      text: `Stai producendo in perdita: ${negativeMarginRecipes.map((r) => r.name).join(', ')}`,
      detail: 'food cost sopra il prezzo di vendita',
      href: '/analytics',
    });
  }
  if (docsWithAnomalies.length > 0) {
    attention.push({
      icon: AlertTriangle, severity: 'red',
      text: `${docsWithAnomalies.length} ${docsWithAnomalies.length === 1 ? 'documento con anomalie' : 'documenti con anomalie'} di prezzo/quantità`,
      detail: docsWithAnomalies.map((d) => d.supplierName).filter(Boolean).slice(0, 3).join(', '),
      href: '/documents?stato=anomaly',
    });
  }
  if (expiring.length > 0) {
    attention.push({
      icon: Hourglass, severity: 'red',
      text: `${expiring.length} ${expiring.length === 1 ? 'lotto scade' : 'lotti scadono'} entro 3 giorni`,
      detail: expiring.slice(0, 3).map((b) => b.ingredientName).join(', '),
      href: '/inventory/batches',
    });
  }
  if (staleOrders.length > 0) {
    attention.push({
      icon: Mail, severity: 'amber',
      text: `${staleOrders.length} ${staleOrders.length === 1 ? 'ordine inviato' : 'ordini inviati'} senza conferma da oltre 24h`,
      detail: staleOrders.map((o) => o.supplierName).slice(0, 3).join(', '),
      href: '/orders',
    });
  }
  if (docsToVerify.length > 0) {
    attention.push({
      icon: ReceiptText, severity: 'amber',
      text: `${docsToVerify.length} ${docsToVerify.length === 1 ? 'documento da verificare' : 'documenti da verificare'}`,
      detail: 'esegui il matching con gli ordini',
      href: '/documents?stato=received',
    });
  }
  if (lowMarginRecipes.length > negativeMarginRecipes.length) {
    const risky = lowMarginRecipes.filter((r) => (r.marginPct ?? 0) >= 0);
    attention.push({
      icon: TrendingDown, severity: 'amber',
      text: `${risky.length} ${risky.length === 1 ? 'ricetta' : 'ricette'} con margine sotto il 30%`,
      detail: risky.slice(0, 3).map((r) => `${r.name} (${r.marginPct}%)`).join(', '),
      href: '/analytics',
    });
  }

  // ── SEZIONE 3: azioni suggerite ─────────────────────────────────────────────
  const suggested: SuggestedAction[] = [];
  if (summary.todayPlan && todayShortages.length > 0) {
    suggested.push({
      icon: ShoppingCart,
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
      icon: Cake,
      text: `Hai ${ordersTomorrow.reduce((s, o) => s + o.piecesCount, 0)} pezzi da consegnare domani (${ordersTomorrow.length} ordini clienti)`,
      cta: 'Pianifica la produzione',
      href: '/production/new',
    });
  } else if (ordersTomorrow.length > 0) {
    suggested.push({
      icon: Cake,
      text: `${ordersTomorrow.length} ordini clienti con ritiro domani: verifica che il piano li copra`,
      cta: 'Vedi ordini',
      href: '/customers',
    });
  }
  for (const b of expiring.slice(0, 2)) {
    if (b.suggestedRecipes.length > 0) {
      suggested.push({
        icon: Recycle,
        text: `${b.quantityRemaining} ${b.unit} di ${b.ingredientName} ${b.daysToExpiry <= 0 ? 'scadono oggi' : `scadono tra ${b.daysToExpiry}g`} — usali in: ${b.suggestedRecipes.slice(0, 2).join(', ')}`,
        cta: 'Vedi lotti',
        href: '/inventory/batches',
      });
    }
  }
  if (!summary.todayPlan) {
    suggested.push({
      icon: Calculator,
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

  // KPI renderizzati UNA volta e riusati in due wrapper: su mobile stanno dietro
  // un <details> (informativi, non azionabili al mattino); su desktop invariati.
  const kpiGrid = (
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
        label="In attesa consegna"
        value={deliveryPending.length}
        sub={
          partialOrders.length > 0
            ? `${partialOrders.length} parzial${partialOrders.length === 1 ? 'e' : 'i'} da completare`
            : deliveryValue !== null && deliveryPending.length > 0
            ? `valore €${formatCurrency(deliveryValue)}`
            : deliveryPending.length > 0
            ? 'valore parziale'
            : draftOrders.length > 0
            ? `${draftOrders.length} bozz${draftOrders.length === 1 ? 'a' : 'e'} da inviare`
            : 'nessun ordine in attesa'
        }
        href="/orders"
        accentClass={partialOrders.length > 0 ? 'bg-warning' : deliveryPending.length > 0 ? 'bg-primary' : undefined}
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
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 lg:space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-ink leading-tight">
          Buongiorno — <span className="text-primary">{session.organizationName}</span>
        </h1>
        <p className="text-sm text-ink-muted mt-1 capitalize">{todayLabel()}</p>
      </div>

      {/* Degraded mode (P3): una sorgente non risponde → il resto resta utilizzabile. */}
      {dataDegraded && (
        <div className="rounded-2xl border border-warning-soft bg-warning-light/50 px-5 py-3 text-sm text-ink-muted">
          Alcuni dati non sono disponibili in questo momento: le sezioni interessate potrebbero risultare vuote.
          Riprova tra poco — il resto della dashboard è aggiornato.
        </div>
      )}

      {/* ── ATTIVAZIONE GIORNO-1 (P0-E): visibile solo finché incompleta ───── */}
      {activationView && <ActivationChecklist tasks={activationView.tasks} pct={activationView.pct} />}

      {/* ── CHIUDI LA GIORNATA (P0-A): il rito serale in un posto solo ─────── */}
      <CloseDayCard steps={closeDaySteps} />

      {/* ── 0 · DA FARE ADESSO (mobile): max 2 task, un tap ciascuno ───────── */}
      {priorityTasks.length > 0 && (
        <div className="lg:hidden">
          <MobileSectionHeader>Da fare adesso</MobileSectionHeader>
          <div className="space-y-2">
            {priorityTasks.map((t) => {
              const ui = TASK_UI[t.kind];
              return (
                <MobileTaskCard
                  key={t.kind}
                  href={t.href}
                  icon={ui.icon}
                  tone={ui.tone}
                  title={t.title}
                  cta={t.cta}
                />
              );
            })}
          </div>
        </div>
      )}

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
              {/* CTA contestuale (Task 1: "cosa ordinare adesso") → genera bozze ordine dal piano. */}
              <Link
                href={`/production/${summary.todayPlan.id}`}
                className="inline-block mt-2 text-xs font-semibold text-primary hover:underline"
              >
                Ordina i mancanti →
              </Link>
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
                <item.icon
                  size={20}
                  aria-hidden="true"
                  className={`shrink-0 ${item.severity === 'red' ? 'text-danger' : 'text-warning-strong'}`}
                />
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
                <a.icon size={20} aria-hidden="true" className="shrink-0 mt-0.5 text-primary" />
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

      {/* ── 4 · KPI OPERATIVI (mobile: collassati; desktop: invariati) ─────── */}
      <div>
        <details className="group lg:hidden">
          <summary className="flex items-center justify-between min-h-[44px] cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
            <span className="font-semibold text-sm text-ink-muted uppercase tracking-wide">KPI operativi</span>
            <ChevronDown size={16} aria-hidden="true" className="text-ink-faint transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2">{kpiGrid}</div>
        </details>
        <div className="hidden lg:block">
          <h2 className="font-semibold text-sm text-ink-muted uppercase tracking-wide mb-3">KPI operativi</h2>
          {kpiGrid}
        </div>
      </div>

      {/* Ordini aperti + top spesa (sintesi operative) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="bg-surface-2 rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-divider">
            <h2 className="font-semibold text-[15px] text-ink">Ordini fornitore</h2>
            <Link href="/orders" className="text-xs font-semibold text-primary hover:underline">Tutti →</Link>
          </div>
          {draftOrders.length === 0 && awaitingOrders.length === 0 && partialOrders.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-muted text-center">
              Nessun ordine aperto. Le bozze si generano dal piano produzione.
            </p>
          ) : (
            <div>
              {/* Bozze da inviare: lavoro da fare (l'utente deve mandarle al fornitore). */}
              <div className="px-5 pt-3 pb-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Bozze da inviare</span>
                <span className="text-xs font-mono text-ink-muted">{draftOrders.length}</span>
              </div>
              {draftOrders.length === 0 ? (
                <p className="px-5 pb-3 text-xs text-ink-muted">Nessuna bozza in attesa di invio.</p>
              ) : (
                <div className="divide-y divide-divider">
                  {draftOrders.slice(0, 5).map((o) => (
                    <Link key={o.orderId} href={`/orders/${o.orderId}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-offset transition-colors group">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-ink truncate">{o.supplierName}</p>
                        <p className="text-xs text-ink-muted font-mono mt-0.5">{o.orderDate} · {o.lineItemsCount} righe</p>
                      </div>
                      {o.totalAmount !== null && (
                        <span className="text-xs font-mono font-semibold text-ink">€{formatCurrency(o.totalAmount)}</span>
                      )}
                      <span className="text-xs font-semibold text-primary group-hover:underline shrink-0">Invia →</span>
                    </Link>
                  ))}
                </div>
              )}

              {/* In attesa di consegna: ordini già inviati/confermati. */}
              <div className="px-5 pt-3 pb-1 flex items-center justify-between border-t border-divider">
                <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">In attesa di consegna</span>
                <span className="text-xs font-mono text-ink-muted">{awaitingOrders.length}</span>
              </div>
              {awaitingOrders.length === 0 ? (
                <p className="px-5 pb-3 text-xs text-ink-muted">Nessun ordine in attesa di consegna.</p>
              ) : (
                <div className="divide-y divide-divider">
                  {awaitingOrders.slice(0, 5).map((o) => (
                    <Link key={o.orderId} href={`/orders/${o.orderId}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-offset transition-colors group">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-ink truncate">{o.supplierName}</p>
                        <p className="text-xs text-ink-muted font-mono mt-0.5">{o.orderDate} · {o.lineItemsCount} righe</p>
                      </div>
                      {o.totalAmount !== null && (
                        <span className="text-xs font-mono font-semibold text-ink">€{formatCurrency(o.totalAmount)}</span>
                      )}
                      <span className="text-xs font-semibold text-primary group-hover:underline shrink-0">Ricevi →</span>
                    </Link>
                  ))}
                </div>
              )}

              {/* Parzialmente ricevuti: arrivati solo in parte, da completare. */}
              {partialOrders.length > 0 && (
                <>
                  <div className="px-5 pt-3 pb-1 flex items-center justify-between border-t border-divider">
                    <span className="text-xs font-semibold text-warning-strong uppercase tracking-wide">Parzialmente ricevuti</span>
                    <span className="text-xs font-mono text-ink-muted">{partialOrders.length}</span>
                  </div>
                  <div className="divide-y divide-divider">
                    {partialOrders.slice(0, 5).map((o) => (
                      <Link key={o.orderId} href={`/orders/${o.orderId}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-offset transition-colors group">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-ink truncate">{o.supplierName}</p>
                          <p className="text-xs text-ink-muted font-mono mt-0.5">{o.orderDate} · {o.lineItemsCount} righe</p>
                        </div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-warning-light text-warning-strong shrink-0">Parziale</span>
                        <span className="text-xs font-semibold text-primary group-hover:underline shrink-0">Ricevi il resto →</span>
                      </Link>
                    ))}
                  </div>
                </>
              )}
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
              {stockAlerts.slice(0, 5).map((a) => {
                // Riordino suggerito: riporta la scorta a 2× la soglia (editabile nel form ordine).
                const reorder = Math.round((a.minThreshold * 2 - a.currentQuantity) * 1000) / 1000;
                const orderHref = `/orders/new?ingredient=${a.ingredientProductId}` + (reorder > 0 ? `&qty=${reorder}` : '');
                return (
                  <div key={a.ingredientProductId} className="flex items-center gap-3 px-5 py-3">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${a.alertLevel === 'out_of_stock' ? 'bg-danger' : a.alertLevel === 'critical' ? 'bg-warning' : 'bg-primary'}`} />
                    <span className="flex-1 text-sm text-ink truncate">{a.ingredientName}</span>
                    <span className="text-xs font-mono text-ink-muted">{a.currentQuantity}/{a.minThreshold} {a.unit}</span>
                    <Link href={orderHref} className="shrink-0 text-xs font-semibold text-primary hover:underline whitespace-nowrap">
                      Ordina subito →
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Rimanenze teoriche di oggi (FASE 1 — derivata da produzione confermata e vendite). */}
      <div id="rimanenze" className="bg-surface-2 rounded-2xl border border-border overflow-hidden scroll-mt-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-divider">
          <div className="min-w-0">
            <h2 className="font-semibold text-[15px] text-ink">Rimanenze teoriche di oggi</h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Calcolata da produzione confermata e vendite registrate oggi.
            </p>
          </div>
          <Link
            href={summary.todayPlan ? `/production/${summary.todayPlan.id}` : '/production'}
            className="text-xs font-semibold text-primary hover:underline shrink-0 ml-3"
          >
            Apri dettaglio →
          </Link>
        </div>
        {finishedGoods.length === 0 ? (
          <p className="px-5 py-8 text-sm text-ink-muted text-center">
            Nessun prodotto da mostrare: serve un piano di produzione confermato per oggi.
          </p>
        ) : (
          <div className="divide-y divide-divider">
            {finishedGoods.map((g) => (
              <div key={g.sellableProductId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
                <span className="flex-1 min-w-0 text-sm text-ink truncate">{g.productName}</span>
                <span className="text-xs font-mono text-ink-muted whitespace-nowrap">
                  {g.producedQty} prod · {g.soldQty} vend
                  {g.wastedQty > 0 && <span className="text-danger"> · {g.wastedQty} buttati</span>}
                </span>
                <span
                  className={`text-sm font-mono font-semibold w-12 text-right ${g.remainingTheoretical < 0 ? 'text-danger' : 'text-ink'}`}
                >
                  {g.remainingTheoretical}
                </span>
                {/* P0-3: il gesto di fine giornata dove si vede la rimanenza. */}
                {g.remainingTheoretical > 0 && (
                  <RecordWasteButton
                    recipeId={g.sellableProductId}
                    productName={g.productName}
                    suggestedQty={g.remainingTheoretical}
                  />
                )}
                {/* P1-C: il rosso spiegato DOVE compare, con le 2 cause probabili. */}
                {g.remainingTheoretical < 0 && (
                  <p className="basis-full text-xs text-ink-muted">
                    Venduto più di quanto risulta prodotto: o manca una{' '}
                    <Link href="/production/quick" className="text-primary font-semibold hover:underline">
                      produzione da registrare
                    </Link>{' '}
                    o un prodotto della cassa è{' '}
                    <Link href="/sales/pos#mappatura" className="text-primary font-semibold hover:underline">
                      collegato alla ricetta sbagliata
                    </Link>.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top spesa ingredienti (mobile: collassata; desktop: invariata) */}
      {topSpend.length > 0 && (() => {
        const topSpendCard = (
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
        );
        return (
          <div>
            <details className="group lg:hidden">
              <summary className="flex items-center justify-between min-h-[44px] cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
                <span className="font-semibold text-sm text-ink-muted uppercase tracking-wide">Top ingredienti per spesa</span>
                <ChevronDown size={16} aria-hidden="true" className="text-ink-faint transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-2">{topSpendCard}</div>
            </details>
            <div className="hidden lg:block">{topSpendCard}</div>
          </div>
        );
      })()}
    </div>
  );
}
