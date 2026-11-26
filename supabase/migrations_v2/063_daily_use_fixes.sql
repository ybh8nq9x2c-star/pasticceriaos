-- =============================================================================
-- 063_daily_use_fixes.sql  (W6 — REMEDIATION_REPORT.md)
-- Difetti d'uso quotidiano: alta frequenza, basso rischio.
--
--  A) PRODUZIONE RAPIDA sul piano di OGGI (find-or-create) + infornate "postate"
--     per riga (posted_batch_count, stesso pattern di qty_posted nei ricevimenti):
--     la rapida aggiunge infornate alla riga e le contabilizza SUBITO; il
--     completamento del piano contabilizza solo batch_count − posted_batch_count.
--     → più rapide nello stesso giorno, piano completato o no, mai doppio scarico.
--     Logica di contabilizzazione v5 (060) estratta in post_production_items
--     (interna): un solo corpo per completamento e rapida.
--  B) SCRITTURE ATOMICHE: piani (testata+righe) e prenotazioni cliente in RPC.
--  C) INVIO EMAIL ORDINE DOPO IL COMMIT: begin_order_dispatch registra sent +
--     dispatch_id stabile (outcome 'pending'); l'app spedisce con quell'id; un
--     doppio submit NON rispedisce; record_order_dispatch chiude l'esito.
--  D) RIMANENZA PRODOTTI FINITI dai MOVIMENTI postati (produzione − vendite −
--     scarti ± rettifiche) con RIPORTO dai giorni precedenti, giorno Europe/Rome.
--  E) PORTALE: portal_token_version (e supplier_org_id) non scrivibili dal client;
--     rotazione via RPC.
-- =============================================================================

-- =============================================================================
-- A) Produzione: infornate postate per riga
-- =============================================================================
alter table production_plan_items
  add column if not exists posted_batch_count integer not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'production_plan_items_posted_check') then
    alter table production_plan_items add constraint production_plan_items_posted_check
      check (posted_batch_count >= 0 and posted_batch_count <= batch_count);
  end if;
end $$;
comment on column production_plan_items.posted_batch_count is
  'Infornate GIÀ contabilizzate a magazzino (063): da produzione rapida o dal completamento. Il completamento posta solo batch_count − posted_batch_count.';

-- Piani già completati: tutte le loro infornate sono state contabilizzate.
update production_plan_items ppi
set posted_batch_count = ppi.batch_count
from production_plans pp
where pp.id = ppi.production_plan_id and pp.status = 'completed' and ppi.posted_batch_count = 0;

-- Il client non scrive posted_batch_count (solo le RPC).
revoke insert, update on public.production_plan_items from anon, authenticated;
grant insert (production_plan_id, recipe_id, batch_count, notes, sort_order) on public.production_plan_items to authenticated;
grant update (recipe_id, batch_count, notes, sort_order) on public.production_plan_items to authenticated;

