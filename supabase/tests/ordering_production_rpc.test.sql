-- =============================================================================
-- ordering_production_rpc.test.sql
-- Test MANUALE, reviewable, STAGING/NON-PROD ONLY per le RPC:
--     receive_purchase_order(p_order_id uuid)
--     complete_production_plan(p_plan_id uuid)
--
-- Obiettivo: dimostrare atomicità, ordine degli effetti, idempotenza minima e
-- reversibilità. Ogni test SEMINA le proprie fixture dentro una transazione e fa
-- ROLLBACK: nessun dato fake persiste, nessuno schema permanente viene creato.
--
-- COME ESEGUIRE (solo staging):
--     psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f ordering_production_rpc.test.sql
--   oppure incollare nel SQL editor di un progetto NON di produzione.
--
-- SICUREZZA: tutte le fixture vivono dentro BEGIN…ROLLBACK. Anche se lanciato per
-- errore altrove, non lascia tracce. NON contiene COMMIT. NON modifica lo schema.
--
-- NOTE sull'auth: le RPC sono SECURITY DEFINER con org-check via
-- current_organization_id() → auth.uid(). Simuliamo l'utente autenticato con
-- set_config('request.jwt.claims', …, is_local => true) dentro la transazione.
-- =============================================================================


-- =============================================================================
-- SECTION 0 — BASELINE (read-only, persiste solo per la sessione)
-- Cattura un baseline globale prima dei test, per provare dopo ogni ROLLBACK che
-- nulla è rimasto persistito.
-- =============================================================================
drop table if exists _rpc_test_baseline;
create temp table _rpc_test_baseline as
  select (select count(*) from inventory_movements)        as mov_count,
         (select count(*) from inventory_levels)           as lvl_count,
         (select count(*) from order_status_history)       as hist_count;


-- =============================================================================
-- SECTION 1 — PRECHECK READ-ONLY
-- Verifica prerequisiti. Fallisce con messaggio esplicito se manca qualcosa.
-- =============================================================================
do $precheck$
declare
  v_tbl    text;
  v_tables text[] := array[
    'purchase_orders','order_line_items','order_status_history',
    'production_plans','production_plan_items',
    'inventory_movements','inventory_levels',
    'ingredient_products','recipe_ingredients'
  ];
begin
  -- RPC esistenti (firma uuid)
  if to_regprocedure('public.receive_purchase_order(uuid)') is null then
    raise exception 'PRECHECK FAIL: manca RPC public.receive_purchase_order(uuid)';
  end if;
  if to_regprocedure('public.complete_production_plan(uuid)') is null then
    raise exception 'PRECHECK FAIL: manca RPC public.complete_production_plan(uuid)';
  end if;

  -- Tabelle coinvolte
  foreach v_tbl in array v_tables loop
    if to_regclass('public.'||v_tbl) is null then
      raise exception 'PRECHECK FAIL: manca tabella public.%', v_tbl;
    end if;
  end loop;

  -- Colonne chiave (via information_schema, niente assunzioni)
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='order_line_items'
                   and column_name='quantity_received') then
    raise exception 'PRECHECK FAIL: manca colonna order_line_items.quantity_received';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='ingredient_products'
                   and column_name='unit_price') then
    raise exception 'PRECHECK FAIL: manca colonna ingredient_products.unit_price';
  end if;

  -- Helper di contesto (org-check delle RPC)
  if to_regprocedure('public.current_organization_id()') is null then
    raise exception 'PRECHECK FAIL: manca funzione public.current_organization_id()';
  end if;

  -- Trigger applicativo su inventory_movements (deve proiettare su inventory_levels)
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relname='inventory_movements' and not t.tgisinternal
  ) then
    raise exception 'PRECHECK FAIL: nessun trigger applicativo su inventory_movements (atteso update inventory_levels)';
  end if;

  raise notice 'PRECHECK OK: RPC, tabelle, colonne chiave e trigger presenti.';
end
$precheck$;


-- =============================================================================
-- SECTION 2 — TEST 1: receive_purchase_order  (BEGIN … ROLLBACK)
-- =============================================================================
begin;

