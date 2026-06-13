-- =============================================================================
-- receipts_double_count.test.sql
-- Test MANUALE, reviewable, STAGING/NON-PROD ONLY.
--
-- OBIETTIVO: validare i write-path di magazzino quando convivono sullo STESSO
-- ordine due RPC:
--     A) complete_purchase_receipt(uuid)  -- goods receipt engine (035), incrementale
--     B) receive_purchase_order(uuid)      -- path legacy (019), ricezione TOTALE
--
-- L'indagine ha trovato DUE problemi distinti; questo file li copre entrambi come
-- ladder TDD (ROSSO sul codice attuale → VERDE dopo i fix conservativi proposti).
--
-- ── BUG B (bloccante, LIVE) — TEST 1 ─────────────────────────────────────────
--   complete_purchase_receipt inserisce inventory_movements.reference_type =
--   'purchase_receipt', valore NON ammesso dal CHECK inventory_movements_
--   reference_type_check (005: solo 'purchase_order' | 'production_plan' | 'manual').
--   → ogni completamento che contabilizza stock fallisce con check_violation:
--     l'engine NON riesce a caricare a magazzino.
--   Fix conservativo proposto: nuova migration che ESTENDE il CHECK con
--   'purchase_receipt' (additivo, nessuna nuova tabella, reference_id resta la
--   soft-FK verso purchase_receipts.id).
--
-- ── BUG A (latente, si attiva dopo il fix di B) — TEST 2 ─────────────────────
--   receive_purchase_order contabilizza l'INTERA quantity_ordered e NON sottrae
--   quantity_received già registrato. Se un PO è stato ricevuto PARZIALMENTE via
--   engine (resta 'confirmed'), un successivo receive_purchase_order ricontabilizza
--   tutto → DOPPIO CONTEGGIO. Oggi irraggiungibile perché B blocca i parziali
--   dell'engine; diventa attivo appena B è risolto.
--   Fix conservativo proposto: post del solo residuo
--   (quantity_ordered − coalesce(quantity_received,0)); idempotente, una sola
--   fonte di verità (inventory_movements), nessuna nuova tabella.
--
-- COME ESEGUIRE (solo staging/non-prod):
--     psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f receipts_double_count.test.sql
-- SICUREZZA: tutto dentro BEGIN…ROLLBACK. Nessun COMMIT, nessuna modifica schema.
-- =============================================================================

drop table if exists _dc_test_baseline;
create temp table _dc_test_baseline as
  select (select count(*) from inventory_movements) as mov_count;

-- ── PRECHECK ─────────────────────────────────────────────────────────────────
do $precheck$
begin
  if to_regprocedure('public.receive_purchase_order(uuid)') is null then
    raise exception 'PRECHECK FAIL: manca RPC receive_purchase_order(uuid)'; end if;
  if to_regprocedure('public.complete_purchase_receipt(uuid)') is null then
    raise exception 'PRECHECK FAIL: manca RPC complete_purchase_receipt(uuid)'; end if;
  if to_regclass('public.purchase_receipt_lines') is null then
    raise exception 'PRECHECK FAIL: manca purchase_receipt_lines (035 non applicata?)'; end if;
  raise notice 'PRECHECK OK.';
end
$precheck$;

-- =============================================================================
-- TEST 1 — BUG B: il goods receipt engine deve poter contabilizzare stock
-- =============================================================================
begin;
do $test1$
declare
  v_org uuid := '44444444-4444-4444-8444-444444440001';
  v_user uuid := '44444444-4444-4444-8444-4444444400a1';
  v_supp uuid := '44444444-4444-4444-8444-4444444400b1';
  v_ing uuid := '44444444-4444-4444-8444-4444444400c1';
  v_receipt uuid := '44444444-4444-4444-8444-4444444400f1';
  v_rline uuid := '44444444-4444-4444-8444-444444440a01';
  v_ok boolean := true; v_err text; v_lvl numeric;
begin
  insert into auth.users (instance_id, id, aud, role, email)
  values ('00000000-0000-0000-0000-000000000000', v_user, 'authenticated','authenticated','b-test@example.com');
  insert into organizations (id, name, slug) values (v_org, 'TEST Org B', 'test-b-org');
  insert into org_members (organization_id, user_id, role) values (v_org, v_user, 'owner');
  insert into suppliers (id, organization_id, name, email) values (v_supp, v_org, 'Sup B', 'b@ex.com');
  insert into ingredient_products (id, organization_id, supplier_id, name, unit, unit_price)
  values (v_ing, v_org, v_supp, 'Farina B', 'kg', 1.00);
  insert into purchase_receipts (id, organization_id, mode, supplier_id, status, created_by)
  values (v_receipt, v_org, 'bakery', v_supp, 'expected', v_user);
  insert into purchase_receipt_lines (id, receipt_id, product_id, raw_product_name, qty_received, qty_posted, unit, line_status, sort_order)
  values (v_rline, v_receipt, v_ing, 'Farina B', 4, 0, 'kg', 'matched', 0);

  perform set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role','authenticated')::text, true);

  begin
    perform public.complete_purchase_receipt(v_receipt);
  exception when check_violation then v_ok := false; v_err := sqlerrm;
  end;

  if not v_ok then
    raise exception 'BUG B CONFERMATO: complete_purchase_receipt non contabilizza stock → %  (reference_type=''purchase_receipt'' rifiutato dal CHECK di 005). Applica il fix che estende il vincolo.', v_err;
  end if;

  select current_quantity into v_lvl from inventory_levels
    where organization_id=v_org and ingredient_product_id=v_ing;
  if coalesce(v_lvl,0) <> 4 then
    raise exception 'TEST1 FAIL: atteso stock 4 dopo il completamento, trovato %', v_lvl; end if;
  raise notice 'TEST 1 PASS: engine contabilizza correttamente (+4).';
