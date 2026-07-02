-- =============================================================================
-- 050_finished_goods_domain.sql
-- CORREZIONE DI DOMINIO: due magazzini distinti.
--
--   MATERIE PRIME  (inventory_movements/levels — invariato)
--     • si consumano SOLO al completamento produzione (production_usage, 043)
--     • la vendita NON le tocca più
--   PRODOTTI FINITI (finished_goods_movements/levels — NUOVO, stesso pattern)
--     • +production_output al completamento produzione (resa = yield/base_portions)
--     • -sale_deduction alla vendita (righe risolte su ricetta)
--     • +sale_reversal allo storno (append-only)
--
-- Prima di questa migration la vendita esplodeva il BOM e scaricava ingredienti
-- (041/042): per chi completa i piani E registra vendite = DOPPIO scarico.
-- Da ora: la vendita muove solo i finiti; gli ingredienti li muove la produzione.
--
-- Include anche il fix idempotenza POS: pos_events UNIQUE ora comprende
-- event_type (+ store) — prima un VOID con lo stesso receipt_id del sale veniva
-- inghiottito come duplicate.
--
-- Append-only ovunque: nessuna riga storica modificata. Le vendite pre-pivot
-- restano con i loro movimenti ingredienti; il loro storno ripristina ANCHE
-- quelli (blocco legacy nei reverse). Storia intatta, comportamento nuovo.
-- =============================================================================

-- ── 1) Ledger prodotti finiti (source of truth) ──────────────────────────────
create table finished_goods_movements (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  recipe_id        uuid not null references recipes(id) on delete restrict,
  movement_type    text not null,
  quantity_delta   numeric(12,3) not null,
  reference_type   text,
  reference_id     uuid,
  performed_by     uuid references auth.users(id) on delete set null,
  notes            text,
  created_at       timestamptz not null default now(),

  constraint fgm_type_check check (
    movement_type in ('production_output', 'sale_deduction', 'sale_reversal', 'manual_adjustment')
  ),
  -- Coerenza di segno per tipo (come inventory_movements_delta_sign).
  constraint fgm_delta_sign check (
    (movement_type in ('production_output', 'sale_reversal') and quantity_delta > 0)
    or (movement_type = 'sale_deduction' and quantity_delta < 0)
    or (movement_type = 'manual_adjustment' and quantity_delta <> 0)
  ),
  constraint fgm_reference_check check (
    reference_type is null or reference_type in ('production_plan', 'sale_line', 'manual')
  )
);

create index idx_fgm_org_recipe on finished_goods_movements (organization_id, recipe_id, created_at desc);
create index idx_fgm_reference on finished_goods_movements (reference_type, reference_id);

comment on table finished_goods_movements is
  'Ledger APPEND-ONLY dei prodotti finiti (unità = porzioni/pezzi vendibili). Source of truth; finished_goods_levels è la proiezione.';

-- ── 2) Proiezione livelli (aggiornata SOLO dal trigger) ──────────────────────
create table finished_goods_levels (
  organization_id  uuid not null references organizations(id) on delete cascade,
  recipe_id        uuid not null references recipes(id) on delete cascade,
  current_quantity numeric(12,3) not null default 0,
  updated_at       timestamptz not null default now(),
  primary key (organization_id, recipe_id)
);

comment on table finished_goods_levels is
  'PROIEZIONE dei finished_goods_movements (trigger). Mai scrivere direttamente dall''app. Negativi ammessi (vendite > produzione registrata): verità onesta, si corregge con manual_adjustment.';

create or replace function public.apply_finished_goods_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into finished_goods_levels (organization_id, recipe_id, current_quantity, updated_at)
  values (new.organization_id, new.recipe_id, new.quantity_delta, now())
  on conflict (organization_id, recipe_id) do update
    set current_quantity = finished_goods_levels.current_quantity + new.quantity_delta,
        updated_at = now();
  return new;
end;
$$;

create trigger trg_apply_finished_goods_movement
  after insert on finished_goods_movements
  for each row execute function apply_finished_goods_movement();

-- ── 3) RLS ────────────────────────────────────────────────────────────────────
alter table finished_goods_movements enable row level security;
alter table finished_goods_levels    enable row level security;