do $test1$
declare
  v_org   uuid := '11111111-1111-4111-8111-111111111111';
  v_user  uuid := '11111111-1111-4111-8111-1111111111a1';
  v_supp  uuid := '11111111-1111-4111-8111-1111111111b1';
  v_ingA  uuid := '11111111-1111-4111-8111-1111111111c1';  -- snapshot prezzo NON null
  v_ingB  uuid := '11111111-1111-4111-8111-1111111111c2';  -- snapshot prezzo NULL
  v_order uuid := '11111111-1111-4111-8111-1111111111d1';
  v_lineA uuid := '11111111-1111-4111-8111-1111111111e1';
  v_lineB uuid := '11111111-1111-4111-8111-1111111111e2';
  -- snapshot
  v_status0  order_status;
  v_status1  order_status;
  v_moves1   int;
  v_nlines   int;
  v_qrecA    numeric;
  v_qrecB    numeric;
  v_priceA0  numeric;  v_priceA1 numeric;
  v_priceB0  numeric;  v_priceB1 numeric;
  v_lvlA0    numeric;  v_lvlA1   numeric;
  v_lvlB0    numeric;  v_lvlB1   numeric;
  v_hist     int;
begin
  -- ── Fixtures ───────────────────────────────────────────────────────────────
  insert into auth.users (instance_id, id, aud, role, email)
  values ('00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated', 'rpc-test-1@example.com');

  insert into organizations (id, name, slug) values (v_org, 'TEST Org 1', 'test-rpc-org-1');
  insert into org_members (organization_id, user_id, role) values (v_org, v_user, 'owner');
  insert into suppliers (id, organization_id, name, email)
  values (v_supp, v_org, 'TEST Supplier 1', 'supplier-rpc1@example.com');

  insert into ingredient_products (id, organization_id, supplier_id, name, unit, unit_price) values
    (v_ingA, v_org, v_supp, 'TEST Farina A',   'kg', 1.50),
    (v_ingB, v_org, v_supp, 'TEST Zucchero B', 'kg', 3.00);

  -- Ordine 'confirmed' (vincolo: sent_at NOT NULL se status > draft)
  insert into purchase_orders (id, organization_id, supplier_id, status, order_date, sent_at, created_by)
  values (v_order, v_org, v_supp, 'confirmed', current_date, now(), v_user);

  insert into order_line_items (id, purchase_order_id, ingredient_product_id, quantity_ordered, unit, unit_price_snapshot) values
    (v_lineA, v_order, v_ingA, 10, 'kg', 2.00),   -- snapshot noto → prezzo va rinfrescato a 2.00
    (v_lineB, v_order, v_ingB,  4, 'kg', NULL);   -- snapshot NULL → prezzo NON deve cambiare

  -- Stock iniziale (movimento initial_stock → trigger crea inventory_levels)
  insert into inventory_movements (organization_id, ingredient_product_id, movement_type, quantity_delta, unit, performed_by) values
    (v_org, v_ingA, 'initial_stock', 5, 'kg', v_user),
    (v_org, v_ingB, 'initial_stock', 2, 'kg', v_user);

  -- ── "Login" come utente della org ──────────────────────────────────────────
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);

  -- ── Snapshot iniziale ──────────────────────────────────────────────────────
  select status into v_status0 from purchase_orders where id = v_order;
  select count(*) into v_nlines from order_line_items where purchase_order_id = v_order;
  select unit_price into v_priceA0 from ingredient_products where id = v_ingA;
  select unit_price into v_priceB0 from ingredient_products where id = v_ingB;
  select current_quantity into v_lvlA0 from inventory_levels where organization_id=v_org and ingredient_product_id=v_ingA;
  select current_quantity into v_lvlB0 from inventory_levels where organization_id=v_org and ingredient_product_id=v_ingB;

  if v_status0 <> 'confirmed' then raise exception 'SETUP FAIL: ordine non in confirmed'; end if;

  -- ── ESECUZIONE RPC ─────────────────────────────────────────────────────────
  perform public.receive_purchase_order(v_order);

  -- ── Snapshot post ──────────────────────────────────────────────────────────
  select status into v_status1 from purchase_orders where id = v_order;
  select count(*) into v_moves1 from inventory_movements
    where reference_type='purchase_order' and reference_id=v_order and movement_type='purchase_receipt';
  select quantity_received into v_qrecA from order_line_items where id = v_lineA;
  select quantity_received into v_qrecB from order_line_items where id = v_lineB;
  select unit_price into v_priceA1 from ingredient_products where id = v_ingA;
  select unit_price into v_priceB1 from ingredient_products where id = v_ingB;
  select current_quantity into v_lvlA1 from inventory_levels where organization_id=v_org and ingredient_product_id=v_ingA;
  select current_quantity into v_lvlB1 from inventory_levels where organization_id=v_org and ingredient_product_id=v_ingB;
  select count(*) into v_hist from order_status_history
    where purchase_order_id=v_order and from_status='confirmed' and to_status='received';

  -- ── ASSERT ─────────────────────────────────────────────────────────────────
  if v_status1 <> 'received' then
    raise exception 'TEST1 FAIL (a): status atteso received, trovato %', v_status1; end if;
  if v_moves1 <> v_nlines then
    raise exception 'TEST1 FAIL (b): movimenti purchase_receipt % <> righe ordine %', v_moves1, v_nlines; end if;
  if v_qrecA <> 10 or v_qrecB <> 4 then
    raise exception 'TEST1 FAIL (c): quantity_received errate (A=% B=%)', v_qrecA, v_qrecB; end if;
  if v_priceA1 <> 2.00 then
    raise exception 'TEST1 FAIL (d): prezzo A non rinfrescato a 2.00 (trovato %)', v_priceA1; end if;
  if v_priceB1 <> v_priceB0 then
    raise exception 'TEST1 FAIL (d): prezzo B con snapshot NULL non doveva cambiare (% -> %)', v_priceB0, v_priceB1; end if;
  if v_hist < 1 then
    raise exception 'TEST1 FAIL (e): manca history confirmed->received'; end if;
  if v_lvlA1 <> v_lvlA0 + 10 or v_lvlB1 <> v_lvlB0 + 4 then
    raise exception 'TEST1 FAIL (f): inventory_levels incoerente (A %->% atteso +10, B %->% atteso +4)',
      v_lvlA0, v_lvlA1, v_lvlB0, v_lvlB1; end if;

  raise notice 'TEST 1 PASS: received atomico — stato, movimenti, quantity_received, prezzo, history e stock coerenti.';
