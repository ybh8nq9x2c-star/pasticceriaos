-- =============================================================================
-- 022_supplier_analytics.sql
-- 1) FIX: organizations_select consentiva SOLO la propria org -> i nomi delle
--    controparti marketplace risultavano sempre '—'. Nuova policy: una org può
--    leggere le org a cui è/era collegata (necessario anche per lo storico).
-- 2) Viste analytics per il workspace fornitore (e riusabili lato cliente):
--    fatti ordine, vendite mensili, vendite per prodotto, stats per cliente.
--    Tutte security_invoker = on: l'isolamento resta sulle RLS di
--    marketplace_orders / marketplace_order_lines / organizations.
-- =============================================================================

create policy organizations_select_connected on organizations
  for select using (
    exists (
      select 1 from supplier_customer_connections c
      where (c.supplier_org_id = organizations.id and c.customer_org_id = current_organization_id())
         or (c.customer_org_id = organizations.id and c.supplier_org_id = current_organization_id())
    )
  );

comment on policy organizations_select_connected on organizations is
  'Le controparti di una connessione marketplace (anche revocata, per lo storico) possono leggersi a vicenda (nome/slug per le UI).';

-- ── Fatti ordine marketplace (1 riga per ordine, totale da snapshot righe) ───
create or replace view v_marketplace_order_facts
with (security_invoker = on) as
select
  mo.id              as order_id,
  mo.supplier_org_id,
  mo.customer_org_id,
  sup.name           as supplier_name,
  cust.name          as customer_name,
  mo.status,
  mo.created_at,
  mo.submitted_at,
  mo.accepted_at,
  mo.shipped_at,
  mo.delivered_at,
  mo.cancelled_at,
  count(l.id)                                            as line_count,
  coalesce(sum(l.quantity * coalesce(l.unit_price_snapshot, 0)), 0) as total_value
from marketplace_orders mo
left join organizations sup on sup.id = mo.supplier_org_id
left join organizations cust on cust.id = mo.customer_org_id
left join marketplace_order_lines l on l.order_id = mo.id
group by mo.id, sup.name, cust.name;

comment on view v_marketplace_order_facts is
  'Un record per ordine marketplace con totale calcolato dagli snapshot. RLS sottostante: visibile solo alle due parti.';

-- ── Vendite mensili fornitore (domanda = ordini sottomessi) ──────────────────
create or replace view v_supplier_monthly_sales
with (security_invoker = on) as
select
  supplier_org_id,
  date_trunc('month', submitted_at)::date as month,
  count(*)                                as orders_count,
  sum(total_value)                        as total_value,
  count(distinct customer_org_id)         as customers_count
from v_marketplace_order_facts
where submitted_at is not null
  and status <> 'cancelled'
group by supplier_org_id, date_trunc('month', submitted_at)::date;

-- ── Vendite per prodotto (snapshot nome: gli storici non driftano) ───────────
create or replace view v_supplier_product_sales
with (security_invoker = on) as
select
  mo.supplier_org_id,
  l.catalog_item_id,
  l.name_snapshot,
  l.unit,
  count(distinct mo.id)                                  as orders_count,
  sum(l.quantity)                                        as total_quantity,
  sum(l.quantity * coalesce(l.unit_price_snapshot, 0))   as total_revenue,
  count(distinct mo.customer_org_id)                     as customers_count,
  max(mo.submitted_at)                                   as last_ordered_at
from marketplace_orders mo
join marketplace_order_lines l on l.order_id = mo.id
where mo.status not in ('draft', 'cancelled')
group by mo.supplier_org_id, l.catalog_item_id, l.name_snapshot, l.unit;

-- ── Stats per cliente (top clienti, trend per cliente) ───────────────────────
create or replace view v_supplier_customer_stats
with (security_invoker = on) as
select
  supplier_org_id,
  customer_org_id,
  customer_name,
  count(*) filter (where status <> 'cancelled' and submitted_at is not null) as orders_count,
  sum(total_value) filter (where status <> 'cancelled' and submitted_at is not null) as total_value,
  count(*) filter (where status = 'delivered')   as delivered_count,
  max(submitted_at)                              as last_order_at
from v_marketplace_order_facts
group by supplier_org_id, customer_org_id, customer_name;

-- ── Indici marketplace per le aggregazioni ───────────────────────────────────
create index if not exists idx_mo_supplier_status on marketplace_orders (supplier_org_id, status);
create index if not exists idx_mo_customer_status on marketplace_orders (customer_org_id, status);
create index if not exists idx_mol_order on marketplace_order_lines (order_id);
