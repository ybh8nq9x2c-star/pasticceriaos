-- =============================================================================
-- 019_ordering_production_txn.sql
-- Write-path TRANSAZIONALI per il loop operativo P0 (ordering + production).
--
-- PERCHÉ: il contratto di "ricezione ordine" e "chiusura piano" richiede che più
-- scritture avvengano in UNA transazione (integrità del ciclo magazzino). Con
-- Supabase/PostgREST l'unico modo di avere una vera transazione multi-statement
-- è una funzione Postgres. Inoltre `order_line_items` ha una policy UPDATE che
-- consente la modifica solo se il PO è 'draft': aggiornare `quantity_received` su
-- un ordine 'confirmed' richiede quindi SECURITY DEFINER (con org-check esplicito,
-- dato che DEFINER bypassa la RLS).
--
-- CONCORRENZA: entrambe le RPC prendono un row-lock (SELECT ... FOR UPDATE) sulla
-- riga ordine/piano target PRIMA di valutare il guard di stato. Questo serializza
-- le invocazioni concorrenti sullo stesso record e garantisce l'idempotenza anche
-- sotto doppio submit/retry (niente movimenti di magazzino duplicati).
--
-- ADDITIVE & SAFE: solo nuove funzioni. Il codice attualmente live non le chiama,
-- quindi applicare 019 non cambia il comportamento finché Set B non è deployato.
-- Reversibile: vedi fondo file (commento) / drop esplicito.
-- =============================================================================

-- ── receive_purchase_order ───────────────────────────────────────────────────
-- Transazione di ricezione (MVP = ricezione totale):
--   1. inventory_movements 'purchase_receipt' (+quantity_ordered) per ogni riga
--      → il trigger trg_inventory_movement_after_insert aggiorna inventory_levels
--   2. order_line_items.quantity_received = quantity_ordered
--   3. refresh ingredient_products.unit_price = order_line_items.unit_price_snapshot
--   4. purchase_orders.status -> 'received'
--   5. order_status_history (confirmed -> received)
-- Tutto atomico. Idempotente: ri-chiamare dopo il successo fallisce (status≠confirmed).
create or replace function public.receive_purchase_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    uuid;
  v_status order_status;
  v_user   uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'receive_purchase_order: utente non autenticato' using errcode = 'P0001';
  end if;

  -- LOCK della riga ordine PRIMA di decidere: serializza receive concorrenti
  -- sullo stesso ordine. Senza questo, due chiamate concorrenti possono leggere
  -- entrambe status='confirmed' e duplicare i movimenti (idempotenza sotto
  -- concorrenza). Il guard sotto valuta lo stato del record LOCKATO.
  select organization_id, status into v_org, v_status
  from purchase_orders where id = p_order_id
  for update;

  if v_org is null then
    raise exception 'receive_purchase_order: ordine non trovato' using errcode = 'P0044';
  end if;
  if v_org is distinct from current_organization_id() then
    raise exception 'receive_purchase_order: ordine di un''altra organizzazione' using errcode = 'P0043';
  end if;
  if v_status <> 'confirmed' then
    raise exception 'receive_purchase_order: transizione non consentita % -> received', v_status using errcode = 'P0040';
  end if;

  -- 1. movimenti di entrata (trigger -> inventory_levels)
  insert into inventory_movements (
    organization_id, ingredient_product_id, movement_type, quantity_delta, unit,
    reference_type, reference_id, performed_by
  )
  select v_org, oli.ingredient_product_id, 'purchase_receipt', oli.quantity_ordered, oli.unit,
         'purchase_order', p_order_id, v_user
  from order_line_items oli
  where oli.purchase_order_id = p_order_id;

  -- 2. quantity_received = quantity_ordered (ricezione totale MVP)
  update order_line_items
  set quantity_received = quantity_ordered
  where purchase_order_id = p_order_id;

  -- 3. refresh prezzo cache (ultimo prezzo pagato) dove lo snapshot è noto
  update ingredient_products ip
  set unit_price = oli.unit_price_snapshot
  from order_line_items oli
  where oli.purchase_order_id = p_order_id
    and oli.ingredient_product_id = ip.id
    and oli.unit_price_snapshot is not null;

  -- 4. stato ordine
  update purchase_orders set status = 'received' where id = p_order_id;

  -- 5. audit trail
  insert into order_status_history (purchase_order_id, from_status, to_status, changed_by)
  values (p_order_id, v_status, 'received', v_user);
end;
$$;

revoke all on function public.receive_purchase_order(uuid) from public, anon;
grant execute on function public.receive_purchase_order(uuid) to authenticated;

comment on function public.receive_purchase_order(uuid) is
  'Ricezione ordine atomica: movimenti purchase_receipt + quantity_received + refresh prezzo + stato received + history. SECURITY DEFINER con org-check.';

-- ── complete_production_plan ─────────────────────────────────────────────────
-- Chiusura piano atomica: movimenti 'production_usage' (negativi) PRIMA del
-- cambio stato del piano. Idempotente: ri-chiamare dopo il successo fallisce.
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

  -- LOCK della riga piano PRIMA di decidere: serializza complete concorrenti
  -- sullo stesso piano. Senza questo, due chiamate concorrenti possono leggere
  -- entrambe status<>'completed' e duplicare i movimenti production_usage.
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

  -- movimenti di uscita (negativi) PRIMA del cambio stato
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

  update production_plans
  set status = 'completed', completed_at = now()
  where id = p_plan_id;
end;
$$;

revoke all on function public.complete_production_plan(uuid) from public, anon;
grant execute on function public.complete_production_plan(uuid) to authenticated;

comment on function public.complete_production_plan(uuid) is
  'Chiusura piano atomica: movimenti production_usage (negativi) poi stato completed. SECURITY DEFINER con org-check.';

-- ── Rollback (eseguire solo per revert) ──────────────────────────────────────
-- drop function if exists public.receive_purchase_order(uuid);
-- drop function if exists public.complete_production_plan(uuid);