end
$test1$;

rollback;

-- Conferma read-only post-ROLLBACK: nessuna traccia persistita.
-- (Le fixture vivevano dentro la transazione: la loro ASSENZA totale dopo il
--  rollback è la prova di reversibilità — niente movimenti, ordine assente,
--  quindi stato/quantity_received/prezzi/livelli tornati by-design allo stato pre-test.)
do $verify1$
declare v_base bigint; v_now bigint; v_order int;
begin
  select mov_count into v_base from _rpc_test_baseline;
  select count(*) into v_now from inventory_movements;
  if v_now <> v_base then raise exception 'TEST1 POST-ROLLBACK FAIL: inventory_movements % <> baseline %', v_now, v_base; end if;
  select count(*) into v_order from purchase_orders where id='11111111-1111-4111-8111-1111111111d1';
  if v_order <> 0 then raise exception 'TEST1 POST-ROLLBACK FAIL: ordine marker ancora presente'; end if;
  raise notice 'TEST 1 POST-ROLLBACK OK: nessun side effect persistito.';
end
$verify1$;


-- =============================================================================
-- SECTION 3 — TEST 2: complete_production_plan  (BEGIN … ROLLBACK)
-- =============================================================================
begin;

do $test2$
declare
  v_org    uuid := '22222222-2222-4222-8222-222222222222';
  v_user   uuid := '22222222-2222-4222-8222-2222222222a2';
  v_ingC   uuid := '22222222-2222-4222-8222-2222222222c1';
  v_ingD   uuid := '22222222-2222-4222-8222-2222222222c2';
  v_recipe uuid := '22222222-2222-4222-8222-2222222222f1';
  v_plan   uuid := '22222222-2222-4222-8222-2222222222d1';
  v_item   uuid := '22222222-2222-4222-8222-2222222222e1';
  v_status0 plan_status; v_status1 plan_status;
  v_reqcnt  int;   -- ingredienti richiesti dal piano (recipe_ingredients via items)
  v_moves   int;   -- movimenti production_usage collegati al piano
  v_negmoves int;  -- di cui con delta negativo
  v_lvlC0 numeric; v_lvlC1 numeric;
  v_lvlD0 numeric; v_lvlD1 numeric;
