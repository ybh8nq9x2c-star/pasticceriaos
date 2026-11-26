-- =============================================================================
-- production_fefo_lots.test.sql — regressione W3 (migration 060).
--   1) i residui dei lotti scendono in ordine FEFO (scadenza più vicina prima),
--      collegati al movimento production_usage;
--   2) una riga con unità incompatibile viene SALTATA e DICHIARATA: nessun
--      movimento, lotti non toccati, finito marcato ingredients_complete=false;
--   3) il doppio completamento è rifiutato (P0040) senza effetti.
-- Transazione + ROLLBACK.
-- =============================================================================
begin;

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '7a000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'w3@test.local');
insert into organizations (id, name, slug, account_type) values
  ('7a000000-0000-0000-0000-00000000000a', 'W3 Org', 'w3-org', 'customer');
insert into org_members (organization_id, user_id, role) values
  ('7a000000-0000-0000-0000-00000000000a', '7a000000-0000-0000-0000-0000000000a1', 'owner');

-- ingredienti: farina in g (lotti), zucchero in pz (la ricetta lo usa in g → incompatibile)
insert into ingredient_products (id, organization_id, name, unit) values
  ('7a000000-0000-0000-0000-0000000001f1', '7a000000-0000-0000-0000-00000000000a', 'Farina W3', 'g'),
  ('7a000000-0000-0000-0000-0000000001c1', '7a000000-0000-0000-0000-00000000000a', 'Zucchero W3', 'pz');

