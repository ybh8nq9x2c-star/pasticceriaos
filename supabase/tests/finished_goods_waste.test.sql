-- =============================================================================
-- finished_goods_waste.test.sql
-- Regression test per 056 (invenduto/scarto prodotti finiti):
--   1. un utente (RLS fgm_insert) registra waste negativo sul ledger finiti
--   2. la proiezione finished_goods_levels scala via trigger (20 → 14)
--   3. la vista teorica espone wasted_qty e remaining = produced − sold − wasted
--   4. waste POSITIVO violato dal CHECK di segno (mai "creare" pezzi buttando)
-- Le materie prime NON vengono toccate (nessun movimento inventory_movements).
-- Run AFTER migrations 001–056:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/finished_goods_waste.test.sql
-- Gira in transazione e fa ROLLBACK: non lascia dati.
-- =============================================================================

begin;

insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '77777777-7777-7777-7777-777777777777', 'authenticated', 'authenticated', 'waste@test.local');
insert into organizations (id, name, slug) values ('a9a9a9a9-a9a9-a9a9-a9a9-a9a9a9a9a9a9', 'Waste Org', 'waste-org');
insert into org_members (organization_id, user_id, role) values ('a9a9a9a9-a9a9-a9a9-a9a9-a9a9a9a9a9a9', '77777777-7777-7777-7777-777777777777', 'owner');
insert into recipes (id, organization_id, name, base_portions) values
  ('b9b9b9b9-b9b9-b9b9-b9b9-b9b9b9b9b9b9', 'a9a9a9a9-a9a9-a9a9-a9a9-a9a9a9a9a9a9', 'Cornetto Waste', 10);
insert into production_plans (id, organization_id, plan_date, status, created_by, completed_at)
values ('c9c9c9c9-c9c9-c9c9-c9c9-c9c9c9c9c9c9', 'a9a9a9a9-a9a9-a9a9-a9a9-a9a9a9a9a9a9', current_date, 'completed', '77777777-7777-7777-7777-777777777777', now());
insert into production_plan_items (production_plan_id, recipe_id, batch_count)
values ('c9c9c9c9-c9c9-c9c9-c9c9-c9c9c9c9c9c9', 'b9b9b9b9-b9b9-b9b9-b9b9-b9b9b9b9b9b9', 2);

-- output produzione nel ledger (come farebbe complete_production_plan): +20
insert into finished_goods_movements (organization_id, recipe_id, movement_type, quantity_delta, reference_type)
values ('a9a9a9a9-a9a9-a9a9-a9a9-a9a9a9a9a9a9', 'b9b9b9b9-b9b9-b9b9-b9b9-b9b9b9b9b9b9', 'production_output', 20, 'production_plan');

create or replace function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

select pg_temp.act_as('77777777-7777-7777-7777-777777777777');
do $$
declare v_lvl numeric; v_rem numeric; v_wasted numeric; n int; failed boolean := false;
begin
  insert into finished_goods_movements (organization_id, recipe_id, movement_type, quantity_delta, reference_type, performed_by, notes)
  values ('a9a9a9a9-a9a9-a9a9-a9a9-a9a9a9a9a9a9', 'b9b9b9b9-b9b9-b9b9-b9b9-b9b9b9b9b9b9', 'waste', -6, 'manual', '77777777-7777-7777-7777-777777777777', 'Invenduto');

  -- 2) proiezione via trigger: 20 - 6 = 14
  select current_quantity into v_lvl from finished_goods_levels
  where recipe_id = 'b9b9b9b9-b9b9-b9b9-b9b9-b9b9b9b9b9b9';
  assert v_lvl = 14, 'fg level must be 14, got ' || v_lvl;

  -- 3) vista: produced 20, wasted 6, remaining 14
  select wasted_qty, remaining_theoretical into v_wasted, v_rem
  from v_finished_goods_daily_theoretical
  where sellable_product_id = 'b9b9b9b9-b9b9-b9b9-b9b9-b9b9b9b9b9b9' and business_date = current_date;
  assert v_wasted = 6, 'view wasted must be 6, got ' || v_wasted;
  assert v_rem = 14, 'view remaining must be produced-sold-wasted = 14, got ' || v_rem;

  -- 4) waste positivo → CHECK violato
  begin
    insert into finished_goods_movements (organization_id, recipe_id, movement_type, quantity_delta)
    values ('a9a9a9a9-a9a9-a9a9-a9a9-a9a9a9a9a9a9', 'b9b9b9b9-b9b9-b9b9-b9b9-b9b9b9b9b9b9', 'waste', 3);
  exception when check_violation then failed := true;
  end;
  assert failed, 'positive waste must violate fgm_delta_sign';

  -- dominio separato: NESSUN movimento materie prime creato da tutto questo
  select count(*) into n from inventory_movements
  where organization_id = 'a9a9a9a9-a9a9-a9a9-a9a9-a9a9a9a9a9a9';
  assert n = 0, 'waste must NEVER touch raw-material movements, got ' || n;
end $$;

reset role;
select 'FG WASTE ASSERTIONS PASSED' as result;

rollback;
