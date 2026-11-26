-- =============================================================================
-- pos_binding.test.sql — regressione W5 (migration 062, ADR 003).
--   1) il tenant NON sceglie lo schema del segreto né tocca versione/verifica
--      (privilegi di colonna): 'legacy_global' non è selezionabile;
--   2) rotazione solo via RPC: version+1, verifica azzerata; viewer/altra org no;
--   3) stati espliciti di pos_events ('pending' non più ammesso, default received)
--      + unicità di idempotenza;
--   4) lo stesso scontrino ingerito due volte (retry) → UNA sola vendita.
-- Transazione + ROLLBACK.
-- =============================================================================
begin;

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'w5-a@test.local'),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-0000000000a9', 'authenticated', 'authenticated', 'w5-v@test.local'),
  ('00000000-0000-0000-0000-000000000000', 'b5000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'w5-b@test.local');
insert into organizations (id, name, slug, account_type) values
  ('a5000000-0000-0000-0000-00000000000a', 'W5 A', 'w5-a', 'customer'),
  ('b5000000-0000-0000-0000-00000000000b', 'W5 B', 'w5-b', 'customer');
insert into org_members (organization_id, user_id, role) values
  ('a5000000-0000-0000-0000-00000000000a', 'a5000000-0000-0000-0000-0000000000a1', 'owner'),
  ('a5000000-0000-0000-0000-00000000000a', 'a5000000-0000-0000-0000-0000000000a9', 'viewer'),
  ('b5000000-0000-0000-0000-00000000000b', 'b5000000-0000-0000-0000-0000000000b1', 'owner');

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

-- ═══ 1) config: schema/versione/verifica non scrivibili dal tenant ═══════════
select pg_temp.act_as('a5000000-0000-0000-0000-0000000000a1');
insert into pos_configs (organization_id, provider, store_id)
values ('a5000000-0000-0000-0000-00000000000a', 'mipos', 'W5-STORE-A');

do $$ declare v_scheme text; v_ver int; begin
  select secret_scheme, secret_version into v_scheme, v_ver from pos_configs where store_id = 'W5-STORE-A';
  assert v_scheme = 'derived' and v_ver = 1, 'W5-1: nuova config = derived v1, trovato ' || v_scheme || ' v' || v_ver;
end $$;

update pos_configs set store_id = 'W5-STORE-A2' where store_id = 'W5-STORE-A';   -- consentito
select pg_temp.expect_error(
  $q$update pos_configs set secret_scheme = 'legacy_global' where store_id = 'W5-STORE-A2'$q$,
  '42501', 'W5-1a tenant sceglie legacy_global');
select pg_temp.expect_error(
  $q$update pos_configs set secret_version = 1 where store_id = 'W5-STORE-A2'$q$,
  '42501', 'W5-1b tenant tocca la versione');
select pg_temp.expect_error(
  $q$update pos_configs set verified_at = now() where store_id = 'W5-STORE-A2'$q$,
  '42501', 'W5-1c tenant si auto-verifica');
select pg_temp.expect_error(
  $q$insert into pos_configs (organization_id, provider, store_id, secret_scheme)
     values ('a5000000-0000-0000-0000-00000000000a', 'other', 'W5-X', 'legacy_global')$q$,
  '42501', 'W5-1d insert con schema legacy');

-- ═══ 2) rotazione ════════════════════════════════════════════════════════════
create temp table w5 as select id from pos_configs where store_id = 'W5-STORE-A2';
grant select on w5 to authenticated;
reset role;
update pos_configs set verified_at = now() where store_id = 'W5-STORE-A2';  -- come farebbe il webhook (service)
select pg_temp.act_as('a5000000-0000-0000-0000-0000000000a1');
do $$ declare v int; v_ver int; v_ver_at timestamptz; begin
  v := public.rotate_pos_webhook_secret((select id from w5));
  select secret_version, verified_at into v_ver, v_ver_at from pos_configs where id = (select id from w5);
  assert v = 2 and v_ver = 2, 'W5-2: rotazione → versione 2, trovato ' || v_ver;
  assert v_ver_at is null, 'W5-2: la rotazione azzera la verifica';
end $$;

select pg_temp.act_as('a5000000-0000-0000-0000-0000000000a9');
select pg_temp.expect_error(
  $q$select public.rotate_pos_webhook_secret((select id from w5))$q$, 'P0050', 'W5-2a viewer ruota');
select pg_temp.act_as('b5000000-0000-0000-0000-0000000000b1');
select pg_temp.expect_error(
  $q$select public.rotate_pos_webhook_secret((select id from w5))$q$, 'P0044', 'W5-2b altra org ruota');

-- ═══ 3) stati di pos_events ══════════════════════════════════════════════════
reset role;
select pg_temp.expect_error(
  $q$insert into pos_events (organization_id, provider, external_receipt_id, raw_payload, status, event_type, external_store_id)
     values ('a5000000-0000-0000-0000-00000000000a', 'mipos', 'R-PEND', '{}', 'pending', 'sale', 'W5-STORE-A2')$q$,
  '23514', 'W5-3a stato pending non più ammesso');
insert into pos_events (organization_id, provider, external_receipt_id, raw_payload, event_type, external_store_id)
values ('a5000000-0000-0000-0000-00000000000a', 'mipos', 'R-1', '{}', 'sale', 'W5-STORE-A2');
do $$ declare v text; begin
  select status into v from pos_events where external_receipt_id = 'R-1';
  assert v = 'received', 'W5-3: default received, trovato ' || v;
end $$;
select pg_temp.expect_error(
  $q$insert into pos_events (organization_id, provider, external_receipt_id, raw_payload, event_type, external_store_id)
     values ('a5000000-0000-0000-0000-00000000000a', 'mipos', 'R-1', '{}', 'sale', 'W5-STORE-A2')$q$,
  '23505', 'W5-3b idempotenza: stesso scontrino/stesso tipo');

-- ═══ 4) retry dello stesso scontrino → una sola vendita ══════════════════════
do $$ declare s1 uuid; s2 uuid; n int; p jsonb; begin
  p := jsonb_build_object(
    'external_sale_id', 'R-1', 'source', 'pos:mipos', 'sold_at', now(), 'total_amount', 2.4,
    'lines', jsonb_build_array(jsonb_build_object(
      'external_line_id', '0', 'external_product_ref', 'PLU-X', 'product_name_snapshot', 'X',
      'quantity', 1, 'unit_price', 2.4)));
  s1 := public.ingest_sale_system('a5000000-0000-0000-0000-00000000000a', p);
  s2 := public.ingest_sale_system('a5000000-0000-0000-0000-00000000000a', p);  -- reinvio dopo errore
  select count(*) into n from sales
  where organization_id = 'a5000000-0000-0000-0000-00000000000a' and external_sale_id = 'R-1';
  assert s1 = s2, 'W5-4: il reinvio deve restituire la stessa vendita';
  assert n = 1, 'W5-4: esattamente UNA vendita, trovate ' || n;
end $$;

do $$ begin raise notice 'pos_binding: OK'; end $$;
rollback;
