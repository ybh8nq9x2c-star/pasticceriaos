-- =============================================================================
-- daily_use.test.sql — regressione W6 (migration 063).
--   A) produzione rapida: due volte nello stesso giorno OK; il completamento del
--      piano non riscarica le infornate rapide; rapida anche a piano completato;
--      righe in bozza non scendono sotto il già postato (P0047);
--   B) prenotazione cliente atomica (righe non valide → niente testata orfana);
--   C) invio ordine: doppio submit → un solo "da spedire", esito legato all'id;
--   D) rimanenza dai movimenti con riporto, tutti i prodotti;
--   E) portale: versione token/collegamento non scrivibili dal client, rotazione RPC.
-- Transazione + ROLLBACK.
-- =============================================================================
begin;

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', 'd6000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'w6-owner@test.local'),
  ('00000000-0000-0000-0000-000000000000', 'd6000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'w6-baker@test.local');
insert into organizations (id, name, slug, account_type) values
  ('d6000000-0000-0000-0000-00000000000a', 'W6 Org', 'w6-org', 'customer');
insert into org_members (organization_id, user_id, role) values
  ('d6000000-0000-0000-0000-00000000000a', 'd6000000-0000-0000-0000-0000000000a1', 'owner'),
  ('d6000000-0000-0000-0000-00000000000a', 'd6000000-0000-0000-0000-0000000000a2', 'baker');
insert into ingredient_products (id, organization_id, name, unit) values
  ('d6000000-0000-0000-0000-0000000001f1', 'd6000000-0000-0000-0000-00000000000a', 'Farina W6', 'g');
insert into recipes (id, organization_id, name, base_portions) values
  ('d6000000-0000-0000-0000-0000000007a1', 'd6000000-0000-0000-0000-00000000000a', 'Cornetto W6', 10),
  ('d6000000-0000-0000-0000-0000000007a2', 'd6000000-0000-0000-0000-00000000000a', 'Pane W6', 5);
insert into recipe_ingredients (recipe_id, ingredient_product_id, quantity, unit) values
  ('d6000000-0000-0000-0000-0000000007a1', 'd6000000-0000-0000-0000-0000000001f1', 100, 'g'),
  ('d6000000-0000-0000-0000-0000000007a2', 'd6000000-0000-0000-0000-0000000001f1', 200, 'g');
insert into suppliers (id, organization_id, name, email) values
  ('d6000000-0000-0000-0000-0000000005a1', 'd6000000-0000-0000-0000-00000000000a', 'Sup W6', 'w6s@test.local');

create or replace function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;
create or replace function pg_temp.expect_error(p_sql text, p_state text, p_label text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_state then return; end if;
    raise exception '[%] atteso SQLSTATE %, ottenuto % (%)', p_label, p_state, sqlstate, sqlerrm;
  end;
  raise exception '[%] lo statement doveva fallire con % ma è passato', p_label, p_state;
end; $$;

select pg_temp.act_as('d6000000-0000-0000-0000-0000000000a1');

-- ═══ A) produzione rapida ════════════════════════════════════════════════════
select public.quick_produce('d6000000-0000-0000-0000-0000000007a1', 1);
select public.quick_produce('d6000000-0000-0000-0000-0000000007a1', 2);   -- 2ª nello stesso giorno: OK
do $$ declare n int; v_b int; v_p int; v_fg numeric; v_raw numeric; begin
  select count(*) into n from production_plans
  where organization_id = 'd6000000-0000-0000-0000-00000000000a'
    and plan_date = (now() at time zone 'Europe/Rome')::date;
  assert n = 1, 'W6-A1: un solo piano del giorno, trovati ' || n;
  select batch_count, posted_batch_count into v_b, v_p from production_plan_items
  where recipe_id = 'd6000000-0000-0000-0000-0000000007a1';
  assert v_b = 3 and v_p = 3, 'W6-A1: riga 3 infornate, 3 postate; trovato ' || v_b || '/' || v_p;
  select current_quantity into v_fg from finished_goods_levels where recipe_id = 'd6000000-0000-0000-0000-0000000007a1';
  assert v_fg = 30, 'W6-A1: 3 infornate × 10 = 30 cornetti, trovato ' || v_fg;
  select current_quantity into v_raw from inventory_levels where ingredient_product_id = 'd6000000-0000-0000-0000-0000000001f1';
  assert v_raw = -300, 'W6-A1: farina −300 g, trovato ' || v_raw;
end $$;

-- la bozza del giorno riceve un'altra ricetta (Pane) e si prova a togliere infornate postate
select pg_temp.expect_error(
  $q$select public.save_production_plan(
       (select id from production_plans where organization_id = 'd6000000-0000-0000-0000-00000000000a'),
       null, null,
       '[{"recipe_id":"d6000000-0000-0000-0000-0000000007a1","batch_count":1}]'::jsonb)$q$,
  'P0047', 'W6-A2 scendere sotto le infornate postate');
select public.save_production_plan(
  (select id from production_plans where organization_id = 'd6000000-0000-0000-0000-00000000000a'),
  null, 'Piano del giorno',
  '[{"recipe_id":"d6000000-0000-0000-0000-0000000007a1","batch_count":3},
    {"recipe_id":"d6000000-0000-0000-0000-0000000007a2","batch_count":2}]'::jsonb);

-- completamento: posta SOLO il Pane (2 × 200 g, 2 × 5 pz); i cornetti rapidi NON si riscaricano
select public.complete_production_plan((select id from production_plans where organization_id = 'd6000000-0000-0000-0000-00000000000a'));
do $$ declare v_c numeric; v_p numeric; v_raw numeric; begin
  select current_quantity into v_c from finished_goods_levels where recipe_id = 'd6000000-0000-0000-0000-0000000007a1';
  select current_quantity into v_p from finished_goods_levels where recipe_id = 'd6000000-0000-0000-0000-0000000007a2';
  select current_quantity into v_raw from inventory_levels where ingredient_product_id = 'd6000000-0000-0000-0000-0000000001f1';
  assert v_c = 30, 'W6-A3: cornetti NON riscaricati (30), trovato ' || v_c;
  assert v_p = 10, 'W6-A3: pane 2 × 5 = 10, trovato ' || v_p;
  assert v_raw = -700, 'W6-A3: farina −300 −400 = −700 g, trovato ' || v_raw;
end $$;

-- rapida anche a piano COMPLETATO (correzione di saldo più volte al giorno)
select public.quick_produce('d6000000-0000-0000-0000-0000000007a1', 1);
do $$ declare v_c numeric; v_b int; v_p int; begin
  select current_quantity into v_c from finished_goods_levels where recipe_id = 'd6000000-0000-0000-0000-0000000007a1';
  select batch_count, posted_batch_count into v_b, v_p from production_plan_items where recipe_id = 'd6000000-0000-0000-0000-0000000007a1';
  assert v_c = 40, 'W6-A4: +1 infornata a piano completato → 40, trovato ' || v_c;
  assert v_b = 4 and v_p = 4, 'W6-A4: riga 4/4, trovato ' || v_b || '/' || v_p;
end $$;
-- il client non può falsare le infornate postate
select pg_temp.expect_error(
  $q$update production_plan_items set posted_batch_count = 0 where recipe_id = 'd6000000-0000-0000-0000-0000000007a1'$q$,
  '42501', 'W6-A5 client scrive posted_batch_count');

-- ═══ B) prenotazione atomica ═════════════════════════════════════════════════
select pg_temp.expect_error(
  $q$select public.create_customer_order('Rossi', null, null, current_date + 1, null, null, null,
       '[{"description":"Torta","quantity":1,"unit_price":20},
         {"recipe_id":"00000000-0000-0000-0000-000000000bad","description":"X","quantity":1}]'::jsonb)$q$,
  'P0045', 'W6-B1 riga con ricetta non valida');
