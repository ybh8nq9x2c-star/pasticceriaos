-- =============================================================================
-- 021_reporting_food_cost.sql
-- 1) recipes.sell_price_per_portion (input reale dell'utente, abilita margine).
-- 2) unit_conversion_factor(): conversioni metriche g<->kg, ml<->l.
-- 3) FIX contratto colonne v_ingredient_requirements / v_open_orders
--    (l'app legge unit/current_stock/estimated_shortage/order_id: le viste
--    esponevano ingredient_unit/available/shortage/id -> campi undefined a
--    runtime, shortage mai mostrato, link /orders/undefined).
-- 4) Viste food cost + spesa reale (snapshot prezzi su ordini RICEVUTI).
-- Tutte le viste: security_invoker = on (RLS dell'utente chiamante).
-- =============================================================================

alter table recipes add column if not exists sell_price_per_portion numeric
  check (sell_price_per_portion is null or sell_price_per_portion >= 0);

comment on column recipes.sell_price_per_portion is
  'Prezzo di vendita per porzione impostato dall''utente. Abilita il calcolo del margine. NULL = non impostato.';

-- ── Conversione unità (solo coppie metriche; NULL = non convertibile) ────────
create or replace function unit_conversion_factor(p_from unit_of_measure, p_to unit_of_measure)
returns numeric
language sql immutable
as $$
  select case
    when p_from = p_to then 1::numeric
    when p_from = 'g'  and p_to = 'kg' then 0.001
    when p_from = 'kg' and p_to = 'g'  then 1000
    when p_from = 'ml' and p_to = 'l'  then 0.001
    when p_from = 'l'  and p_to = 'ml' then 1000
    else null
  end;
$$;

revoke all on function unit_conversion_factor(unit_of_measure, unit_of_measure) from public, anon;
grant execute on function unit_conversion_factor(unit_of_measure, unit_of_measure) to authenticated;

-- ── v_ingredient_requirements: contratto app + unità convertite ──────────────
drop view if exists v_ingredient_requirements;
create view v_ingredient_requirements
with (security_invoker = on) as
with req as (
  select
    pp.id              as production_plan_id,
    pp.organization_id,
    pp.plan_date,
    pp.status          as plan_status,
    ip.id              as ingredient_product_id,
    ip.name            as ingredient_name,
    ip.sku             as ingredient_sku,
    ip.unit            as unit,            -- unità canonica del prodotto (= unità stock)
    ip.unit_price      as current_unit_price,
    ip.supplier_id,
    -- fabbisogno convertito nell'unità canonica del prodotto
    sum(ri.quantity * ppi.batch_count * coalesce(unit_conversion_factor(ri.unit, ip.unit), 1)) as total_required
  from production_plan_items ppi
  join production_plans    pp on pp.id = ppi.production_plan_id
  join recipe_ingredients  ri on ri.recipe_id = ppi.recipe_id
  join ingredient_products ip on ip.id = ri.ingredient_product_id
  group by pp.id, pp.organization_id, pp.plan_date, pp.status,
           ip.id, ip.name, ip.sku, ip.unit, ip.unit_price, ip.supplier_id
)
select
  r.production_plan_id,
  r.organization_id,
  r.plan_date,
  r.plan_status,
  r.ingredient_product_id,
  r.ingredient_name,
  r.ingredient_sku,
  r.unit,
  r.total_required,
  coalesce(il.current_quantity, 0)                                    as current_stock,
  greatest(r.total_required - coalesce(il.current_quantity, 0), 0)    as estimated_shortage,
  r.current_unit_price,
  case when r.current_unit_price is not null
       then greatest(r.total_required - coalesce(il.current_quantity, 0), 0) * r.current_unit_price
  end                                                                 as estimated_shortage_cost,
  r.supplier_id,
  s.name  as supplier_name,
  s.email as supplier_email
from req r
left join inventory_levels il on il.ingredient_product_id = r.ingredient_product_id
                             and il.organization_id = r.organization_id
left join suppliers s on s.id = r.supplier_id;

comment on view v_ingredient_requirements is
  'Fabbisogno per piano, convertito nell''unità canonica del prodotto. estimated_shortage = max(0, required - stock).';

-- ── v_open_orders: order_id + totale calcolato dalle righe ───────────────────
drop view if exists v_open_orders;
create view v_open_orders
with (security_invoker = on) as
select
  po.id   as order_id,
  po.organization_id,
  po.status,
  po.order_date,
  po.expected_date,
  po.sent_at,
  po.supplier_id,
  s.name  as supplier_name,
  s.email as supplier_email,
  count(oli.id) as line_items_count,
  case
    when count(oli.id) > 0
     and count(oli.id) filter (where oli.unit_price_snapshot is null) = 0
    then sum(oli.quantity_ordered * oli.unit_price_snapshot)
    else po.total_amount
  end as total_amount
from purchase_orders po
join suppliers s on s.id = po.supplier_id
left join order_line_items oli on oli.purchase_order_id = po.id
where po.status in ('draft', 'sent', 'confirmed')
group by po.id, po.organization_id, po.status, po.order_date,
         po.expected_date, po.sent_at, po.supplier_id, s.name, s.email, po.total_amount;

-- ── Food cost per ricetta ─────────────────────────────────────────────────────
create or replace view v_recipe_costs
with (security_invoker = on) as
select
  r.id                     as recipe_id,
  r.organization_id,
  r.name,
  r.emoji,
  r.category,
  r.base_portions,
  r.sell_price_per_portion,
  r.is_active,
  count(ri.id)             as ingredient_count,
  count(ri.id) filter (
    where ip.unit_price is not null
      and unit_conversion_factor(ri.unit, ip.unit) is not null
  )                        as priced_ingredient_count,
  sum(ri.quantity * unit_conversion_factor(ri.unit, ip.unit) * ip.unit_price) filter (
    where ip.unit_price is not null
      and unit_conversion_factor(ri.unit, ip.unit) is not null
  )                        as batch_cost,
  case
    when count(ri.id) > 0
     and count(ri.id) = count(ri.id) filter (
       where ip.unit_price is not null
         and unit_conversion_factor(ri.unit, ip.unit) is not null
     )
    then sum(ri.quantity * unit_conversion_factor(ri.unit, ip.unit) * ip.unit_price) / r.base_portions
  end                      as cost_per_portion,
  case
    when r.sell_price_per_portion is not null and r.sell_price_per_portion > 0
     and count(ri.id) > 0
     and count(ri.id) = count(ri.id) filter (
       where ip.unit_price is not null
         and unit_conversion_factor(ri.unit, ip.unit) is not null
     )
    then round(
      (r.sell_price_per_portion
        - sum(ri.quantity * unit_conversion_factor(ri.unit, ip.unit) * ip.unit_price) / r.base_portions
      ) / r.sell_price_per_portion * 100, 1)
  end                      as margin_pct
from recipes r
left join recipe_ingredients  ri on ri.recipe_id = r.id
left join ingredient_products ip on ip.id = ri.ingredient_product_id
group by r.id;

comment on view v_recipe_costs is
  'Food cost reale per ricetta da prezzi ingredienti correnti. cost_per_portion/margin_pct solo se TUTTI gli ingredienti hanno prezzo e unità convertibile.';

create or replace view v_recipe_cost_breakdown
with (security_invoker = on) as
select
  r.organization_id,
  ri.recipe_id,
  ri.id                    as recipe_ingredient_id,
  ri.ingredient_product_id,
  ip.name                  as ingredient_name,
  ri.quantity,
  ri.unit,
  ip.unit                  as price_unit,
  ip.unit_price,
  case
    when ip.unit_price is not null and unit_conversion_factor(ri.unit, ip.unit) is not null
    then ri.quantity * unit_conversion_factor(ri.unit, ip.unit) * ip.unit_price
  end                      as line_cost,
  ri.sort_order
from recipe_ingredients ri
join recipes r              on r.id  = ri.recipe_id
join ingredient_products ip on ip.id = ri.ingredient_product_id;

-- ── Spesa reale: ordini RICEVUTI, prezzi snapshot ─────────────────────────────
create or replace view v_received_order_lines
with (security_invoker = on) as
select
  po.organization_id,
  po.id   as purchase_order_id,
  po.supplier_id,
  coalesce(h.received_at, po.updated_at) as received_at,
  oli.ingredient_product_id,
  oli.quantity_ordered,
  oli.unit,
  oli.unit_price_snapshot,
  oli.quantity_ordered * coalesce(oli.unit_price_snapshot, 0) as line_total
from purchase_orders po
join order_line_items oli on oli.purchase_order_id = po.id
left join lateral (
  select max(changed_at) as received_at
  from order_status_history
  where purchase_order_id = po.id and to_status = 'received'
) h on true
where po.status = 'received';

create or replace view v_monthly_purchase_spend
with (security_invoker = on) as
select
  organization_id,
  date_trunc('month', received_at)::date as month,
  count(distinct purchase_order_id)      as orders_received,
  sum(line_total)                        as total_spend
from v_received_order_lines
group by organization_id, date_trunc('month', received_at)::date;

create or replace view v_ingredient_purchase_stats
with (security_invoker = on) as
select
  rol.organization_id,
  rol.ingredient_product_id,
  ip.name  as ingredient_name,
  ip.unit  as unit,
  count(distinct rol.purchase_order_id) as orders_count,
  sum(rol.quantity_ordered)             as total_quantity,
  sum(rol.line_total)                   as total_spend,
  (array_agg(rol.unit_price_snapshot order by rol.received_at asc)
     filter (where rol.unit_price_snapshot is not null))[1]  as first_price,
  (array_agg(rol.unit_price_snapshot order by rol.received_at desc)
     filter (where rol.unit_price_snapshot is not null))[1]  as last_price,
  max(rol.received_at)                  as last_received_at
from v_received_order_lines rol
join ingredient_products ip on ip.id = rol.ingredient_product_id
group by rol.organization_id, rol.ingredient_product_id, ip.name, ip.unit;

comment on view v_ingredient_purchase_stats is
  'Spesa reale per ingrediente (ordini ricevuti). first/last price dagli snapshot -> variazione prezzo fornitore.';

-- ── Indici per le aggregazioni di reporting ──────────────────────────────────
create index if not exists idx_osh_order_to_status
  on order_status_history (purchase_order_id, to_status, changed_at desc);
create index if not exists idx_inventory_movements_org_time
  on inventory_movements (organization_id, performed_at desc);
