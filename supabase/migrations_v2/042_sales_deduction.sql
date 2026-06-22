-- =============================================================================
-- 042_sales_deduction.sql
-- V1 deduzione magazzino AL MOMENTO DELLA VENDITA.
--   sales + sale_lines + product_mappings (mapping POS → ricetta)
--   ingest_sale()  → inserimento ATOMICO e IDEMPOTENTE di vendita+righe+movimenti
--   reverse_sale() → storno (movimenti inversi, storia immutata)
-- Riusa: recipes/recipe_ingredients (BOM), ingredient_products (materie prime),
--        inventory_movements (+trigger livelli), unit_conversion_factor (021).
-- Richiede 041 (valori enum sale_deduction/sale_reversal già committati).
-- =============================================================================

-- ── 1) Estendi i CHECK di inventory_movements per i tipi vendita ─────────────
alter table inventory_movements drop constraint inventory_movements_delta_sign;
alter table inventory_movements add constraint inventory_movements_delta_sign check (
  (movement_type in ('purchase_receipt', 'initial_stock', 'sale_reversal') and quantity_delta > 0)
  or (movement_type in ('production_usage', 'waste', 'return_to_supplier', 'sale_deduction') and quantity_delta < 0)
  or (movement_type = 'manual_adjustment') -- può essere + o -
);

-- Tracciabilità: ogni movimento di vendita referenzia la riga vendita d'origine.
-- NB: 'purchase_receipt' è presente in prod (drift staging↔prod) → mantenuto nel
-- set per non violare le righe esistenti. Il nuovo set è un SUPERSET del vecchio.
alter table inventory_movements drop constraint inventory_movements_reference_type_check;
alter table inventory_movements add constraint inventory_movements_reference_type_check check (
  reference_type is null
  or reference_type in ('purchase_order', 'production_plan', 'manual', 'purchase_receipt', 'sale_line')
);

-- ── 2) Enum di stato ──────────────────────────────────────────────────────────
create type sale_status as enum ('processed', 'partially_linked', 'unlinked', 'reversed', 'void');
create type sale_line_status as enum ('deducted', 'unlinked', 'no_bom', 'unit_mismatch');

-- ── 3) sales ──────────────────────────────────────────────────────────────────
create table sales (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  external_sale_id text not null,          -- id scontrino dal POS
  source           text not null,          -- 'manual' | 'csv' | 'pos:<provider>' …
  sold_at          timestamptz not null,
  status           sale_status not null default 'processed',
  total_amount     numeric(10, 2) check (total_amount is null or total_amount >= 0),
  customer_id      uuid,                    -- soft ref opzionale (no FK in V1)
  notes            text,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- IDEMPOTENZA: stesso scontrino dalla stessa sorgente = una sola vendita.
  constraint sales_external_unique unique (organization_id, source, external_sale_id),
  constraint sales_external_id_check check (char_length(trim(external_sale_id)) > 0),
  constraint sales_source_check check (char_length(trim(source)) > 0)
);

create trigger sales_set_updated_at
  before update on sales
  for each row execute function set_updated_at();

comment on table sales is
  'Vendita/scontrino POS. Unica per (org, source, external_sale_id) = chiave di idempotenza.';

-- ── 4) sale_lines ─────────────────────────────────────────────────────────────
create table sale_lines (
  id                    uuid primary key default gen_random_uuid(),
  sale_id               uuid not null references sales(id) on delete cascade,
  organization_id       uuid not null references organizations(id) on delete cascade,
  external_line_id      text,
  external_product_ref  text not null,      -- codice/nome prodotto dal POS
  product_name_snapshot text not null,
  recipe_id             uuid references recipes(id) on delete set null, -- prodotto vendibile risolto
  quantity              numeric(10, 3) not null check (quantity > 0),   -- decimali ammessi
  unit_price            numeric(10, 2) check (unit_price is null or unit_price >= 0),
  status                sale_line_status not null default 'unlinked',
  exception             text,               -- es. "prodotto non collegato a una ricetta"
  sort_order            integer not null default 0
);

