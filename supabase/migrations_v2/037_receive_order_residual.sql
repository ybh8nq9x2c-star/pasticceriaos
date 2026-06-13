-- =============================================================================
-- 037_receive_order_residual.sql
-- FIX BUG A (doppio conteggio): receive_purchase_order (019) contabilizzava
-- l'INTERA quantity_ordered senza sottrarre quantity_received già registrato.
--
-- SCENARIO: un PO ricevuto PARZIALMENTE via goods receipt engine
--   (complete_purchase_receipt) resta 'confirmed' con quantity_received > 0.
--   Un successivo receive_purchase_order (path legacy "segna ricevuto") superava
--   il guard (controlla solo status='confirmed') e ricontabilizzava tutto →
--   a magazzino finivano qty già caricate due volte (es. 10 ordinati, 4+10=14).
--
-- FIX: la ricezione legacy contabilizza SOLO il RESIDUO non ancora ricevuto
--   (quantity_ordered − coalesce(quantity_received,0)) e salta le righe già
--   coperte (residuo = 0). Resta una ricezione "a saldo" dell'ordine; idempotente
--   rispetto ai parziali dell'engine. Tutto il resto del comportamento (guard di
--   stato, row-lock, refresh prezzo, stato 'received', history) è INVARIATO.
--
-- ADDITIVE & SAFE: solo CREATE OR REPLACE della funzione esistente. Nessuna nuova
--   tabella, nessuna nuova fonte di verità. inventory_movements resta l'unico
--   ledger append-only. Il vincolo quantity_delta>0 e il sign-check restano
--   soddisfatti perché il filtro esclude i residui <= 0.
-- =============================================================================

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
  -- sullo stesso ordine (idempotenza sotto doppio submit).
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

  -- 1. movimenti di entrata SOLO per il RESIDUO non ancora ricevuto (trigger ->
  --    inventory_levels). Le righe già coperte (residuo 0) non generano movimenti:
  --    evita il doppio conteggio dei parziali registrati dal goods receipt engine.
  insert into inventory_movements (
    organization_id, ingredient_product_id, movement_type, quantity_delta, unit,
    reference_type, reference_id, performed_by
  )
  select v_org, oli.ingredient_product_id, 'purchase_receipt',
         oli.quantity_ordered - coalesce(oli.quantity_received, 0), oli.unit,
         'purchase_order', p_order_id, v_user
  from order_line_items oli
  where oli.purchase_order_id = p_order_id
    and oli.quantity_ordered - coalesce(oli.quantity_received, 0) > 0;

  -- 2. ricezione a saldo: quantity_received = quantity_ordered su tutte le righe.
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
  'Ricezione ordine atomica a SALDO: movimenti purchase_receipt SOLO sul residuo (quantity_ordered − quantity_received) + quantity_received=quantity_ordered + refresh prezzo + stato received + history. Idempotente rispetto ai parziali del goods receipt engine. SECURITY DEFINER con org-check.';

-- ── Rollback (eseguire solo per revert: ripristina il comportamento 019) ──────
-- Re-applica la versione di 019 che contabilizza oli.quantity_ordered intero
-- (riporta il rischio di doppio conteggio: NON consigliato).