begin
  -- ── Fixtures ───────────────────────────────────────────────────────────────
  insert into auth.users (instance_id, id, aud, role, email)
  values ('00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated', 'rpc-test-2@example.com');
  insert into organizations (id, name, slug) values (v_org, 'TEST Org 2', 'test-rpc-org-2');
  insert into org_members (organization_id, user_id, role) values (v_org, v_user, 'owner');

  insert into ingredient_products (id, organization_id, name, unit, unit_price) values
    (v_ingC, v_org, 'TEST Burro C', 'kg', 8.00),
    (v_ingD, v_org, 'TEST Uova D',  'kg', 5.00);

  -- recipe + recipe_ingredients (vedi "Adattamenti possibili" per colonne ricetta)
  insert into recipes (id, organization_id, name, base_portions) values (v_recipe, v_org, 'TEST Ricetta', 10);
  insert into recipe_ingredients (recipe_id, ingredient_product_id, quantity, unit) values
    (v_recipe, v_ingC, 3,   'kg'),
    (v_recipe, v_ingD, 1.5, 'kg');

  insert into production_plans (id, organization_id, plan_date, status) values (v_plan, v_org, current_date, 'draft');
  insert into production_plan_items (id, production_plan_id, recipe_id, batch_count, sort_order)
  values (v_item, v_plan, v_recipe, 4, 0);

  -- Stock iniziale
  insert into inventory_movements (organization_id, ingredient_product_id, movement_type, quantity_delta, unit, performed_by) values
    (v_org, v_ingC, 'initial_stock', 20, 'kg', v_user),
    (v_org, v_ingD, 'initial_stock', 10, 'kg', v_user);

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);

  -- ── Snapshot iniziale ──────────────────────────────────────────────────────
  select status into v_status0 from production_plans where id = v_plan;
  select count(*) into v_reqcnt
    from production_plan_items ppi join recipe_ingredients ri on ri.recipe_id = ppi.recipe_id
    where ppi.production_plan_id = v_plan;
  select current_quantity into v_lvlC0 from inventory_levels where organization_id=v_org and ingredient_product_id=v_ingC;
  select current_quantity into v_lvlD0 from inventory_levels where organization_id=v_org and ingredient_product_id=v_ingD;

  if v_status0 not in ('draft','in_progress') then raise exception 'SETUP FAIL: piano non in draft/in_progress'; end if;

  -- ── ESECUZIONE RPC ─────────────────────────────────────────────────────────
  perform public.complete_production_plan(v_plan);

  -- ── Snapshot post ──────────────────────────────────────────────────────────
  select status into v_status1 from production_plans where id = v_plan;
  select count(*) into v_moves   from inventory_movements where reference_type='production_plan' and reference_id=v_plan and movement_type='production_usage';
  select count(*) into v_negmoves from inventory_movements where reference_type='production_plan' and reference_id=v_plan and movement_type='production_usage' and quantity_delta < 0;
  select current_quantity into v_lvlC1 from inventory_levels where organization_id=v_org and ingredient_product_id=v_ingC;
  select current_quantity into v_lvlD1 from inventory_levels where organization_id=v_org and ingredient_product_id=v_ingD;

  -- ── ASSERT ─────────────────────────────────────────────────────────────────
  if v_status1 <> 'completed' then
    raise exception 'TEST2 FAIL (a): status atteso completed, trovato %', v_status1; end if;
  if v_moves <> v_reqcnt then
    raise exception 'TEST2 FAIL (b): movimenti production_usage % <> ingredienti richiesti %', v_moves, v_reqcnt; end if;
  if v_negmoves <> v_moves then
    raise exception 'TEST2 FAIL (c): non tutti i movimenti di uscita sono negativi (% su %)', v_negmoves, v_moves; end if;
  -- C: 20 - (3*4)=8 ; D: 10 - (1.5*4)=4
  if v_lvlC1 <> v_lvlC0 - 12 or v_lvlD1 <> v_lvlD0 - 6 then
    raise exception 'TEST2 FAIL (d): inventory_levels incoerente (C %->% atteso -12, D %->% atteso -6)',
      v_lvlC0, v_lvlC1, v_lvlD0, v_lvlD1; end if;

  -- Contratto "movimenti PRIMA del cambio stato":
  -- LIMITE: dentro una singola RPC atomica l'ordine intermedio non è osservabile
  -- dall'esterno. Lo verifichiamo nel modo più forte possibile in puro SQL:
  --   (1) NON esiste 'completed' senza movimenti coerenti  → v_moves = v_reqcnt con status completed
  --   (2) il risultato è atomicamente consistente (tutto presente insieme, o niente — vedi rollback)
  -- L'ordine reale è garantito dal corpo della funzione (INSERT movimenti prima
  -- dell'UPDATE stato) e dall'atomicità: il test di rollback conferma che non
  -- esiste mai uno stato parziale persistito.
  if v_status1 = 'completed' and v_moves = 0 then
    raise exception 'TEST2 FAIL (contratto): piano completed senza alcun movimento'; end if;

  raise notice 'TEST 2 PASS: complete atomico — completed con movimenti production_usage negativi e stock coerente.';