-- lotti farina: il PRIMO a scadere ha 300 g, il secondo 1000 g (inserito prima,
-- per verificare che l'ordine sia per scadenza e non per inserimento)
insert into ingredient_batches (id, organization_id, ingredient_product_id, lot_number, expiry_date, quantity_received, quantity_remaining, unit, received_at) values
  ('7a000000-0000-0000-0000-00000000b0b2', '7a000000-0000-0000-0000-00000000000a', '7a000000-0000-0000-0000-0000000001f1', 'LATE',  current_date + 10, 1000, 1000, 'g', now() - interval '2 days'),
  ('7a000000-0000-0000-0000-00000000b0b1', '7a000000-0000-0000-0000-00000000000a', '7a000000-0000-0000-0000-0000000001f1', 'EARLY', current_date + 2,   300,  300, 'g', now() - interval '1 day'),
  ('7a000000-0000-0000-0000-00000000b0b3', '7a000000-0000-0000-0000-00000000000a', '7a000000-0000-0000-0000-0000000001c1', 'ZUC',   current_date + 5,    10,   10, 'pz', now());

insert into recipes (id, organization_id, name, base_portions) values
  ('7a000000-0000-0000-0000-0000000007e1', '7a000000-0000-0000-0000-00000000000a', 'Pane W3', 10),
  ('7a000000-0000-0000-0000-0000000007e2', '7a000000-0000-0000-0000-00000000000a', 'Biscotto W3', 20);
insert into recipe_ingredients (recipe_id, ingredient_product_id, quantity, unit) values
  ('7a000000-0000-0000-0000-0000000007e1', '7a000000-0000-0000-0000-0000000001f1', 200, 'g'),
  ('7a000000-0000-0000-0000-0000000007e2', '7a000000-0000-0000-0000-0000000001c1',  50, 'g');

insert into production_plans (id, organization_id, plan_date, status, created_by) values
  ('7a000000-0000-0000-0000-0000000009d1', '7a000000-0000-0000-0000-00000000000a', current_date, 'draft', '7a000000-0000-0000-0000-0000000000a1');
insert into production_plan_items (production_plan_id, recipe_id, batch_count) values
  ('7a000000-0000-0000-0000-0000000009d1', '7a000000-0000-0000-0000-0000000007e1', 2),
  ('7a000000-0000-0000-0000-0000000009d1', '7a000000-0000-0000-0000-0000000007e2', 1);

create or replace function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

select pg_temp.act_as('7a000000-0000-0000-0000-0000000000a1');

do $$
declare
  v_report jsonb; v_stored jsonb; v_mov uuid;
  v_early numeric; v_late numeric; v_zuc numeric; n int; v_ok boolean;
begin
  v_report := public.complete_production_plan('7a000000-0000-0000-0000-0000000009d1');

  -- 1) FEFO: 400 g richiesti → EARLY 300→0, LATE 1000→900
  select quantity_remaining into v_early from ingredient_batches where id = '7a000000-0000-0000-0000-00000000b0b1';
  select quantity_remaining into v_late  from ingredient_batches where id = '7a000000-0000-0000-0000-00000000b0b2';
  assert v_early = 0,   'W3-1: lotto EARLY doveva scendere a 0, trovato '   || v_early;
  assert v_late  = 900, 'W3-1: lotto LATE doveva scendere a 900, trovato ' || v_late;

  select id into v_mov from inventory_movements
  where reference_id = '7a000000-0000-0000-0000-0000000009d1'
    and ingredient_product_id = '7a000000-0000-0000-0000-0000000001f1'
    and movement_type = 'production_usage';
  assert v_mov is not null, 'W3-1: movimento production_usage della farina mancante';
  select count(*) into n from production_batch_ingredients
  where production_plan_id = '7a000000-0000-0000-0000-0000000009d1' and inventory_movement_id = v_mov;
  assert n = 2, 'W3-1: 2 consumi lotto collegati al movimento, trovati ' || n;
  assert (select quantity_delta from inventory_movements where id = v_mov) = -400,
    'W3-1: lo scarico farina deve essere -400 g';

  -- 2) zucchero: riga saltata + dichiarata, nessun movimento, lotto intatto
  select count(*) into n from inventory_movements
  where reference_id = '7a000000-0000-0000-0000-0000000009d1'
    and ingredient_product_id = '7a000000-0000-0000-0000-0000000001c1';
  assert n = 0, 'W3-2: nessun movimento per la riga incompatibile, trovati ' || n;
  select quantity_remaining into v_zuc from ingredient_batches where id = '7a000000-0000-0000-0000-00000000b0b3';
  assert v_zuc = 10, 'W3-2: il lotto dello zucchero non va toccato, residuo ' || v_zuc;

  assert jsonb_array_length(v_report -> 'skipped') = 1, 'W3-2: atteso 1 riga saltata nell''esito';
  assert v_report -> 'skipped' -> 0 ->> 'reason' = 'unit_incompatible', 'W3-2: motivo atteso unit_incompatible';
  select (o ->> 'ingredients_complete')::boolean into v_ok
  from jsonb_array_elements(v_report -> 'output') o where o ->> 'recipe_name' = 'Biscotto W3';
  assert v_ok = false, 'W3-2: il Biscotto deve risultare ingredients_complete=false';
  select (o ->> 'ingredients_complete')::boolean into v_ok
  from jsonb_array_elements(v_report -> 'output') o where o ->> 'recipe_name' = 'Pane W3';
  assert v_ok = true, 'W3-2: il Pane deve risultare ingredients_complete=true';
  assert (select notes from finished_goods_movements
          where reference_id = '7a000000-0000-0000-0000-0000000009d1'
            and recipe_id = '7a000000-0000-0000-0000-0000000007e2') like '%INCOMPLETO%',
    'W3-2: il movimento finito del Biscotto deve dichiarare il consumo incompleto';

  -- esito salvato sul piano (UI)
  select completion_report into v_stored from production_plans where id = '7a000000-0000-0000-0000-0000000009d1';
  assert v_stored = v_report, 'W3: completion_report salvato deve coincidere con l''esito restituito';

  -- 3) doppio completamento → P0040, nessun effetto
  begin
    perform public.complete_production_plan('7a000000-0000-0000-0000-0000000009d1');
    raise exception 'W3-3: il secondo completamento doveva fallire';
  exception when sqlstate 'P0040' then null;
  end;
  select count(*) into n from inventory_movements where reference_id = '7a000000-0000-0000-0000-0000000009d1';
  assert n = 1, 'W3-3: nessun movimento aggiuntivo dopo il rifiuto, totale ' || n;
  select quantity_remaining into v_late from ingredient_batches where id = '7a000000-0000-0000-0000-00000000b0b2';
  assert v_late = 900, 'W3-3: i lotti non devono scendere di nuovo, LATE ' || v_late;
end $$;

reset role;
do $$ begin raise notice 'production_fefo_lots: OK'; end $$;
rollback;
