-- =============================================================================
-- 029_customer_orders.sql
-- Ordini clienti (torte su prenotazione, ritiri) integrati nel piano produzione.
-- =============================================================================

create type customer_order_status as enum
  ('pending','confirmed','in_production','ready','delivered','cancelled');

create table customer_orders (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_name   text not null check (char_length(trim(customer_name)) > 0),
  customer_phone  text,
  customer_email  text,
  pickup_date     date not null,
  pickup_time     time,
  notes           text,
  status          customer_order_status not null default 'pending',
  total_amount    numeric(10,2) check (total_amount is null or total_amount >= 0),
  deposit_paid    numeric(10,2) check (deposit_paid is null or deposit_paid >= 0),
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger customer_orders_set_updated_at
  before update on customer_orders
  for each row execute function set_updated_at();

create table customer_order_items (
  id                uuid primary key default gen_random_uuid(),
  customer_order_id uuid not null references customer_orders(id) on delete cascade,
  recipe_id         uuid references recipes(id),
  description       text not null check (char_length(trim(description)) > 0),
  quantity          integer not null check (quantity > 0),
  unit_price        numeric(10,2) check (unit_price is null or unit_price >= 0),
  notes             text,
  sort_order        integer not null default 0
);

create index idx_co_org_pickup on customer_orders (organization_id, pickup_date) where status not in ('delivered','cancelled');
create index idx_coi_order on customer_order_items (customer_order_id);

alter table customer_orders enable row level security;
alter table customer_order_items enable row level security;

create policy co_select on customer_orders
  for select using (organization_id = current_organization_id());
create policy co_write on customer_orders
  for all using (organization_id = current_organization_id())
  with check (organization_id = current_organization_id());

create policy coi_select on customer_order_items
  for select using (exists (
    select 1 from customer_orders o where o.id = customer_order_id and o.organization_id = current_organization_id()
  ));
create policy coi_write on customer_order_items
  for all using (exists (
    select 1 from customer_orders o where o.id = customer_order_id and o.organization_id = current_organization_id()
  ))
  with check (exists (
    select 1 from customer_orders o where o.id = customer_order_id and o.organization_id = current_organization_id()
  ));

-- Ordini clienti imminenti con dettaglio item (per dashboard e piano produzione)
create or replace view v_customer_orders_upcoming
with (security_invoker = on) as
select
  o.id as order_id,
  o.organization_id,
  o.customer_name,
  o.pickup_date,
  o.pickup_time,
  o.status,
  o.total_amount,
  count(i.id)                as items_count,
  coalesce(sum(i.quantity),0) as pieces_count
from customer_orders o
left join customer_order_items i on i.customer_order_id = o.id
where o.status not in ('delivered','cancelled')
group by o.id;