create policy fgm_select on finished_goods_movements
  for select using (organization_id = current_organization_id());
create policy fgm_insert on finished_goods_movements
  for insert with check (organization_id = current_organization_id());
-- niente UPDATE/DELETE policy: ledger append-only anche per l'app di sessione.

create policy fgl_select on finished_goods_levels
  for select using (organization_id = current_organization_id());
-- livelli: sola lettura dall'app (scrive solo il trigger, security definer).

-- ── 4) complete_production_plan v4: −ingredienti (043, invariato) +finiti ─────
create or replace function public.complete_production_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    uuid;
  v_status plan_status;
  v_user   uuid := auth.uid();
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

  -- Materie prime: uscita convertita all'unità di magazzino (identico a 043).
  insert into inventory_movements (
    organization_id, ingredient_product_id, movement_type, quantity_delta, unit,
    reference_type, reference_id, performed_by
  )
  select v_org, ri.ingredient_product_id, 'production_usage',
         -(ri.quantity * ppi.batch_count * unit_conversion_factor(ri.unit, ip.unit)),
         ip.unit,
         'production_plan', p_plan_id, v_user
  from production_plan_items ppi
  join recipe_ingredients  ri on ri.recipe_id = ppi.recipe_id
  join ingredient_products ip on ip.id = ri.ingredient_product_id
  where ppi.production_plan_id = p_plan_id
    and unit_conversion_factor(ri.unit, ip.unit) is not null;

  -- PRODOTTI FINITI: entrata = batch × resa vendibile (yield_quantity, 046) con
  -- fallback base_portions. Stessa regola della vista teorica 046.
  insert into finished_goods_movements (
    organization_id, recipe_id, movement_type, quantity_delta,
    reference_type, reference_id, performed_by
  )
  select v_org, ppi.recipe_id, 'production_output',
         (ppi.batch_count * coalesce(r.yield_quantity, r.base_portions))::numeric,
         'production_plan', p_plan_id, v_user
  from production_plan_items ppi
  join recipes r on r.id = ppi.recipe_id
  where ppi.production_plan_id = p_plan_id
    and (ppi.batch_count * coalesce(r.yield_quantity, r.base_portions)) > 0;

  update production_plans
  set status = 'completed', completed_at = now()
  where id = p_plan_id;
end;
$$;

comment on function public.complete_production_plan(uuid) is
  'Chiusura piano atomica: −materie prime (production_usage, convertite) +prodotti finiti (production_output, resa yield/base_portions). SECURITY DEFINER con org-check.';

-- ── 5) ingest_sale v2: la vendita scala i PRODOTTI FINITI (non più il BOM) ────
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

    -- Riga risolta su ricetta → scala i PRODOTTI FINITI (quantity = porzioni).
    -- Nessun movimento ingredienti: quelli li fa la produzione.
    if nullif(v_line->>'recipe_id', '') is not null
       and coalesce((v_line->>'status')::sale_line_status, 'unlinked') = 'deducted' then
      insert into finished_goods_movements (
        organization_id, recipe_id, movement_type, quantity_delta,
        reference_type, reference_id, performed_by
      )
      values (
        v_org, (v_line->>'recipe_id')::uuid, 'sale_deduction',
        -((v_line->>'quantity')::numeric), 'sale_line', v_line_id, v_user
      );
    end if;
  end loop;

  return v_sale;
end;
$$;

comment on function public.ingest_sale(jsonb) is
  'Ingestione vendita atomica+idempotente: vendita+righe+movimenti finished_goods (sale_deduction). NON tocca le materie prime (dominio corretto 050).';

