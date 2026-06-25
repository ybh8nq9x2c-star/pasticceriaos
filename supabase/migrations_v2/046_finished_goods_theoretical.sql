-- =============================================================================
-- 046_finished_goods_theoretical.sql
-- FASE 1 — Rimanenza teorica giornaliera dei PRODOTTI FINITI (reporting derivato,
-- read-only). NON è un magazzino finiti: nessun ledger, nessuno stock persistito,
-- nessun cron, nessuna rettifica, nessun movimento su inventory_movements.
--
--   remaining_theoretical = produced_qty - sold_qty
--     produced_qty = batch_count × resa, dai piani COMPLETATI del giorno
--     sold_qty     = quantità venduta (sale_lines già risolte su ricetta interna)
--
-- MODELLO: in BakeryOS la RICETTA è il prodotto vendibile interno
-- (sale_lines.recipe_id → recipes). Quindi sellable_product_id ≡ recipe_id:
-- niente tabella/colonna di mapping nuova. Si aggiunge solo la RESA vendibile su
-- recipes (yield), con fallback a base_portions.
-- ADDITIVE & SAFE: 2 colonne nullable/default + 1 vista read-only.
-- =============================================================================

-- ── 1) Resa vendibile su recipes (FASE 1: pezzi) ─────────────────────────────
alter table recipes add column if not exists yield_quantity integer
  check (yield_quantity is null or yield_quantity > 0);
alter table recipes add column if not exists yield_unit unit_of_measure not null default 'pz';

comment on column recipes.yield_quantity is
  'Resa in pezzi VENDIBILI per batch (rimanenza teorica finiti, FASE 1). NULL → usa base_portions.';
comment on column recipes.yield_unit is
  'Unità della resa vendibile (FASE 1 quasi sempre pz).';

-- ── 2) Vista read-only: rimanenza teorica giornaliera per prodotto vendibile ──
-- security_invoker = on → applica la RLS dell'utente chiamante (org-scoped via le
-- tabelle sottostanti), come le altre viste di reporting.
create or replace view v_finished_goods_daily_theoretical
with (security_invoker = on) as
with produced as (
  -- Solo piani COMPLETATI: la produzione "teorica" esiste solo dopo la conferma.
  select
    pp.organization_id,
    pp.plan_date                                                          as business_date,
    ppi.recipe_id                                                         as sellable_product_id,
    sum(ppi.batch_count * coalesce(r.yield_quantity, r.base_portions))::numeric as produced_qty
  from production_plans pp
  join production_plan_items ppi on ppi.production_plan_id = pp.id
  join recipes r                  on r.id = ppi.recipe_id
  where pp.status = 'completed'
  group by pp.organization_id, pp.plan_date, ppi.recipe_id
),
sold as (
  -- Vendite già NORMALIZZATE su prodotto interno (recipe_id non nullo). Escluse le
  -- vendite stornate/annullate. NB: la data usa sold_at::date (limite FASE 1 a
  -- cavallo della mezzanotte).
  select
    s.organization_id,
    (s.sold_at)::date          as business_date,
    sl.recipe_id               as sellable_product_id,
    sum(sl.quantity)::numeric  as sold_qty
  from sale_lines sl
  join sales s on s.id = sl.sale_id
  where sl.recipe_id is not null
    and s.status not in ('reversed', 'void')
  group by s.organization_id, (s.sold_at)::date, sl.recipe_id
)
select
  p.organization_id,
  p.business_date,
  p.sellable_product_id,
  r.name                                          as product_name,
  p.produced_qty,
  coalesce(so.sold_qty, 0)                        as sold_qty,
  p.produced_qty - coalesce(so.sold_qty, 0)       as remaining_theoretical
from produced p
join recipes r on r.id = p.sellable_product_id
left join sold so
  on  so.organization_id    = p.organization_id
  and so.business_date       = p.business_date
  and so.sellable_product_id = p.sellable_product_id;

comment on view v_finished_goods_daily_theoretical is
  'FASE 1 — Rimanenza teorica giornaliera prodotti finiti: produced (piani completati × resa) − sold (vendite risolte su ricetta). Read-only, derivata. NON è un magazzino finiti.';