create index idx_sale_lines_sale on sale_lines (sale_id);
create index idx_sale_lines_unlinked on sale_lines (organization_id) where status in ('unlinked', 'no_bom', 'unit_mismatch');

comment on table sale_lines is
  'Riga vendita. recipe_id = ricetta (prodotto vendibile) risolta; null/unlinked se non collegata.';

-- ── 5) product_mappings (alias POS → ricetta) ────────────────────────────────
create table product_mappings (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations(id) on delete cascade,
  source               text not null,
  external_product_ref text not null,       -- normalizzato (trim/lower) a monte
  recipe_id            uuid not null references recipes(id) on delete cascade,
  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),

  constraint product_mappings_unique unique (organization_id, source, external_product_ref)
);

create index idx_product_mappings_lookup on product_mappings (organization_id, source, external_product_ref);

comment on table product_mappings is
  'Mapping prodotto POS (rinominato/codice) → ricetta interna. Risolve i "non collegati".';

-- ── 6) RLS (org-scoped, come customer_orders) ────────────────────────────────
alter table sales enable row level security;
alter table sale_lines enable row level security;
alter table product_mappings enable row level security;

create policy sales_select on sales
  for select using (organization_id = current_organization_id());
create policy sales_write on sales
  for all using (organization_id = current_organization_id())
  with check (organization_id = current_organization_id());

create policy sale_lines_select on sale_lines
  for select using (organization_id = current_organization_id());
create policy sale_lines_write on sale_lines
  for all using (organization_id = current_organization_id())
  with check (organization_id = current_organization_id());

create policy product_mappings_select on product_mappings
  for select using (organization_id = current_organization_id());
create policy product_mappings_write on product_mappings
  for all using (organization_id = current_organization_id())
  with check (organization_id = current_organization_id());

