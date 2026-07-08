-- =============================================================================
-- 056_finished_goods_waste.sql
-- P0-3 — invenduto/scarto dei PRODOTTI FINITI: il gesto di fine giornata di
-- ogni pasticceria, finora non registrabile.
--
-- DOMINIO: tocca SOLO il ledger finished_goods_movements (append-only, RLS
-- fgm_insert per-org già in 050; la proiezione finished_goods_levels si
-- aggiorna via trigger esistente). ZERO effetti sulle materie prime.
-- Riconciliazione notturna (055): il drift-check somma i movimenti, quindi il
-- waste è automaticamente coerente senza modifiche.
--
--   1) fgm_type_check  += 'waste' (delta NEGATIVO obbligatorio: si butta, non
--      si crea); reference_type resta 'manual'.
--   2) v_finished_goods_daily_theoretical: la rimanenza teorica del giorno
--      diventa produced − sold − wasted (nuova colonna wasted_qty esposta):
--      l'invenduto registrato non "gonfia" più il banco teorico.
-- =============================================================================

-- ── 1) Nuovo movement_type 'waste' (negativo) ────────────────────────────────
alter table finished_goods_movements drop constraint fgm_type_check;
alter table finished_goods_movements add constraint fgm_type_check check (
  movement_type in ('production_output', 'sale_deduction', 'sale_reversal', 'manual_adjustment', 'waste')
);

alter table finished_goods_movements drop constraint fgm_delta_sign;
alter table finished_goods_movements add constraint fgm_delta_sign check (
  (movement_type in ('production_output', 'sale_reversal') and quantity_delta > 0)
  or (movement_type in ('sale_deduction', 'waste') and quantity_delta < 0)
  or (movement_type = 'manual_adjustment' and quantity_delta <> 0)
);

-- ── 2) Vista teorica: produced − sold − wasted ───────────────────────────────
-- DROP necessario: si aggiunge la colonna wasted_qty prima di
-- remaining_theoretical (create or replace non può riordinare le colonne).
-- Nessun oggetto DB dipende dalla vista (la legge solo il reporting service).
drop view if exists v_finished_goods_daily_theoretical;

create view v_finished_goods_daily_theoretical
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
),
wasted as (
  -- Invenduto/scarto del giorno (delta negativo → quantità positiva buttata).
  select
    fgm.organization_id,
    (fgm.created_at)::date       as business_date,
    fgm.recipe_id                as sellable_product_id,
    sum(-fgm.quantity_delta)::numeric as wasted_qty
  from finished_goods_movements fgm
  where fgm.movement_type = 'waste'
  group by fgm.organization_id, (fgm.created_at)::date, fgm.recipe_id
)
select
  p.organization_id,
  p.business_date,
  p.sellable_product_id,
  r.name                                          as product_name,
  p.produced_qty,
  coalesce(so.sold_qty, 0)                        as sold_qty,
  coalesce(w.wasted_qty, 0)                       as wasted_qty,
  p.produced_qty - coalesce(so.sold_qty, 0) - coalesce(w.wasted_qty, 0) as remaining_theoretical
from produced p
join recipes r on r.id = p.sellable_product_id
left join sold so
  on  so.organization_id     = p.organization_id
  and so.business_date       = p.business_date
  and so.sellable_product_id = p.sellable_product_id
left join wasted w
  on  w.organization_id      = p.organization_id
  and w.business_date        = p.business_date
  and w.sellable_product_id  = p.sellable_product_id;

comment on view v_finished_goods_daily_theoretical is
  'Rimanenza teorica giornaliera per prodotto finito: produced (piani completati) − sold (vendite non stornate) − wasted (invenduto registrato, 056). Derivata, mai scritta.';