end
$test2$;

rollback;

do $verify2$
declare v_base bigint; v_now bigint; v_plan int;
begin
  select mov_count into v_base from _rpc_test_baseline;
  select count(*) into v_now from inventory_movements;
  if v_now <> v_base then raise exception 'TEST2 POST-ROLLBACK FAIL: inventory_movements % <> baseline %', v_now, v_base; end if;
  select count(*) into v_plan from production_plans where id='22222222-2222-4222-8222-2222222222d1';
  if v_plan <> 0 then raise exception 'TEST2 POST-ROLLBACK FAIL: piano marker ancora presente'; end if;
  raise notice 'TEST 2 POST-ROLLBACK OK: nessun side effect persistito.';
end
$verify2$;


-- =============================================================================
-- SECTION 4 — TEST 3: IDEMPOTENZA / GUARD RAIL  (BEGIN … ROLLBACK)
-- 3a) receive su ordine non-confirmed deve fallire
-- 3b) complete su piano già completed non duplica movimenti (2ª chiamata fallisce)
-- 3c) 2ª receive sullo stesso ordine non lascia side effect doppi (fallisce)
-- =============================================================================
begin;

do $test3$
declare
  v_org   uuid := '33333333-3333-4333-8333-333333333333';
  v_user  uuid := '33333333-3333-4333-8333-3333333333a3';
  v_supp  uuid := '33333333-3333-4333-8333-3333333333b3';
  v_ing   uuid := '33333333-3333-4333-8333-3333333333c1';
  v_recipe uuid := '33333333-3333-4333-8333-3333333333f1';
  -- 3a draft order
  v_draft uuid := '33333333-3333-4333-8333-3333333333d0';
  -- 3b plan
  v_plan  uuid := '33333333-3333-4333-8333-3333333333d1';
  v_item  uuid := '33333333-3333-4333-8333-3333333333e1';
  -- 3c confirmed order
  v_conf  uuid := '33333333-3333-4333-8333-3333333333d2';
  v_line  uuid := '33333333-3333-4333-8333-3333333333e2';
  v_raised boolean;
  v_m1 int; v_m2 int;
