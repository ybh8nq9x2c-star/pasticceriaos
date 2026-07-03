-- =============================================================================
-- 054_receipt_unit_guard.sql
-- Hardening P0 — guardia unità al CONFINE DEL LEDGER (stesso pattern di 053
-- per il bridge marketplace). complete_purchase_receipt contabilizzava il
-- delta nell'unità della RIGA: una riga in kg su un prodotto censito in g
-- (o una riga manuale con unità arbitraria) produceva un movimento sommato
-- raw dal trigger dei livelli → stock semanticamente corrotto in silenzio.
--
-- Ora, per ogni riga da contabilizzare:
--   * unità riga = unità prodotto → factor 1 (percorso di sempre, invariato);
--   * metrica convertibile (g↔kg, ml↔l via unit_conversion_factor, 021) →
--     movimento e lotto nell'UNITÀ DEL PRODOTTO con quantità convertita;
--   * incompatibile → errore esplicito P0212, transazione annullata.
--
-- La riga del ricevimento resta nella SUA unità (qty_received/qty_posted:
-- bookkeeping del documento); a convertire è solo ciò che tocca il ledger
-- (inventory_movements, ingredient_batches) e l'avanzamento ordine (nell'unità
-- della riga d'ordine, quando convertibile). Corpo identico a 049 salvo i
-- punti marcati "054:".
-- =============================================================================

create or replace function public.complete_purchase_receipt(p_receipt_id uuid)
returns receipt_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org       uuid;
  v_status    receipt_status;
  v_order     uuid;
  v_supplier  uuid;
  v_user      uuid := auth.uid();
  v_line      record;
  v_delta     numeric(12,4);
  v_before    numeric(12,4);
  v_new_status receipt_status;
  v_has_partial boolean := false;
  v_has_discrepancy boolean := false;
  v_has_pending boolean := false;
  v_posted_any boolean := false;
  v_order_status order_status;
  -- 054: conversione unità riga → unità prodotto
  v_product_unit unit_of_measure;
  v_product_name text;
  v_factor       numeric;
  v_post_qty     numeric(12,4);
