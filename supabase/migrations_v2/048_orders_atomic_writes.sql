-- =============================================================================
-- 048_orders_atomic_writes.sql
-- SPRINT 2 flusso ordini — consolidamento atomicità/audit + chiusura path legacy.
--
-- A) DEPRECAZIONE receive_purchase_order: la ricezione che muove stock passa SOLO
--    dal goods receipt engine (complete_purchase_receipt). La vecchia RPC di
--    ricezione "totale" lato ordering non deve più essere invocabile dall'app:
--    revoco execute (resta in DB per storicità) + commento.
--
-- B) ATOMICITÀ creazione e transizioni secondarie:
--    - create_purchase_order(): header + righe + history iniziale (null->draft) in
--      UNA transazione. Sostituisce insert ordine + appendStatusHistory separati.
--    - set_order_status(): transizioni SENZA effetti di magazzino (confirmed,
--      cancelled) con status + history atomici. Rifiuta esplicitamente 'received'
--      e 'sent' (hanno path dedicati: receipts engine / mark_order_sent).
--
-- ADDITIVE & SAFE: 2 funzioni nuove + 1 revoke/comment. Nessun nuovo status enum,
-- nessun effetto su inventory_movements, retrocompatibile con dati esistenti.
-- =============================================================================

-- ── A) receive_purchase_order: deprecata, non più invocabile dall'app ─────────
revoke execute on function public.receive_purchase_order(uuid) from authenticated;

comment on function public.receive_purchase_order(uuid) is
  'DEPRECATED (Sprint 2): la ricezione merce che aggiorna lo stock passa SOLO dal '
  'goods receipt engine (complete_purchase_receipt). Execute revocato a authenticated: '
  'non invocabile dall''app. Mantenuta per storicità, non riattivare.';

-- ── B1) Creazione ordine atomica (header + righe + history iniziale) ──────────
create or replace function public.create_purchase_order(
  p_organization_id uuid,
  p_supplier_id     uuid,
  p_order_date      date,
  p_expected_date   date,
  p_notes           text,
  p_lines           jsonb,
  p_history_note    text default 'Ordine creato'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_order_id uuid;
  v_count    int;
begin
  if v_user is null then
    raise exception 'create_purchase_order: utente non autenticato' using errcode = 'P0001';
  end if;
  if p_organization_id is distinct from current_organization_id() then
    raise exception 'create_purchase_order: organizzazione non corrispondente' using errcode = 'P0043';
  end if;

  select count(*) into v_count from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb));
  if v_count = 0 then
    raise exception 'create_purchase_order: nessuna riga ordine' using errcode = 'P0042';
  end if;

  insert into purchase_orders (
    organization_id, supplier_id, status, order_date, expected_date, notes, created_by
  ) values (
    p_organization_id, p_supplier_id, 'draft', p_order_date, p_expected_date, p_notes, v_user
  )
  returning id into v_order_id;

  insert into order_line_items (
    purchase_order_id, ingredient_product_id, quantity_ordered, unit, unit_price_snapshot
  )
  select
    v_order_id,
    (x ->> 'ingredient_product_id')::uuid,
    (x ->> 'quantity_ordered')::numeric,
    (x ->> 'unit')::unit_of_measure,
    nullif(x ->> 'unit_price_snapshot', '')::numeric
  from jsonb_array_elements(p_lines) as x;

  insert into order_status_history (purchase_order_id, from_status, to_status, changed_by, notes)
  values (v_order_id, null, 'draft', v_user, p_history_note);

  return v_order_id;
end;
$$;

revoke all on function public.create_purchase_order(uuid, uuid, date, date, text, jsonb, text) from public, anon;
grant execute on function public.create_purchase_order(uuid, uuid, date, date, text, jsonb, text) to authenticated;

comment on function public.create_purchase_order(uuid, uuid, date, date, text, jsonb, text) is
  'Crea un ordine d''acquisto in modo ATOMICO: header + righe + history iniziale (null->draft). '
  'SECURITY DEFINER con org-check. Nessun ordine senza riga di history.';

-- ── B2) Transizioni secondarie atomiche (confirmed / cancelled) ──────────────
create or replace function public.set_order_status(
  p_order_id  uuid,
  p_to_status order_status,
  p_note      text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_org    uuid;
  v_status order_status;
begin
  if v_user is null then
    raise exception 'set_order_status: utente non autenticato' using errcode = 'P0001';
  end if;
  -- SOLO transizioni senza effetti di magazzino. 'sent' ha mark_order_sent;
  -- 'received' passa esclusivamente dal goods receipt engine. 'draft' non è un target.
  if p_to_status not in ('confirmed', 'cancelled') then
    raise exception 'set_order_status: stato % non gestito qui (usa il path dedicato)', p_to_status using errcode = 'P0042';
  end if;

  select organization_id, status into v_org, v_status
  from purchase_orders where id = p_order_id
  for update;

  if v_org is null then
    raise exception 'set_order_status: ordine non trovato' using errcode = 'P0044';
  end if;
  if v_org is distinct from current_organization_id() then
    raise exception 'set_order_status: ordine di un''altra organizzazione' using errcode = 'P0043';
  end if;

  update purchase_orders set status = p_to_status, updated_at = now() where id = p_order_id;

  insert into order_status_history (purchase_order_id, from_status, to_status, changed_by, notes)
  values (p_order_id, v_status, p_to_status, v_user, p_note);
end;
$$;

revoke all on function public.set_order_status(uuid, order_status, text) from public, anon;
grant execute on function public.set_order_status(uuid, order_status, text) to authenticated;

comment on function public.set_order_status(uuid, order_status, text) is
  'Transizione ordine SENZA effetti di magazzino (confirmed/cancelled): status + history atomici. '
  'Rifiuta received/sent/draft. SECURITY DEFINER con row-lock + org-check.';