-- ── 7) ingest_sale(): inserimento atomico + idempotente ──────────────────────
-- Il SERVIZIO (TS) risolve i prodotti ed esplode il BOM (con conversione unità),
-- passando i movimenti già calcolati. La RPC garantisce ATOMICITÀ + IDEMPOTENZA:
-- ON CONFLICT DO NOTHING sulla chiave (org, source, external_sale_id) impedisce
-- la doppia deduzione su webhook/import ripetuti. Se la vendita esiste già,
-- ritorna l'id senza toccare il magazzino.
create or replace function public.ingest_sale(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org     uuid := current_organization_id();
  v_user    uuid := auth.uid();
  v_sale    uuid;
  v_line    jsonb;
  v_line_id uuid;
  v_mov     jsonb;
begin
  if v_user is null then
    raise exception 'ingest_sale: utente non autenticato' using errcode = 'P0001';
  end if;
  if v_org is null then
    raise exception 'ingest_sale: organizzazione non risolta' using errcode = 'P0001';
  end if;

  insert into sales (
    organization_id, external_sale_id, source, sold_at, status,
    total_amount, customer_id, notes, created_by
  )
  values (
    v_org,
    p_payload->>'external_sale_id',
    p_payload->>'source',
    (p_payload->>'sold_at')::timestamptz,
    coalesce((p_payload->>'status')::sale_status, 'processed'),
    nullif(p_payload->>'total_amount', '')::numeric,
    nullif(p_payload->>'customer_id', '')::uuid,
    nullif(p_payload->>'notes', ''),
    v_user
  )
  on conflict (organization_id, source, external_sale_id) do nothing
  returning id into v_sale;

  -- Idempotenza: già processata → ritorna l'id esistente, niente movimenti.
  if v_sale is null then
    select id into v_sale from sales
    where organization_id = v_org
      and source = p_payload->>'source'
      and external_sale_id = p_payload->>'external_sale_id';
    return v_sale;
  end if;

  for v_line in select * from jsonb_array_elements(coalesce(p_payload->'lines', '[]'::jsonb))
  loop
    insert into sale_lines (
      sale_id, organization_id, external_line_id, external_product_ref,
      product_name_snapshot, recipe_id, quantity, unit_price, status, exception, sort_order
    )
    values (
      v_sale, v_org,
      nullif(v_line->>'external_line_id', ''),
      v_line->>'external_product_ref',
      v_line->>'product_name_snapshot',
      nullif(v_line->>'recipe_id', '')::uuid,
      (v_line->>'quantity')::numeric,
      nullif(v_line->>'unit_price', '')::numeric,
      coalesce((v_line->>'status')::sale_line_status, 'unlinked'),
      nullif(v_line->>'exception', ''),
      coalesce((v_line->>'sort_order')::int, 0)
    )
    returning id into v_line_id;

    for v_mov in select * from jsonb_array_elements(coalesce(v_line->'movements', '[]'::jsonb))
    loop
      insert into inventory_movements (
        organization_id, ingredient_product_id, movement_type, quantity_delta, unit,
        reference_type, reference_id, performed_by
      )
      values (
        v_org,
        (v_mov->>'ingredient_product_id')::uuid,
        'sale_deduction',
        (v_mov->>'quantity_delta')::numeric,
        (v_mov->>'unit')::unit_of_measure,
        'sale_line', v_line_id, v_user
      );
    end loop;
  end loop;

  return v_sale;
end;
$$;

revoke all on function public.ingest_sale(jsonb) from public, anon;
grant execute on function public.ingest_sale(jsonb) to authenticated;

comment on function public.ingest_sale(jsonb) is
  'Ingestione vendita atomica+idempotente: vendita+righe+movimenti sale_deduction. ON CONFLICT impedisce doppia deduzione.';

-- ── 8) reverse_sale(): storno (movimenti inversi, storia immutata) ───────────
create or replace function public.reverse_sale(p_sale_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    uuid;
  v_status sale_status;
  v_user   uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'reverse_sale: utente non autenticato' using errcode = 'P0001';
  end if;

  -- LOCK della vendita: serializza storni concorrenti (idempotenza).
  select organization_id, status into v_org, v_status
  from sales where id = p_sale_id for update;

  if v_org is null then
    raise exception 'reverse_sale: vendita non trovata' using errcode = 'P0044';
  end if;
  if v_org is distinct from current_organization_id() then
    raise exception 'reverse_sale: vendita di un''altra organizzazione' using errcode = 'P0043';
  end if;
  if v_status in ('reversed', 'void') then
    raise exception 'reverse_sale: vendita già stornata' using errcode = 'P0040';
  end if;

  -- Movimenti INVERSI (sale_reversal, positivi): nessuna riga storica modificata.
  insert into inventory_movements (
    organization_id, ingredient_product_id, movement_type, quantity_delta, unit,
    reference_type, reference_id, performed_by
  )
  select m.organization_id, m.ingredient_product_id, 'sale_reversal',
         -m.quantity_delta, m.unit, 'sale_line', m.reference_id, v_user
  from inventory_movements m
  join sale_lines sl on sl.id = m.reference_id
  where sl.sale_id = p_sale_id
    and m.reference_type = 'sale_line'
    and m.movement_type = 'sale_deduction';

  update sales set status = 'reversed', updated_at = now() where id = p_sale_id;
  return p_sale_id;
end;
$$;

revoke all on function public.reverse_sale(uuid) from public, anon;
grant execute on function public.reverse_sale(uuid) to authenticated;

comment on function public.reverse_sale(uuid) is
  'Storno vendita: movimenti sale_reversal (inversi) + stato reversed. Idempotente (status guard).';

-- ── Rollback (solo per revert) ───────────────────────────────────────────────
-- drop function if exists public.reverse_sale(uuid);
-- drop function if exists public.ingest_sale(jsonb);
-- drop table if exists product_mappings; drop table if exists sale_lines; drop table if exists sales;
-- drop type if exists sale_line_status; drop type if exists sale_status;
-- (i valori enum sale_deduction/sale_reversal restano: non rimovibili da movement_type)