do $$ declare n int; begin
  select count(*) into n from customer_orders where organization_id = 'd6000000-0000-0000-0000-00000000000a';
  assert n = 0, 'W6-B1: nessuna testata orfana, trovate ' || n;
end $$;
do $$ declare v_id uuid; n int; v_tot numeric; begin
  v_id := public.create_customer_order('Bianchi', '333', null, current_date + 1, '10:30', 'senza glutine', 5,
    '[{"recipe_id":"d6000000-0000-0000-0000-0000000007a1","description":"Cornetti","quantity":6,"unit_price":1.5},
      {"description":"Torta","quantity":1,"unit_price":20}]'::jsonb);
  select count(*) into n from customer_order_items where customer_order_id = v_id;
  select total_amount into v_tot from customer_orders where id = v_id;
  assert n = 2, 'W6-B2: 2 righe, trovate ' || n;
  assert v_tot = 29, 'W6-B2: totale 6×1.5 + 20 = 29, trovato ' || v_tot;
end $$;

-- ═══ C) invio ordine dopo commit, id stabile ═════════════════════════════════
reset role;
insert into purchase_orders (id, organization_id, supplier_id, status, order_date, created_by) values
  ('d6000000-0000-0000-0000-0000000009a1', 'd6000000-0000-0000-0000-00000000000a', 'd6000000-0000-0000-0000-0000000005a1',
   'draft', current_date, 'd6000000-0000-0000-0000-0000000000a1');