-- ── 6) ingest_sale_system v2 (bordo POS, attore di sistema) ───────────────────
create or replace function public.ingest_sale_system(p_org uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale    uuid;
  v_line    jsonb;
  v_line_id uuid;
begin
  if p_org is null then
    raise exception 'ingest_sale_system: organizzazione mancante' using errcode = 'P0001';
  end if;

  insert into sales (
    organization_id, external_sale_id, source, sold_at, status,
    total_amount, customer_id, notes, created_by
  )
  values (
    p_org,
    p_payload->>'external_sale_id',
    p_payload->>'source',
    (p_payload->>'sold_at')::timestamptz,
    coalesce((p_payload->>'status')::sale_status, 'processed'),
    nullif(p_payload->>'total_amount', '')::numeric,
    nullif(p_payload->>'customer_id', '')::uuid,
    nullif(p_payload->>'notes', ''),
    null
  )
  on conflict (organization_id, source, external_sale_id) do nothing
  returning id into v_sale;

  if v_sale is null then
    select id into v_sale from sales
    where organization_id = p_org
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
      v_sale, p_org,
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

    if nullif(v_line->>'recipe_id', '') is not null
       and coalesce((v_line->>'status')::sale_line_status, 'unlinked') = 'deducted' then
      insert into finished_goods_movements (
        organization_id, recipe_id, movement_type, quantity_delta,
        reference_type, reference_id, performed_by
      )
      values (
        p_org, (v_line->>'recipe_id')::uuid, 'sale_deduction',
        -((v_line->>'quantity')::numeric), 'sale_line', v_line_id, null
      );
    end if;
  end loop;

  return v_sale;
end;
$$;

comment on function public.ingest_sale_system(uuid, jsonb) is
  'Variante org-esplicita di ingest_sale per il webhook POS. Scala i prodotti finiti, non le materie prime (050).';

-- ── 7) reverse_sale v2: storno finiti (nuova era) + ingredienti (era legacy) ──
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

  -- Prodotti finiti: movimenti inversi (vendite post-050).
  insert into finished_goods_movements (
    organization_id, recipe_id, movement_type, quantity_delta,
    reference_type, reference_id, performed_by
  )
  select m.organization_id, m.recipe_id, 'sale_reversal', -m.quantity_delta,
         'sale_line', m.reference_id, v_user
  from finished_goods_movements m
  join sale_lines sl on sl.id = m.reference_id
  where sl.sale_id = p_sale_id
    and m.reference_type = 'sale_line'
    and m.movement_type = 'sale_deduction';

  -- LEGACY (vendite pre-050 che avevano scaricato ingredienti): ripristina anche
  -- quelli. Append-only, storicamente corretto per entrambe le ere.
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

comment on function public.reverse_sale(uuid) is
  'Storno vendita append-only: inverte i movimenti finished_goods (post-050) e gli eventuali sale_deduction ingredienti legacy (pre-050).';