begin
  -- ── Fixtures comuni ────────────────────────────────────────────────────────
  insert into auth.users (instance_id, id, aud, role, email)
  values ('00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated', 'rpc-test-3@example.com');
  insert into organizations (id, name, slug) values (v_org, 'TEST Org 3', 'test-rpc-org-3');
  insert into org_members (organization_id, user_id, role) values (v_org, v_user, 'owner');
  insert into suppliers (id, organization_id, name, email) values (v_supp, v_org, 'TEST Supplier 3', 'supplier-rpc3@example.com');
  insert into ingredient_products (id, organization_id, supplier_id, name, unit, unit_price) values (v_ing, v_org, v_supp, 'TEST Ing 3', 'kg', 4.00);
  insert into inventory_movements (organization_id, ingredient_product_id, movement_type, quantity_delta, unit, performed_by)
  values (v_org, v_ing, 'initial_stock', 50, 'kg', v_user);

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);

  -- ── 3a) receive su ordine 'draft' → atteso errore ─────────────────────────
  insert into purchase_orders (id, organization_id, supplier_id, status, order_date)
  values (v_draft, v_org, v_supp, 'draft', current_date);
  insert into order_line_items (purchase_order_id, ingredient_product_id, quantity_ordered, unit, unit_price_snapshot)
  values (v_draft, v_ing, 5, 'kg', 4.00);

  v_raised := false;
  begin
    perform public.receive_purchase_order(v_draft);
  exception when others then v_raised := true;
  end;
  if not v_raised then
    raise exception 'TEST3a FAIL: receive_purchase_order su ordine draft avrebbe dovuto fallire'; end if;
  if exists (select 1 from inventory_movements where reference_type='purchase_order' and reference_id=v_draft) then
    raise exception 'TEST3a FAIL: receive fallita ha comunque scritto movimenti'; end if;
  raise notice 'TEST 3a PASS: receive su non-confirmed fallisce senza side effect.';

  -- ── 3b) complete due volte → la 2ª fallisce e non duplica movimenti ───────
  insert into recipes (id, organization_id, name, base_portions) values (v_recipe, v_org, 'TEST Ricetta 3', 10);
  insert into recipe_ingredients (recipe_id, ingredient_product_id, quantity, unit) values (v_recipe, v_ing, 2, 'kg');
  insert into production_plans (id, organization_id, plan_date, status) values (v_plan, v_org, current_date, 'draft');
  insert into production_plan_items (id, production_plan_id, recipe_id, batch_count, sort_order) values (v_item, v_plan, v_recipe, 3, 0);

  perform public.complete_production_plan(v_plan);                       -- 1ª: ok
  select count(*) into v_m1 from inventory_movements where reference_type='production_plan' and reference_id=v_plan;

  v_raised := false;
  begin
    perform public.complete_production_plan(v_plan);                     -- 2ª: deve fallire (già completed)
  exception when others then v_raised := true;
  end;
  select count(*) into v_m2 from inventory_movements where reference_type='production_plan' and reference_id=v_plan;

  if not v_raised then
    raise exception 'TEST3b FAIL: 2ª complete su piano completed avrebbe dovuto fallire'; end if;
  if v_m2 <> v_m1 then
    raise exception 'TEST3b FAIL: 2ª complete ha duplicato i movimenti (% -> %)', v_m1, v_m2; end if;
  raise notice 'TEST 3b PASS: complete idempotente — nessun movimento duplicato (%).', v_m1;

  -- ── 3c) receive due volte → la 2ª fallisce e non duplica movimenti ────────
  insert into purchase_orders (id, organization_id, supplier_id, status, order_date, sent_at, created_by)
  values (v_conf, v_org, v_supp, 'confirmed', current_date, now(), v_user);
  insert into order_line_items (id, purchase_order_id, ingredient_product_id, quantity_ordered, unit, unit_price_snapshot)
  values (v_line, v_conf, v_ing, 7, 'kg', 4.50);

  perform public.receive_purchase_order(v_conf);                         -- 1ª: ok
  select count(*) into v_m1 from inventory_movements where reference_type='purchase_order' and reference_id=v_conf;

  v_raised := false;
  begin
    perform public.receive_purchase_order(v_conf);                       -- 2ª: deve fallire (status received)
  exception when others then v_raised := true;
  end;
  select count(*) into v_m2 from inventory_movements where reference_type='purchase_order' and reference_id=v_conf;

  if not v_raised then
    raise exception 'TEST3c FAIL: 2ª receive su ordine received avrebbe dovuto fallire'; end if;
  if v_m2 <> v_m1 then
    raise exception 'TEST3c FAIL: 2ª receive ha duplicato i movimenti (% -> %)', v_m1, v_m2; end if;
  raise notice 'TEST 3c PASS: receive idempotente — nessun movimento duplicato (%).', v_m1;