select pg_temp.act_as('d6000000-0000-0000-0000-0000000000a1');
do $$ declare r1 record; r2 record; v_out text; n int; begin
  select * into r1 from public.begin_order_dispatch('d6000000-0000-0000-0000-0000000009a1');
  select * into r2 from public.begin_order_dispatch('d6000000-0000-0000-0000-0000000009a1');   -- doppio submit
  assert r1.should_dispatch = true,  'W6-C1: il primo invio deve spedire';
  assert r2.should_dispatch = false, 'W6-C1: il doppio submit NON deve rispedire';
  assert r1.dispatch_id = r2.dispatch_id, 'W6-C1: id di invio stabile';
  select count(*) into n from order_status_history
  where purchase_order_id = 'd6000000-0000-0000-0000-0000000009a1' and to_status = 'sent' and from_status = 'draft';
  assert n = 1, 'W6-C1: una sola transizione draft→sent, trovate ' || n;

  perform public.record_order_dispatch('d6000000-0000-0000-0000-0000000009a1', gen_random_uuid(), 'failed');  -- id sbagliato
  select dispatch_outcome into v_out from purchase_orders where id = 'd6000000-0000-0000-0000-0000000009a1';
  assert v_out = 'pending', 'W6-C2: un esito con id diverso non tocca l''invio, trovato ' || v_out;
  perform public.record_order_dispatch('d6000000-0000-0000-0000-0000000009a1', r1.dispatch_id, 'delivered', 'ok');
  select dispatch_outcome into v_out from purchase_orders where id = 'd6000000-0000-0000-0000-0000000009a1';
  assert v_out = 'delivered', 'W6-C2: esito registrato, trovato ' || v_out;
end $$;

-- ═══ D) rimanenza dai movimenti, con riporto ═════════════════════════════════
reset role;
-- Pane: ieri prodotti 10 e venduti 4 → oggi riporto 6, nessun movimento oggi
-- (i 10 di oggi dal piano sopra sono del Pane: li spostiamo a ieri per isolare il caso)
update finished_goods_movements set created_at = now() - interval '1 day'
where recipe_id = 'd6000000-0000-0000-0000-0000000007a2';
insert into finished_goods_movements (organization_id, recipe_id, movement_type, quantity_delta, reference_type, created_at)
values ('d6000000-0000-0000-0000-00000000000a', 'd6000000-0000-0000-0000-0000000007a2', 'manual_adjustment', -4, 'manual', now() - interval '1 day');
-- Cornetti: oggi 40 prodotti, 3 buttati
insert into finished_goods_movements (organization_id, recipe_id, movement_type, quantity_delta, reference_type)
values ('d6000000-0000-0000-0000-00000000000a', 'd6000000-0000-0000-0000-0000000007a1', 'waste', -3, 'manual');
select pg_temp.act_as('d6000000-0000-0000-0000-0000000000a1');
do $$ declare v record; n int; begin
  select count(*) into n from v_finished_goods_daily_theoretical
  where organization_id = 'd6000000-0000-0000-0000-00000000000a'
    and business_date = (now() at time zone 'Europe/Rome')::date;
  assert n = 2, 'W6-D1: oggi compaiono ENTRAMBI i prodotti (anche il pane senza movimenti oggi), trovati ' || n;

  select * into v from v_finished_goods_daily_theoretical
  where sellable_product_id = 'd6000000-0000-0000-0000-0000000007a2'
    and business_date = (now() at time zone 'Europe/Rome')::date;
  assert v.opening_qty = 6 and v.produced_qty = 0 and v.remaining_theoretical = 6,
    'W6-D2: pane riporto 6, prodotto oggi 0, rimanenza 6; trovato ' || v.opening_qty || '/' || v.produced_qty || '/' || v.remaining_theoretical;

  select * into v from v_finished_goods_daily_theoretical
  where sellable_product_id = 'd6000000-0000-0000-0000-0000000007a1'
    and business_date = (now() at time zone 'Europe/Rome')::date;
  assert v.produced_qty = 40 and v.wasted_qty = 3 and v.remaining_theoretical = 37,
    'W6-D3: cornetti 40 prodotti, 3 buttati, rimanenza 37; trovato ' || v.produced_qty || '/' || v.wasted_qty || '/' || v.remaining_theoretical;
end $$;

-- ═══ E) portale fornitore ════════════════════════════════════════════════════
select pg_temp.expect_error(
  $q$update suppliers set portal_token_version = 99 where id = 'd6000000-0000-0000-0000-0000000005a1'$q$,
  '42501', 'W6-E1 client scrive portal_token_version');
select pg_temp.expect_error(
  $q$update suppliers set supplier_org_id = 'd6000000-0000-0000-0000-00000000000a' where id = 'd6000000-0000-0000-0000-0000000005a1'$q$,
  '42501', 'W6-E2 client finge un collegamento BakeryOS');
update suppliers set phone = '0123' where id = 'd6000000-0000-0000-0000-0000000005a1';   -- anagrafica: consentito
do $$ declare v int; begin
  v := public.rotate_supplier_portal_token('d6000000-0000-0000-0000-0000000005a1');
  assert v = 2, 'W6-E3: rotazione → versione 2, trovato ' || v;
end $$;
select pg_temp.act_as('d6000000-0000-0000-0000-0000000000a2');
select pg_temp.expect_error(
  $q$select public.rotate_supplier_portal_token('d6000000-0000-0000-0000-0000000005a1')$q$,
  'P0050', 'W6-E4 non-owner ruota il link');

reset role;
do $$ begin raise notice 'daily_use: OK'; end $$;
rollback;