-- ── 8) reverse_sale_system v2 (idem, attore di sistema, idempotente) ──────────
create or replace function public.reverse_sale_system(p_org uuid, p_sale_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    uuid;
  v_status sale_status;
begin
  select organization_id, status into v_org, v_status
  from sales where id = p_sale_id for update;

  if v_org is null then
    raise exception 'reverse_sale_system: vendita non trovata' using errcode = 'P0044';
  end if;
  if v_org is distinct from p_org then
    raise exception 'reverse_sale_system: vendita di un''altra organizzazione' using errcode = 'P0043';
  end if;
  if v_status in ('reversed', 'void') then
    return p_sale_id; -- idempotente
  end if;

  insert into finished_goods_movements (
    organization_id, recipe_id, movement_type, quantity_delta,
    reference_type, reference_id, performed_by
  )
  select m.organization_id, m.recipe_id, 'sale_reversal', -m.quantity_delta,
         'sale_line', m.reference_id, null
  from finished_goods_movements m
  join sale_lines sl on sl.id = m.reference_id
  where sl.sale_id = p_sale_id
    and m.reference_type = 'sale_line'
    and m.movement_type = 'sale_deduction';

  insert into inventory_movements (
    organization_id, ingredient_product_id, movement_type, quantity_delta, unit,
    reference_type, reference_id, performed_by
  )
  select m.organization_id, m.ingredient_product_id, 'sale_reversal',
         -m.quantity_delta, m.unit, 'sale_line', m.reference_id, null
  from inventory_movements m
  join sale_lines sl on sl.id = m.reference_id
  where sl.sale_id = p_sale_id
    and m.reference_type = 'sale_line'
    and m.movement_type = 'sale_deduction';

  update sales set status = 'reversed', updated_at = now() where id = p_sale_id;
  return p_sale_id;
end;
$$;

comment on function public.reverse_sale_system(uuid, uuid) is
  'Variante org-esplicita di reverse_sale per il webhook POS (void/refund). Idempotente, append-only, entrambe le ere.';

-- ── 9) relink_sale_lines: collega righe unlinked di una vendita ESISTENTE ─────
-- Dopo la correzione del mapping, il replay non può ri-ingerire (ON CONFLICT →
-- vendita esistente immutata): questa RPC aggiorna le righe ancora scollegate e
-- scala i finiti SOLO per quelle, poi ricalcola lo stato vendita. Atomica.
create or replace function public.relink_sale_lines(p_sale_id uuid, p_lines jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    uuid := current_organization_id();
  v_user   uuid := auth.uid();
  v_status sale_status;
  v_line   jsonb;
  v_id     uuid;
  v_count  integer := 0;
begin
  if v_user is null then
    raise exception 'relink_sale_lines: utente non autenticato' using errcode = 'P0001';
  end if;

  select status into v_status from sales
  where id = p_sale_id and organization_id = v_org
  for update;

  if v_status is null then
    raise exception 'relink_sale_lines: vendita non trovata' using errcode = 'P0044';
  end if;
  if v_status in ('reversed', 'void') then
    raise exception 'relink_sale_lines: vendita stornata, non ricollegabile' using errcode = 'P0040';
  end if;

  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  loop
    -- Guard: solo righe ANCORA scollegate (idempotente su replay ripetuti).
    update sale_lines
    set recipe_id = (v_line->>'recipe_id')::uuid,
        quantity  = (v_line->>'quantity')::numeric,
        status    = 'deducted',
        exception = null
    where id = (v_line->>'sale_line_id')::uuid
      and sale_id = p_sale_id
      and organization_id = v_org
      and recipe_id is null
      and status in ('unlinked', 'no_bom', 'unit_mismatch')
    returning id into v_id;

    if v_id is not null then
      insert into finished_goods_movements (
        organization_id, recipe_id, movement_type, quantity_delta,
        reference_type, reference_id, performed_by
      )
      values (
        v_org, (v_line->>'recipe_id')::uuid, 'sale_deduction',
        -((v_line->>'quantity')::numeric), 'sale_line', v_id, v_user
      );
      v_count := v_count + 1;
      v_id := null;
    end if;
  end loop;

  -- Stato vendita ricalcolato dagli stati riga correnti.
  update sales set
    status = case
      when not exists (select 1 from sale_lines where sale_id = p_sale_id and status <> 'deducted') then 'processed'::sale_status
      when exists (select 1 from sale_lines where sale_id = p_sale_id and status = 'deducted') then 'partially_linked'::sale_status
      else 'unlinked'::sale_status
    end,
    updated_at = now()
  where id = p_sale_id;

  return v_count;
end;
$$;

revoke all on function public.relink_sale_lines(uuid, jsonb) from public, anon;
grant execute on function public.relink_sale_lines(uuid, jsonb) to authenticated;

comment on function public.relink_sale_lines(uuid, jsonb) is
  'Ricollega righe unlinked di una vendita esistente dopo la correzione mapping: recipe_id+quantity (porzioni), deduzione finiti, stato vendita ricalcolato. Idempotente per riga.';

-- ── 10) pos_events: chiave idempotenza con event_type + store ─────────────────
-- FIX: prima UNIQUE(org, provider, receipt) inghiottiva il VOID arrivato dopo il
-- SALE con lo stesso receipt_id. Nuova chiave: + event_type ('sale'|'reversal')
-- e external_store_id (receipt id potenzialmente ripetuti tra store).
alter table pos_events add column if not exists event_type text not null default 'sale';
alter table pos_events add column if not exists external_store_id text not null default '';

update pos_events set event_type = 'reversal' where raw_payload->>'is_reversal' = 'true';
update pos_events set external_store_id = coalesce(raw_payload->>'store_id', '') where external_store_id = '';

alter table pos_events add constraint pos_events_event_type_check
  check (event_type in ('sale', 'reversal'));

alter table pos_events drop constraint pos_events_external_unique;
alter table pos_events add constraint pos_events_idempotency_unique
  unique (organization_id, provider, external_store_id, external_receipt_id, event_type);

create index if not exists idx_pos_events_org_status on pos_events (organization_id, status, received_at desc);