-- ── corpo unico di contabilizzazione (v5 di 060, parametrizzato) ─────────────
-- p_items: [{ "recipe_id": uuid, "batches": int }] — infornate DA POSTARE ORA.
-- Interna: nessun grant a ruoli applicativi (la chiamano solo le RPC definer).
create or replace function public.post_production_items(
  p_org uuid, p_plan_id uuid, p_user uuid, p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req      record;
  v_batch    record;
  v_before   numeric(12,4);
  v_mov      uuid;
  v_need     numeric;
  v_bfactor  numeric;
  v_take     numeric;
  v_lots     jsonb;
  v_consumed jsonb := '[]'::jsonb;
  v_skipped  jsonb;
  v_output   jsonb;
begin
  create temp table if not exists _pp_items (recipe_id uuid, batches integer) on commit drop;
  truncate _pp_items;
  insert into _pp_items
  select (e ->> 'recipe_id')::uuid, (e ->> 'batches')::integer
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
  where (e ->> 'batches')::integer > 0;

  -- righe NON scaricabili: saltate e DICHIARATE (060)
  select coalesce(jsonb_agg(jsonb_build_object(
           'recipe_id', r.id, 'recipe_name', r.name,
           'ingredient_product_id', ip.id, 'ingredient_name', ip.name,
           'quantity', ri.quantity * it.batches,
           'recipe_unit', ri.unit, 'stock_unit', ip.unit,
           'reason', case when ip.organization_id is distinct from p_org
                          then 'ingredient_other_org' else 'unit_incompatible' end
         ) order by r.name, ip.name), '[]'::jsonb)
    into v_skipped
  from _pp_items it
  join recipes             r  on r.id = it.recipe_id
  join recipe_ingredients  ri on ri.recipe_id = it.recipe_id
  join ingredient_products ip on ip.id = ri.ingredient_product_id
  where unit_conversion_factor(ri.unit, ip.unit) is null
     or ip.organization_id is distinct from p_org;

  for v_req in
    select ip.id as ingredient_product_id, ip.name, ip.unit,
           sum(ri.quantity * it.batches * unit_conversion_factor(ri.unit, ip.unit)) as qty
    from _pp_items it
    join recipe_ingredients  ri on ri.recipe_id = it.recipe_id
    join ingredient_products ip on ip.id = ri.ingredient_product_id
    where ip.organization_id = p_org
      and unit_conversion_factor(ri.unit, ip.unit) is not null
    group by ip.id, ip.name, ip.unit
    having sum(ri.quantity * it.batches * unit_conversion_factor(ri.unit, ip.unit)) > 0
    order by ip.name
  loop
    select current_quantity into v_before
    from inventory_levels
    where organization_id = p_org and ingredient_product_id = v_req.ingredient_product_id
    for update;
    v_before := coalesce(v_before, 0);

    insert into inventory_movements (
      organization_id, ingredient_product_id, movement_type, quantity_delta, unit,
      reference_type, reference_id, performed_by, qty_before, qty_after
    ) values (
      p_org, v_req.ingredient_product_id, 'production_usage', -v_req.qty, v_req.unit,
      'production_plan', p_plan_id, p_user, v_before, v_before - v_req.qty
    )
    returning id into v_mov;

    v_need := v_req.qty;
    v_lots := '[]'::jsonb;
    for v_batch in
      select id, lot_number, expiry_date, quantity_remaining, unit
      from ingredient_batches
      where organization_id = p_org
        and ingredient_product_id = v_req.ingredient_product_id
        and is_active and quantity_remaining > 0
      order by expiry_date asc, received_at asc, id
      for update
    loop
      exit when v_need <= 0;
      v_bfactor := unit_conversion_factor(v_req.unit, v_batch.unit);
      continue when v_bfactor is null;
      v_take := least(v_batch.quantity_remaining, v_need * v_bfactor);
      continue when v_take <= 0;
      update ingredient_batches set quantity_remaining = quantity_remaining - v_take where id = v_batch.id;
      insert into production_batch_ingredients (
        organization_id, production_plan_id, ingredient_batch_id,
        ingredient_product_id, quantity_used, unit, inventory_movement_id
      ) values (p_org, p_plan_id, v_batch.id, v_req.ingredient_product_id, v_take, v_batch.unit, v_mov);
      v_lots := v_lots || jsonb_build_object(
        'batch_id', v_batch.id, 'lot_number', v_batch.lot_number,
        'expiry_date', v_batch.expiry_date, 'quantity', v_take, 'unit', v_batch.unit);
      v_need := v_need - v_take / v_bfactor;
    end loop;

    v_consumed := v_consumed || jsonb_build_object(
      'ingredient_product_id', v_req.ingredient_product_id, 'ingredient_name', v_req.name,
      'quantity', v_req.qty, 'unit', v_req.unit, 'movement_id', v_mov,
      'lots', v_lots, 'untracked_quantity', greatest(v_need, 0));
  end loop;

  insert into finished_goods_movements (
    organization_id, recipe_id, movement_type, quantity_delta,
    reference_type, reference_id, performed_by, notes
  )
  select p_org, it.recipe_id, 'production_output',
         (it.batches * coalesce(r.yield_quantity, r.base_portions))::numeric,
         'production_plan', p_plan_id, p_user,
         case when exists (select 1 from jsonb_array_elements(v_skipped) s
                           where (s ->> 'recipe_id')::uuid = it.recipe_id)
              then 'consumo ingredienti INCOMPLETO: righe saltate (vedi esito del piano)' end
  from _pp_items it
  join recipes r on r.id = it.recipe_id
  where (it.batches * coalesce(r.yield_quantity, r.base_portions)) > 0;

  select coalesce(jsonb_agg(jsonb_build_object(
           'recipe_id', it.recipe_id, 'recipe_name', r.name,
           'quantity', (it.batches * coalesce(r.yield_quantity, r.base_portions))::numeric,
           'ingredients_complete', not exists (
             select 1 from jsonb_array_elements(v_skipped) s where (s ->> 'recipe_id')::uuid = it.recipe_id)
         ) order by r.name), '[]'::jsonb)
    into v_output
  from _pp_items it
  join recipes r on r.id = it.recipe_id
  where (it.batches * coalesce(r.yield_quantity, r.base_portions)) > 0;

  return jsonb_build_object('version', 6, 'plan_id', p_plan_id, 'posted_at', now(),
                            'consumed', v_consumed, 'skipped', v_skipped, 'output', v_output);
end;
$$;
revoke all on function public.post_production_items(uuid, uuid, uuid, jsonb) from public, anon, authenticated;

-- ── complete_production_plan v6: posta solo le infornate non ancora postate ──
create or replace function public.complete_production_plan(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    uuid;
  v_status plan_status;
  v_user   uuid := auth.uid();
  v_items  jsonb;
  v_report jsonb;
begin
  if v_user is null then
    raise exception 'complete_production_plan: utente non autenticato' using errcode = 'P0001';
  end if;
  select organization_id, status into v_org, v_status
  from production_plans where id = p_plan_id for update;
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

  perform 1 from production_plan_items where production_plan_id = p_plan_id for update;
  select coalesce(jsonb_agg(jsonb_build_object(
           'recipe_id', recipe_id, 'batches', batch_count - posted_batch_count)), '[]'::jsonb)
    into v_items
  from production_plan_items
  where production_plan_id = p_plan_id and batch_count > posted_batch_count;

  v_report := public.post_production_items(v_org, p_plan_id, v_user, v_items);

  update production_plan_items set posted_batch_count = batch_count
  where production_plan_id = p_plan_id;
  update production_plans
  set status = 'completed', completed_at = now(), completion_report = v_report
  where id = p_plan_id;
  return v_report;
end;
$$;
revoke all on function public.complete_production_plan(uuid) from public, anon;
grant execute on function public.complete_production_plan(uuid) to authenticated;
comment on function public.complete_production_plan(uuid) is
  'v6 (063): posta solo batch_count − posted_batch_count (le infornate già postate da produzione rapida non si riscaricano); corpo di contabilizzazione unico (post_production_items: FEFO, righe dichiarate). Atomica, non ricompletabile.';

-- ── produzione rapida: piano di oggi (find-or-create) + posting immediato ────
create or replace function public.quick_produce(
  p_recipe_id   uuid,
  p_batch_count integer,
  p_plan_date   date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_org    uuid := public.current_organization_id();
  v_role   org_role;
  v_date   date := coalesce(p_plan_date, (now() at time zone 'Europe/Rome')::date);
  v_plan   uuid;
  v_status plan_status;
  v_report jsonb;
begin
  if v_user is null then
    raise exception 'quick_produce: utente non autenticato' using errcode = 'P0001';
  end if;
  v_role := public.current_org_role();
  if v_role is null or v_role = 'viewer' then
    raise exception 'Non hai i permessi per registrare produzione (ruolo in sola lettura).' using errcode = 'P0050';
  end if;
  if p_batch_count is null or p_batch_count <= 0 then
    raise exception 'Le infornate devono essere almeno 1.' using errcode = 'P0042';
  end if;
  if not exists (select 1 from recipes where id = p_recipe_id and organization_id = v_org) then
    raise exception 'Ricetta non trovata in questa organizzazione.' using errcode = 'P0045';
  end if;

  -- find-or-create del piano del giorno, serializzato per org+giorno
  perform pg_advisory_xact_lock(hashtextextended('plan_day:' || v_org::text || ':' || v_date::text, 0));
  select id, status into v_plan, v_status
  from production_plans where organization_id = v_org and plan_date = v_date
  for update;
  if v_plan is null then
    insert into production_plans (organization_id, plan_date, status, notes, created_by)
    values (v_org, v_date, 'draft', 'Produzione rapida', v_user)
    returning id, status into v_plan, v_status;
  end if;
  if v_status = 'cancelled' then
    raise exception 'Il piano di oggi è annullato: riattivalo o crea il piano prima della produzione rapida.'
      using errcode = 'P0040';
  end if;

  -- riga della ricetta: +N infornate, tutte già postate (contabilizzate ora)
  insert into production_plan_items (production_plan_id, recipe_id, batch_count, posted_batch_count, notes)
  values (v_plan, p_recipe_id, p_batch_count, p_batch_count, 'Produzione rapida')
  on conflict (production_plan_id, recipe_id) do update
    set batch_count        = production_plan_items.batch_count + excluded.batch_count,
        posted_batch_count = production_plan_items.posted_batch_count + excluded.batch_count;

  v_report := public.post_production_items(
    v_org, v_plan, v_user,
    jsonb_build_array(jsonb_build_object('recipe_id', p_recipe_id, 'batches', p_batch_count)));
  return v_report || jsonb_build_object('plan_status', v_status);
end;
$$;
revoke all on function public.quick_produce(uuid, integer, date) from public, anon;
grant execute on function public.quick_produce(uuid, integer, date) to authenticated;
comment on function public.quick_produce(uuid, integer, date) is
  'Produzione rapida (063): find-or-create del piano del giorno, +N infornate postate subito sulla riga della ricetta (posted_batch_count). Ripetibile nello stesso giorno, con piano completato o no; il completamento successivo non le riscarica.';

-- =============================================================================
-- B) Scritture atomiche: piani e prenotazioni
-- =============================================================================
-- p_items: [{ "recipe_id", "batch_count", "notes"?, "sort_order"? }]
create or replace function public.save_production_plan(
  p_plan_id   uuid,       -- null = nuovo piano (draft)
  p_plan_date date,
  p_notes     text,
  p_items     jsonb       -- null = non toccare le righe (solo testata)
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_org    uuid := public.current_organization_id();
  v_role   org_role;
  v_id     uuid := p_plan_id;
  v_status plan_status;
  v_bad    text;
begin
  if v_user is null then
    raise exception 'save_production_plan: utente non autenticato' using errcode = 'P0001';
  end if;
  v_role := public.current_org_role();
  if v_role is null or v_role = 'viewer' then
    raise exception 'Non hai i permessi per modificare la produzione (ruolo in sola lettura).' using errcode = 'P0050';
  end if;

  if p_items is not null then
    select r_id::text into v_bad
    from (select (e ->> 'recipe_id')::uuid as r_id from jsonb_array_elements(p_items) e) x
    where not exists (select 1 from recipes where id = x.r_id and organization_id = v_org)
    limit 1;
    if v_bad is not null then
      raise exception 'Ricetta non trovata in questa organizzazione.' using errcode = 'P0045';
    end if;
  end if;

  if v_id is null then
    insert into production_plans (organization_id, plan_date, status, notes, created_by)
    values (v_org, p_plan_date, 'draft', nullif(trim(p_notes), ''), v_user)
    returning id into v_id;
  else
    select status into v_status from production_plans
    where id = v_id and organization_id = v_org for update;
    if v_status is null then
      raise exception 'Piano di produzione non trovato.' using errcode = 'P0044';
    end if;
    if v_status in ('completed', 'cancelled') then
      raise exception 'Non è possibile modificare un piano in stato %.', v_status using errcode = 'P0040';
    end if;
    update production_plans
    set plan_date = coalesce(p_plan_date, plan_date), notes = nullif(trim(p_notes), ''), updated_at = now()
    where id = v_id;
  end if;

  if p_items is not null then
    if v_status is not null and v_status <> 'draft' then
      raise exception 'Le righe si modificano solo su piani in bozza.' using errcode = 'P0040';
    end if;
    -- infornate già postate (produzione rapida) non si possono togliere
    if exists (
      select 1 from production_plan_items ppi
      where ppi.production_plan_id = v_id and ppi.posted_batch_count > 0
        and ppi.posted_batch_count > coalesce((
          select (e ->> 'batch_count')::integer from jsonb_array_elements(p_items) e
          where (e ->> 'recipe_id')::uuid = ppi.recipe_id limit 1), 0)
    ) then
      raise exception 'Alcune infornate sono già state registrate a magazzino (produzione rapida): non puoi scendere sotto quella quantità.'
        using errcode = 'P0047';
    end if;

    create temp table if not exists _plan_posted (recipe_id uuid, posted integer) on commit drop;
    truncate _plan_posted;
    insert into _plan_posted select recipe_id, posted_batch_count from production_plan_items where production_plan_id = v_id;
    delete from production_plan_items where production_plan_id = v_id;
    insert into production_plan_items (production_plan_id, recipe_id, batch_count, posted_batch_count, notes, sort_order)
    select v_id, (e ->> 'recipe_id')::uuid, (e ->> 'batch_count')::integer,
           coalesce((select posted from _plan_posted p where p.recipe_id = (e ->> 'recipe_id')::uuid), 0),
           nullif(trim(e ->> 'notes'), ''),
           coalesce((e ->> 'sort_order')::integer, (ord - 1)::integer)
    from jsonb_array_elements(p_items) with ordinality as t(e, ord);
  end if;

  return v_id;
end;
$$;
revoke all on function public.save_production_plan(uuid, date, text, jsonb) from public, anon;
grant execute on function public.save_production_plan(uuid, date, text, jsonb) to authenticated;
comment on function public.save_production_plan(uuid, date, text, jsonb) is
  'Testata + righe del piano in UNA transazione (063). Nuovo piano o modifica (righe solo in bozza; infornate postate protette, P0047).';

-- p_items: [{ "recipe_id"?, "description", "quantity", "unit_price"?, "notes"? }]
create or replace function public.create_customer_order(
  p_customer_name  text,
  p_customer_phone text,
  p_customer_email text,
  p_pickup_date    date,
  p_pickup_time    time,
  p_notes          text,
  p_deposit_paid   numeric,
  p_items          jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_org   uuid := public.current_organization_id();
  v_role  org_role;
  v_id    uuid;
  v_total numeric;
begin
  if v_user is null then
    raise exception 'create_customer_order: utente non autenticato' using errcode = 'P0001';
  end if;
  v_role := public.current_org_role();
  if v_role is null or v_role = 'viewer' then
    raise exception 'Non hai i permessi per registrare prenotazioni (ruolo in sola lettura).' using errcode = 'P0050';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'Aggiungi almeno un prodotto alla prenotazione.' using errcode = 'P0042';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where nullif(e ->> 'recipe_id', '') is not null
      and not exists (select 1 from recipes where id = (e ->> 'recipe_id')::uuid and organization_id = v_org)
  ) then
    raise exception 'Prodotto non trovato in questa organizzazione.' using errcode = 'P0045';
  end if;

  -- totale solo se TUTTE le righe hanno un prezzo (come prima, lato app)
  select case when bool_and(nullif(e ->> 'unit_price', '') is not null)
              then sum((e ->> 'quantity')::numeric * (e ->> 'unit_price')::numeric) end
    into v_total
  from jsonb_array_elements(p_items) e;

  insert into customer_orders (
    organization_id, customer_name, customer_phone, customer_email, pickup_date, pickup_time,
    notes, total_amount, deposit_paid, created_by
  ) values (
    v_org, p_customer_name, nullif(trim(p_customer_phone), ''), nullif(trim(p_customer_email), ''),
    p_pickup_date, p_pickup_time, nullif(trim(p_notes), ''), v_total, p_deposit_paid, v_user
  )
  returning id into v_id;

  insert into customer_order_items (customer_order_id, recipe_id, description, quantity, unit_price, notes, sort_order)
  select v_id, nullif(e ->> 'recipe_id', '')::uuid, e ->> 'description', (e ->> 'quantity')::integer,
         nullif(e ->> 'unit_price', '')::numeric, nullif(trim(e ->> 'notes'), ''), (ord - 1)::integer
  from jsonb_array_elements(p_items) with ordinality as t(e, ord);

  return v_id;
end;
$$;
revoke all on function public.create_customer_order(text, text, text, date, time, text, numeric, jsonb) from public, anon;
grant execute on function public.create_customer_order(text, text, text, date, time, text, numeric, jsonb) to authenticated;
comment on function public.create_customer_order(text, text, text, date, time, text, numeric, jsonb) is
  'Prenotazione cliente: testata + righe in UNA transazione (063), org-check sulle ricette, viewer escluso.';

-- =============================================================================
-- C) Invio email d'ordine DOPO il commit, con id di invio stabile
-- =============================================================================
alter table purchase_orders add column if not exists dispatch_id uuid;
alter table purchase_orders drop constraint if exists purchase_orders_dispatch_outcome_check;
alter table purchase_orders add constraint purchase_orders_dispatch_outcome_check
  check (dispatch_outcome is null or dispatch_outcome in ('pending', 'delivered', 'manual', 'failed'));
comment on column purchase_orders.dispatch_id is
  'Identificativo STABILE dell''invio al fornitore (063): incluso nel payload email/idempotency-key, così un retry non spedisce due volte.';

create or replace function public.begin_order_dispatch(p_order_id uuid, p_note text default null)
returns table (dispatch_id uuid, should_dispatch boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_org     uuid;
  v_status  order_status;
  v_disp    uuid;
begin
  if v_user is null then
    raise exception 'begin_order_dispatch: utente non autenticato' using errcode = 'P0001';
  end if;
  select po.organization_id, po.status, po.dispatch_id into v_org, v_status, v_disp
  from purchase_orders po where po.id = p_order_id for update;
  if v_org is null or v_org is distinct from current_organization_id() then
    raise exception 'Ordine non trovato.' using errcode = 'P0044';
  end if;

  if v_status = 'draft' then
    v_disp := gen_random_uuid();
    update purchase_orders
    set status = 'sent', sent_at = now(), dispatch_outcome = 'pending', dispatch_id = v_disp
    where id = p_order_id;
    insert into order_status_history (purchase_order_id, from_status, to_status, changed_by, notes)
    values (p_order_id, 'draft', 'sent', v_user, p_note);
    return query select v_disp, true;
    return;
  end if;

  if v_status = 'sent' then
    -- già inviato (o invio in corso): NESSUNA seconda email
    return query select v_disp, false;
    return;
  end if;

  raise exception 'Transizione non consentita % -> sent', v_status using errcode = 'P0040';
end;
$$;
revoke all on function public.begin_order_dispatch(uuid, text) from public, anon;
grant execute on function public.begin_order_dispatch(uuid, text) to authenticated;
comment on function public.begin_order_dispatch(uuid, text) is
  'draft → sent atomico con dispatch_id stabile e outcome pending (063). Se l''ordine è già sent ritorna should_dispatch=false: un doppio submit non rispedisce.';

create or replace function public.record_order_dispatch(
  p_order_id uuid, p_dispatch_id uuid, p_outcome text, p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org  uuid;
begin
  if v_user is null then
    raise exception 'record_order_dispatch: utente non autenticato' using errcode = 'P0001';
  end if;
  if p_outcome not in ('delivered', 'manual', 'failed') then
    raise exception 'Esito di invio non valido: %', p_outcome using errcode = 'P0042';
  end if;
  select organization_id into v_org from purchase_orders where id = p_order_id for update;
  if v_org is null or v_org is distinct from current_organization_id() then
    raise exception 'Ordine non trovato.' using errcode = 'P0044';
  end if;

  update purchase_orders
  set dispatch_outcome = p_outcome
  where id = p_order_id and dispatch_id = p_dispatch_id and dispatch_outcome = 'pending';
  if found and p_note is not null then
    insert into order_status_history (purchase_order_id, from_status, to_status, changed_by, notes)
    values (p_order_id, 'sent', 'sent', v_user, p_note);
  end if;
end;
$$;
revoke all on function public.record_order_dispatch(uuid, uuid, text, text) from public, anon;
grant execute on function public.record_order_dispatch(uuid, uuid, text, text) to authenticated;

-- =============================================================================
-- D) Rimanenza prodotti finiti dai movimenti postati, con riporto
-- =============================================================================
drop view if exists public.v_finished_goods_daily_theoretical;
create view public.v_finished_goods_daily_theoretical
with (security_invoker = on) as
with mv as (
  select organization_id, recipe_id, movement_type, quantity_delta,
         (created_at at time zone 'Europe/Rome')::date as d
  from finished_goods_movements
),
days as (
  select distinct organization_id, recipe_id, d from mv
  union
  -- oggi per ogni prodotto con un saldo: il riporto è visibile anche senza movimenti oggi
  select organization_id, recipe_id, (now() at time zone 'Europe/Rome')::date
  from finished_goods_levels where current_quantity <> 0
),
agg as (
  select dy.organization_id, dy.recipe_id, dy.d,
    coalesce((select sum(m.quantity_delta) from mv m
              where m.organization_id = dy.organization_id and m.recipe_id = dy.recipe_id and m.d < dy.d), 0) as opening_qty,
    coalesce(sum(m.quantity_delta) filter (where m.movement_type = 'production_output'), 0) as produced_qty,
    coalesce(-sum(m.quantity_delta) filter (where m.movement_type in ('sale_deduction', 'sale_reversal')), 0) as sold_qty,
    coalesce(-sum(m.quantity_delta) filter (where m.movement_type = 'waste'), 0) as wasted_qty,
    coalesce(sum(m.quantity_delta) filter (where m.movement_type = 'manual_adjustment'), 0) as adjusted_qty,
    coalesce(sum(m.quantity_delta), 0) as day_net
  from days dy
  left join mv m on m.organization_id = dy.organization_id and m.recipe_id = dy.recipe_id and m.d = dy.d
  group by dy.organization_id, dy.recipe_id, dy.d
)
select
  a.organization_id,
  a.d                              as business_date,
  a.recipe_id                      as sellable_product_id,
  r.name                           as product_name,
  a.produced_qty::numeric          as produced_qty,
  a.sold_qty::numeric              as sold_qty,
  a.wasted_qty::numeric            as wasted_qty,
  (a.opening_qty + a.day_net)::numeric as remaining_theoretical,
  a.opening_qty::numeric           as opening_qty,
  a.adjusted_qty::numeric          as adjusted_qty
from agg a
join recipes r on r.id = a.recipe_id;

comment on view public.v_finished_goods_daily_theoretical is
  '063: rimanenza dai MOVIMENTI postati (giorno Europe/Rome): riporto (opening) + prodotto − venduto (netto storni) − scartato ± rettifiche. Il prodotto con saldo appare anche oggi senza movimenti.';

-- =============================================================================
-- E) Portale fornitore: versione token e collegamento non scrivibili dal client
-- =============================================================================
revoke insert, update on public.suppliers from anon, authenticated;
grant insert (organization_id, name, email, phone, notes, is_active) on public.suppliers to authenticated;
grant update (name, email, phone, notes, is_active) on public.suppliers to authenticated;

create or replace function public.rotate_supplier_portal_token(p_supplier_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org     uuid := public.current_organization_id();
  v_version integer;
begin
  if auth.uid() is null then
    raise exception 'rotate_supplier_portal_token: utente non autenticato' using errcode = 'P0001';
  end if;
  if public.current_org_role() is distinct from 'owner' then
    raise exception 'Solo il titolare può generare i link del portale fornitore.' using errcode = 'P0050';
  end if;
  update suppliers set portal_token_version = portal_token_version + 1
  where id = p_supplier_id and organization_id = v_org
  returning portal_token_version into v_version;
  if v_version is null then
    raise exception 'Fornitore non trovato.' using errcode = 'P0044';
  end if;
  return v_version;
end;
$$;
revoke all on function public.rotate_supplier_portal_token(uuid) from public, anon;
grant execute on function public.rotate_supplier_portal_token(uuid) to authenticated;
comment on function public.rotate_supplier_portal_token(uuid) is
  'Unico modo di ruotare il link del portale (063): solo owner, version+1 revoca i link precedenti.';
