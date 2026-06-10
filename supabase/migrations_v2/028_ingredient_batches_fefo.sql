-- =============================================================================
-- 028_ingredient_batches_fefo.sql
-- Lotti ingredienti (HACCP-lite): registrazione lotto+scadenza alla ricezione,
-- consumo FEFO al completamento produzione, tracciabilità batch->lotti.
-- Il tracking lotti è OPZIONALE per ingrediente (tipicamente i deperibili):
-- il consumo FEFO decrementa i lotti registrati senza mai bloccare la
-- produzione se un acquisto non è stato lottizzato.
-- =============================================================================

create table ingredient_batches (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references organizations(id) on delete cascade,
  ingredient_product_id uuid not null references ingredient_products(id) on delete cascade,
  purchase_order_id     uuid references purchase_orders(id),
  supplier_id           uuid references suppliers(id),
  lot_number            text,
  expiry_date           date not null,
  quantity_received     numeric(10,4) not null check (quantity_received > 0),
  quantity_remaining    numeric(10,4) not null check (quantity_remaining >= 0),
  unit                  unit_of_measure not null,
  received_at           timestamptz not null default now(),
  notes                 text,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now()
);

create table production_batch_ingredients (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references organizations(id) on delete cascade,
  production_plan_id      uuid not null references production_plans(id) on delete cascade,
  ingredient_batch_id     uuid not null references ingredient_batches(id),
  ingredient_product_id   uuid not null references ingredient_products(id),
  quantity_used           numeric(10,4) not null check (quantity_used > 0),
  unit                    unit_of_measure not null,
  used_at                 timestamptz not null default now()
);

create index idx_ib_org_expiry on ingredient_batches (organization_id, expiry_date) where is_active and quantity_remaining > 0;
create index idx_ib_ingredient on ingredient_batches (ingredient_product_id);
create index idx_pbi_plan on production_batch_ingredients (production_plan_id);
create index idx_pbi_batch on production_batch_ingredients (ingredient_batch_id);

alter table ingredient_batches enable row level security;
alter table production_batch_ingredients enable row level security;

create policy ib_select on ingredient_batches
  for select using (organization_id = current_organization_id());
create policy ib_write on ingredient_batches
  for all using (organization_id = current_organization_id())
  with check (organization_id = current_organization_id());

create policy pbi_select on production_batch_ingredients
  for select using (organization_id = current_organization_id());

-- Scadenze imminenti + ricette attive che usano l'ingrediente (suggerimento)
create or replace view v_expiring_batches
with (security_invoker = on) as
select
  b.id as batch_id,
  b.organization_id,
  b.ingredient_product_id,
  ip.name as ingredient_name,
  b.lot_number,
  b.expiry_date,
  b.quantity_remaining,
  b.unit,
  (b.expiry_date - current_date) as days_to_expiry,
  s.name as supplier_name,
  (select array_agg(distinct r.name)
     from recipe_ingredients ri
     join recipes r on r.id = ri.recipe_id and r.is_active
    where ri.ingredient_product_id = b.ingredient_product_id
      and r.organization_id = b.organization_id) as suggested_recipes
from ingredient_batches b
join ingredient_products ip on ip.id = b.ingredient_product_id
left join suppliers s on s.id = b.supplier_id
where b.is_active and b.quantity_remaining > 0;

-- ── complete_production_plan: aggiunge consumo FEFO dei lotti tracciati ──────
create or replace function public.complete_production_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org    uuid;
  v_status plan_status;
  v_user   uuid := auth.uid();
  v_req    record;
  v_batch  record;
  v_need   numeric;
  v_take   numeric;
  v_factor numeric;
begin
  if v_user is null then
    raise exception 'complete_production_plan: utente non autenticato' using errcode = 'P0001';
  end if;

  select organization_id, status into v_org, v_status
  from production_plans where id = p_plan_id
  for update;

  if v_org is null then
    raise exception 'complete_production_plan: piano non trovato' using errcode = 'P0044';
  end if;
  if v_org is distinct from current_organization_id() then
    raise exception 'complete_production_plan: piano di un''altra organizzazione' using errcode = 'P0043';
  end if;
  if v_status = 'completed' then
    raise exception 'complete_production_plan: piano già completato' using errcode = 'P0040';
  end if;
  if v_status = 'cancelled' then
    raise exception 'complete_production_plan: piano cancellato' using errcode = 'P0040';
  end if;

  -- 1) Movimenti di consumo (source of truth) — identico a prima
  insert into inventory_movements (
    organization_id, ingredient_product_id, movement_type, quantity_delta, unit,
    reference_type, reference_id, performed_by
  )
  select v_org, ri.ingredient_product_id, 'production_usage',
         -(ri.quantity * ppi.batch_count), ri.unit,
         'production_plan', p_plan_id, v_user
  from production_plan_items ppi
  join recipe_ingredients ri on ri.recipe_id = ppi.recipe_id
  where ppi.production_plan_id = p_plan_id;

  -- 2) Consumo FEFO dei lotti tracciati (best-effort, mai bloccante):
  --    per ogni ingrediente consumato, scala i lotti in ordine di scadenza.
  for v_req in
    select ri.ingredient_product_id,
           ip.unit as product_unit,
           sum(ri.quantity * ppi.batch_count * coalesce(unit_conversion_factor(ri.unit, ip.unit), 1)) as total_qty
    from production_plan_items ppi
    join recipe_ingredients ri on ri.recipe_id = ppi.recipe_id
    join ingredient_products ip on ip.id = ri.ingredient_product_id
    where ppi.production_plan_id = p_plan_id
    group by ri.ingredient_product_id, ip.unit
  loop
    v_need := v_req.total_qty;
    for v_batch in
      select id, quantity_remaining, unit
      from ingredient_batches
      where organization_id = v_org
        and ingredient_product_id = v_req.ingredient_product_id
        and is_active and quantity_remaining > 0
      order by expiry_date asc, received_at asc
      for update
    loop
      exit when v_need <= 0;
      v_factor := coalesce(unit_conversion_factor(v_req.product_unit, v_batch.unit), 1);
      v_take := least(v_batch.quantity_remaining, v_need * v_factor);
      if v_take > 0 then
        update ingredient_batches
          set quantity_remaining = quantity_remaining - v_take
        where id = v_batch.id;

        insert into production_batch_ingredients (
          organization_id, production_plan_id, ingredient_batch_id,
          ingredient_product_id, quantity_used, unit
        ) values (
          v_org, p_plan_id, v_batch.id,
          v_req.ingredient_product_id, v_take, v_batch.unit
        );
        v_need := v_need - (v_take / v_factor);
      end if;
    end loop;
  end loop;

  update production_plans
  set status = 'completed', completed_at = now()
  where id = p_plan_id;
end;
$$;