end
$test1$;
rollback;

-- =============================================================================
-- TEST 2 — BUG A: nessun doppio conteggio engine(parziale) + legacy(totale)
-- (richiede B risolto per poter creare il parziale via engine)
-- =============================================================================
begin;
do $test2$
declare
  v_org uuid := '44444444-4444-4444-8444-444444440002';
  v_user uuid := '44444444-4444-4444-8444-4444444400a2';
  v_supp uuid := '44444444-4444-4444-8444-4444444400b2';
  v_ing uuid := '44444444-4444-4444-8444-4444444400c2';
  v_order uuid := '44444444-4444-4444-8444-4444444400d2';
  v_line uuid := '44444444-4444-4444-8444-4444444400e2';
  v_receipt uuid := '44444444-4444-4444-8444-4444444400f2';
  v_rline uuid := '44444444-4444-4444-8444-444444440a02';
  v_po_mid order_status; v_lvl_final numeric;
begin
  insert into auth.users (instance_id, id, aud, role, email)
  values ('00000000-0000-0000-0000-000000000000', v_user, 'authenticated','authenticated','a-test@example.com');
  insert into organizations (id, name, slug) values (v_org, 'TEST Org A', 'test-a-org');
  insert into org_members (organization_id, user_id, role) values (v_org, v_user, 'owner');
  insert into suppliers (id, organization_id, name, email) values (v_supp, v_org, 'Sup A', 'a@ex.com');
  insert into ingredient_products (id, organization_id, supplier_id, name, unit, unit_price)
  values (v_ing, v_org, v_supp, 'Farina A', 'kg', 1.00);
  insert into purchase_orders (id, organization_id, supplier_id, status, order_date, sent_at, created_by)
  values (v_order, v_org, v_supp, 'confirmed', current_date, now(), v_user);
  insert into order_line_items (id, purchase_order_id, ingredient_product_id, quantity_ordered, quantity_received, unit, unit_price_snapshot)
  values (v_line, v_order, v_ing, 10, 0, 'kg', 1.00);
  insert into purchase_receipts (id, organization_id, mode, supplier_id, purchase_order_id, status, created_by)
  values (v_receipt, v_org, 'bakery', v_supp, v_order, 'expected', v_user);
  insert into purchase_receipt_lines (id, receipt_id, product_id, raw_product_name, qty_expected, qty_received, qty_posted, unit, line_status, sort_order)
  values (v_rline, v_receipt, v_ing, 'Farina A', 10, 4, 0, 'kg', 'matched', 0);

  perform set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role','authenticated')::text, true);

  -- STEP 1: ricevimento parziale via engine (4/10). Richiede il fix di B.
  perform public.complete_purchase_receipt(v_receipt);
  select status into v_po_mid from purchase_orders where id = v_order;
  if v_po_mid <> 'confirmed' then
    raise exception 'STEP1 FAIL: il PO doveva restare confirmed dopo il parziale, trovato %', v_po_mid; end if;

  -- STEP 2: path legacy sullo stesso PO ancora 'confirmed'.
  perform public.receive_purchase_order(v_order);
  select current_quantity into v_lvl_final from inventory_levels
    where organization_id=v_org and ingredient_product_id=v_ing;

  raise notice 'OSSERVATO stock finale = % (ordinati 10, ricevuti 4 via engine + legacy)', v_lvl_final;
  if v_lvl_final = 14 then
    raise exception 'BUG A CONFERMATO (DOPPIO CONTEGGIO): ordinati 10, a magazzino 14. receive_purchase_order ha ricontabilizzato l''intera quantità ignorando i 4 già caricati.'; end if;
  if v_lvl_final <> 10 then
    raise exception 'TEST2 FAIL: stock finale atteso 10, trovato %', v_lvl_final; end if;
  raise notice 'TEST 2 PASS: nessun doppio conteggio — stock finale=10.';
end
$test2$;
rollback;

do $verify$
declare v_base bigint; v_now bigint;
begin
  select mov_count into v_base from _dc_test_baseline;
  select count(*) into v_now from inventory_movements;
  if v_now <> v_base then raise exception 'POST-ROLLBACK FAIL: % <> baseline %', v_now, v_base; end if;
  raise notice 'POST-ROLLBACK OK: nessun side effect persistito.';
end
$verify$;
drop table if exists _dc_test_baseline;