begin
  if v_user is null then
    raise exception 'complete_purchase_receipt: utente non autenticato' using errcode = 'P0001';
  end if;

  -- Row-lock del receipt: serializza i complete concorrenti (doppio submit).
  select organization_id, status, purchase_order_id, supplier_id
    into v_org, v_status, v_order, v_supplier
  from purchase_receipts where id = p_receipt_id
  for update;

  if v_org is null then
    raise exception 'complete_purchase_receipt: ricevimento non trovato' using errcode = 'P0044';
  end if;
  if v_org is distinct from current_organization_id() then
    raise exception 'complete_purchase_receipt: ricevimento di un''altra organizzazione' using errcode = 'P0043';
  end if;
  if v_status in ('completed', 'cancelled') then
    raise exception 'complete_purchase_receipt: il ricevimento è già %', v_status using errcode = 'P0040';
  end if;

  -- Ordine collegato: non si contabilizza due volte lo stesso ordine.
  if v_order is not null then
    select status into v_order_status from purchase_orders where id = v_order for update;
    if v_order_status = 'received' then
      raise exception 'complete_purchase_receipt: l''ordine collegato risulta già ricevuto a magazzino' using errcode = 'P0041';
    end if;
    if v_order_status = 'cancelled' then
      raise exception 'complete_purchase_receipt: l''ordine collegato è annullato' using errcode = 'P0041';
    end if;
  end if;

  -- ── Contabilizza riga per riga (solo il delta non ancora registrato) ──────
  for v_line in
    select * from purchase_receipt_lines
    where receipt_id = p_receipt_id
    order by sort_order, created_at
    for update
  loop
    v_delta := v_line.qty_received - v_line.qty_posted;

    if v_delta < 0 then
      raise exception 'complete_purchase_receipt: qty_received (%) sotto il già contabilizzato (%) sulla riga "%"',
        v_line.qty_received, v_line.qty_posted, v_line.raw_product_name using errcode = 'P0042';
    end if;

    if v_delta > 0 then
      if v_line.product_id is null then
        raise exception 'complete_purchase_receipt: riga "%" senza prodotto associato: risolvi il matching prima di completare',
          v_line.raw_product_name using errcode = 'P0042';
      end if;

      -- 054: il movimento vive nell'unità del PRODOTTO. Identica → factor 1;
      -- metrica convertibile → converti; incompatibile → errore, mai fallback.
      select unit, name into v_product_unit, v_product_name
      from ingredient_products where id = v_line.product_id;

      v_factor := unit_conversion_factor(v_line.unit, v_product_unit);
      if v_factor is null then
        raise exception
          'complete_purchase_receipt: unità % della riga "%" incompatibile con il prodotto "%" (unità %)',
          v_line.unit, v_line.raw_product_name, v_product_name, v_product_unit
          using errcode = 'P0212';
      end if;
      v_post_qty := v_delta * v_factor;

      -- Giacenza prima/dopo per l'audit (lock del livello per coerenza).
      select current_quantity into v_before
      from inventory_levels
      where organization_id = v_org and ingredient_product_id = v_line.product_id
      for update;
      v_before := coalesce(v_before, 0);

      insert into inventory_movements (
        organization_id, ingredient_product_id, movement_type, quantity_delta,
        unit, reference_type, reference_id, performed_by, qty_before, qty_after,
        notes
      ) values (
        v_org, v_line.product_id, 'purchase_receipt', v_post_qty,
        v_product_unit, 'purchase_receipt', p_receipt_id, v_user, v_before, v_before + v_post_qty,
        nullif(concat_ws(' · ',
          'riga: ' || v_line.raw_product_name,
          case when v_line.lot_number is not null then 'lotto ' || v_line.lot_number end,
          case when v_factor <> 1 then format('convertito da %s %s', v_delta, v_line.unit) end
        ), '')
      );

      -- Lotto/scadenza → ingredient_batches (tracciabilità FEFO/HACCP),
      -- nell'unità del prodotto (054).
      if v_line.expiry_date is not null then
        insert into ingredient_batches (
          organization_id, ingredient_product_id, purchase_order_id, supplier_id,
          lot_number, expiry_date, quantity_received, quantity_remaining, unit,
          receipt_line_id, notes
        ) values (
          v_org, v_line.product_id, v_order, v_supplier,
          v_line.lot_number, v_line.expiry_date, v_post_qty, v_post_qty, v_product_unit,
          v_line.id, 'Da ricevimento ' || p_receipt_id
        );
      end if;

      -- Avanzamento ordine collegato (per ingrediente, cap alla qty ordinata).
      -- 054: il delta viene riportato nell'unità della riga d'ordine quando
      -- convertibile; altrimenti comportamento precedente (delta raw) — il
      -- disallineamento resta visibile alla riconciliazione notturna (055).
      if v_order is not null then
        update order_line_items oli
        set quantity_received = least(oli.quantity_ordered,
                                      coalesce(oli.quantity_received, 0)
                                      + v_post_qty * coalesce(unit_conversion_factor(v_product_unit, oli.unit), 1))
        where oli.purchase_order_id = v_order
          and oli.ingredient_product_id = v_line.product_id;
      end if;

      update purchase_receipt_lines
      set qty_posted = v_line.qty_received,
          line_status = case
            when v_line.discrepancy_reason is not null then 'discrepancy'::receipt_line_status
            when v_line.qty_expected is null then 'received'::receipt_line_status
            when v_line.qty_received >= v_line.qty_expected then 'received'::receipt_line_status
            else 'partial'::receipt_line_status
          end
      where id = v_line.id;

      v_posted_any := true;
    end if;
  end loop;

  -- ── Stato aggregato del receipt ───────────────────────────────────────────
  select
    bool_or(line_status = 'discrepancy' or discrepancy_reason is not null),
    bool_or(line_status = 'partial'),
    bool_or(line_status in ('pending', 'matched') and coalesce(qty_expected, 0) > 0
            and qty_received < qty_expected)
    into v_has_discrepancy, v_has_partial, v_has_pending
  from purchase_receipt_lines
  where receipt_id = p_receipt_id;

  v_new_status := case
    when coalesce(v_has_discrepancy, false) then 'discrepancy'::receipt_status
    when coalesce(v_has_partial, false) or coalesce(v_has_pending, false) then 'partial'::receipt_status
    else 'completed'::receipt_status
  end;

  update purchase_receipts
  set status = v_new_status,
      updated_at = now(),
      completed_at = case when v_new_status in ('completed', 'discrepancy') then now() else completed_at end
  where id = p_receipt_id;

  -- ── Ordine collegato: received se TUTTE le righe sono coperte, altrimenti
  -- partial se ne è arrivata almeno una parte (l'ordine racconta la verità) ──
  if v_order is not null and v_posted_any then
    if not exists (
      select 1 from order_line_items
      where purchase_order_id = v_order
        and coalesce(quantity_received, 0) < quantity_ordered
    ) then
      update purchase_orders set status = 'received' where id = v_order;
      insert into order_status_history (purchase_order_id, from_status, to_status, changed_by, notes)
      values (v_order, v_order_status, 'received', v_user,
              'Ricevuto tramite goods receipt ' || p_receipt_id);
    elsif v_order_status is distinct from 'partial' then
      update purchase_orders set status = 'partial' where id = v_order;
      insert into order_status_history (purchase_order_id, from_status, to_status, changed_by, notes)
      values (v_order, v_order_status, 'partial', v_user,
              'Ricezione parziale tramite goods receipt ' || p_receipt_id);
    end if;
  end if;

  return v_new_status;
end;
$$;

revoke all on function public.complete_purchase_receipt(uuid) from public, anon;
grant execute on function public.complete_purchase_receipt(uuid) to authenticated;

comment on function public.complete_purchase_receipt(uuid) is
  'Contabilizza un ricevimento merce nell''unità del PRODOTTO (conversione metrica via unit_conversion_factor; incompatibile = P0212). Movimenti con qty before/after, lotti, avanzamento ordine (received/partial), stato receipt. Idempotente per riga via qty_posted. SECURITY DEFINER con org-check.';