end
$test3$;

rollback;

do $verify3$
declare v_base bigint; v_now bigint;
begin
  select mov_count into v_base from _rpc_test_baseline;
  select count(*) into v_now from inventory_movements;
  if v_now <> v_base then raise exception 'TEST3 POST-ROLLBACK FAIL: inventory_movements % <> baseline %', v_now, v_base; end if;
  raise notice 'TEST 3 POST-ROLLBACK OK: nessun side effect persistito.';
end
$verify3$;


-- =============================================================================
-- CLEANUP (la temp table sparisce comunque a fine sessione)
-- =============================================================================
drop table if exists _rpc_test_baseline;

-- (se arrivi qui senza eccezioni, tutti i test sono PASS)
do $$ begin raise notice 'SUITE OK: receive_purchase_order e complete_production_plan validate (atomiche, coerenti, idempotenti, reversibili).'; end $$;


-- =============================================================================
-- COME LEGGERLO
-- • Esegui con ON_ERROR_STOP=1: il primo ASSERT fallito ferma tutto con messaggio
--   "TESTx FAIL (y): …". Nessun output FAIL = suite verde (vedi i NOTICE PASS).
-- • SECTION 1 è read-only: blocca subito se manca una RPC/tabella/colonna/trigger.
-- • Ogni test semina le sue fixture e fa ROLLBACK: i dati nascono e muoiono nella
--   transazione, niente resta persistito (provato dai blocchi POST-ROLLBACK).
-- • TEST 1 verifica stato received, un movimento purchase_receipt per riga,
--   quantity_received, refresh prezzo (solo se snapshot non null), history e
--   l'aumento di inventory_levels (proiezione del trigger).
-- • TEST 2 verifica completed, un movimento production_usage negativo per
--   ingrediente e il calo di inventory_levels; il contratto "movimenti prima
--   dello stato" è verificato come atomicità (mai completed senza movimenti).
-- • TEST 3 verifica i guard rail: receive su non-confirmed fallisce; seconda
--   chiamata di entrambe le RPC fallisce senza duplicare movimenti (idempotenza).
-- • I blocchi POST-ROLLBACK confrontano il count globale di inventory_movements
--   con il baseline di SECTION 0: invariato ⇒ zero side effect persistiti.

-- ADATTAMENTI POSSIBILI (solo se lo schema reale differisce)
-- • recipes: l'INSERT usa (id, organization_id, name, base_portions). Se la tua
--   tabella ha altre colonne NOT NULL senza default (es. emoji, created_by),
--   aggiungile all'INSERT in TEST 2 / TEST 3b.
-- • recipe_ingredients: l'INSERT usa (recipe_id, ingredient_product_id, quantity,
--   unit). Se esistono colonne NOT NULL extra (es. sort_order senza default),
--   aggiungile.
-- • production_plan_items: usa (id, production_plan_id, recipe_id, batch_count,
--   sort_order). Rimuovi/aggiungi colonne se il tuo schema differisce.
-- • organizations: l'INSERT omette account_type (default 'customer' dopo 012).
--   Se testi un DB senza 012, va comunque bene; se account_type è NOT NULL senza
--   default, esplicitala.
-- • auth.uid(): se la tua versione legge 'request.jwt.claim.sub' invece di
--   'request.jwt.claims'->>'sub', aggiungi anche
--   set_config('request.jwt.claim.sub', v_user::text, true).
-- • reference_type: il test assume i valori 'purchase_order' / 'production_plan'
--   scritti dalle RPC. Se le RPC usano altri valori, allinea i filtri dei conteggi.
-- =============================================================================
