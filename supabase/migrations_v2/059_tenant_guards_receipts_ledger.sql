-- =============================================================================
-- 059_tenant_guards_receipts_ledger.sql  (W2 — REMEDIATION_REPORT.md)
--
-- 1) COERENZA TENANT ricevimento → ordine / fornitore / prodotto.
--    purchase_receipts.purchase_order_id era una FK sul solo id: un ricevimento
--    dell'org B poteva puntare al PO dell'org A, e complete_purchase_receipt
--    (054) ne avanzava righe e stato. Ora:
--      * FK composite (organization_id, purchase_order_id|supplier_id) verso
--        (organization_id, id) — NOT VALID + validazione tentata (vedi sotto);
--      * trigger sulle righe: product_id deve essere dell'org del ricevimento;
--      * la RPC verifica org di ordine e prodotto SOTTO LOCK prima di scrivere.
--
-- 2) LEDGER E PROIEZIONI CHIUSI AL CLIENT.
--    inventory_movements / finished_goods_movements / inventory_levels /
--    finished_goods_levels: niente INSERT/UPDATE/DELETE per anon/authenticated.
--    Unica eccezione: UPDATE(min_threshold) su inventory_levels (soglia scorta).
--    Le scritture manuali dell'app passano da due nuove RPC SECURITY DEFINER:
--      record_inventory_movement   (rettifiche, carichi, scarti materie prime)
--      record_finished_goods_waste (invenduto prodotti finiti)
--    con org-check, ruolo (viewer = sola lettura), conversione unità definita
--    una volta (unit_conversion_factor) e guardia di stock sotto lock.
--
-- Nessun write-path nuovo in parallelo: le RPC SOSTITUISCONO gli insert diretti
-- di modules/inventory/repository.ts. Rollback: vedi fondo file.
-- =============================================================================

-- ── helper: ruolo dell'utente nell'org corrente ──────────────────────────────
create or replace function public.current_org_role()
returns org_role
language sql
stable
security definer
set search_path = public
as $$
  select role from org_members
  where user_id = auth.uid() and organization_id = public.current_organization_id()
  limit 1;
$$;
revoke all on function public.current_org_role() from public, anon;
grant execute on function public.current_org_role() to authenticated;

-- =============================================================================
-- 1a) Vincoli di coerenza tenant (FK composite)
-- =============================================================================
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'purchase_orders_org_id_key') then
    alter table purchase_orders add constraint purchase_orders_org_id_key unique (organization_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'suppliers_org_id_key') then
    alter table suppliers add constraint suppliers_org_id_key unique (organization_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'purchase_receipts_order_same_org') then
    alter table purchase_receipts add constraint purchase_receipts_order_same_org
      foreign key (organization_id, purchase_order_id)
      references purchase_orders (organization_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'purchase_receipts_supplier_same_org') then
    alter table purchase_receipts add constraint purchase_receipts_supplier_same_org
      foreign key (organization_id, supplier_id)
      references suppliers (organization_id, id) not valid;
  end if;
end $$;

-- Le righe NUOVE sono sempre vincolate (NOT VALID vale da subito per insert/
-- update). Le righe ESISTENTI si validano qui: se in un ambiente ci sono dati
-- storici incoerenti la migration NON fallisce (bloccherebbe il deploy) ma lo
-- dichiara con un WARNING; la diagnosi è in supabase/diagnostics/tenant_coherence.sql
-- e la RPC rifiuta comunque quei ricevimenti (P0045).
do $$
declare c text;
begin
  foreach c in array array['purchase_receipts_order_same_org', 'purchase_receipts_supplier_same_org'] loop
    begin
      execute format('alter table purchase_receipts validate constraint %I', c);
    exception when foreign_key_violation then
      raise warning '059: % NON validato: esistono ricevimenti storici cross-org (vedi diagnostics/tenant_coherence.sql)', c;
    end;
  end loop;
end $$;

-- 1b) Righe di ricevimento: il prodotto deve essere dell'org del ricevimento.
create or replace function public.fn_receipt_line_tenant_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.product_id is not null and not exists (
    select 1
    from purchase_receipts r
    join ingredient_products p on p.id = new.product_id and p.organization_id = r.organization_id
    where r.id = new.receipt_id
  ) then
    raise exception 'riga di ricevimento: il prodotto non appartiene all''organizzazione del ricevimento'
      using errcode = 'P0045';
  end if;
  return new;
end;
$$;
revoke all on function public.fn_receipt_line_tenant_guard() from public, anon, authenticated;

drop trigger if exists trg_receipt_line_tenant_guard on purchase_receipt_lines;
create trigger trg_receipt_line_tenant_guard
  before insert or update of product_id, receipt_id on purchase_receipt_lines
  for each row execute function public.fn_receipt_line_tenant_guard();

-- =============================================================================
-- 1c) complete_purchase_receipt: corpo identico alla 054 salvo i punti "059:"
--     (org-check di ordine e prodotto sotto lock, prima di ogni scrittura).
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
  v_order_org    uuid;   -- 059: org dell'ordine collegato (tenant guard)
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
    -- 059 (W2): l'ordine si blocca e si verifica che sia DELLA STESSA org del
    -- ricevimento PRIMA di qualsiasi scrittura. Prima la RPC leggeva l'ordine
    -- solo per id: un ricevimento che puntava a un PO di un'altra org ne
    -- avanzava righe e stato (scrittura cross-tenant).
    select status, organization_id into v_order_status, v_order_org
    from purchase_orders where id = v_order for update;
    if v_order_org is null then
      raise exception 'complete_purchase_receipt: ordine collegato non trovato' using errcode = 'P0044';
    end if;
    if v_order_org is distinct from v_org then
      raise exception 'complete_purchase_receipt: l''ordine collegato appartiene a un''altra organizzazione' using errcode = 'P0045';
    end if;
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
      -- 059 (W2): il prodotto deve essere dell'org del ricevimento.
      select unit, name into v_product_unit, v_product_name
      from ingredient_products
      where id = v_line.product_id and organization_id = v_org;
      if v_product_unit is null then
        raise exception 'complete_purchase_receipt: il prodotto della riga "%" non appartiene a questa organizzazione',
          v_line.raw_product_name using errcode = 'P0045';
      end if;

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
  'Contabilizza un ricevimento merce nell''unità del PRODOTTO (054) con tenant guard (059: ordine e prodotto della stessa org, verificati sotto lock; altrimenti P0045). Idempotente per riga via qty_posted. SECURITY DEFINER con org-check.';

-- =============================================================================
-- 2a) Ledger e proiezioni: nessuna scrittura diretta dal client
-- =============================================================================
revoke insert, update, delete, truncate on public.inventory_movements      from anon, authenticated;
revoke insert, update, delete, truncate on public.finished_goods_movements from anon, authenticated;
revoke insert, update, delete, truncate on public.inventory_levels         from anon, authenticated;
revoke insert, update, delete, truncate on public.finished_goods_levels    from anon, authenticated;
-- unica colonna scrivibile dal client: la soglia di riordino (modules/inventory)
grant update (min_threshold) on public.inventory_levels to authenticated;

-- policy d'insert ormai inerti (nessun privilegio INSERT): rimosse per chiarezza
drop policy if exists inventory_movements_insert on public.inventory_movements;
drop policy if exists fgm_insert on public.finished_goods_movements;

-- =============================================================================
-- 2b) RPC: movimento manuale materie prime
-- =============================================================================
create or replace function public.record_inventory_movement(
  p_ingredient_product_id uuid,
  p_movement_type         movement_type,
  p_quantity_delta        numeric,
  p_unit                  unit_of_measure,
  p_notes                 text default null,
  p_reference_type        text default null,
  p_reference_id          uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_org    uuid := public.current_organization_id();
  v_role   org_role;
  v_unit   unit_of_measure;
  v_name   text;
  v_factor numeric;
  v_qty    numeric(12,4);
  v_before numeric(12,4);
  v_id     uuid;
begin
  if v_user is null then
    raise exception 'record_inventory_movement: utente non autenticato' using errcode = 'P0001';
  end if;
  if v_org is null then
    raise exception 'record_inventory_movement: nessuna organizzazione per l''utente' using errcode = 'P0043';
  end if;
  v_role := public.current_org_role();
  if v_role is null or v_role = 'viewer' then
    raise exception 'Non hai i permessi per modificare il magazzino (ruolo in sola lettura).' using errcode = 'P0050';
  end if;

  -- Tipi ammessi da un gesto manuale. production_usage / sale_deduction nascono
  -- SOLO dalle RPC di dominio (produzione, vendite): mai a mano.
  if p_movement_type not in ('purchase_receipt', 'waste', 'manual_adjustment', 'initial_stock', 'return_to_supplier') then
    raise exception 'Il movimento % si registra solo dal suo flusso (produzione/vendite), non a mano.', p_movement_type
      using errcode = 'P0051';
  end if;

  select unit, name into v_unit, v_name
  from ingredient_products
  where id = p_ingredient_product_id and organization_id = v_org;
  if v_unit is null then
    raise exception 'Ingrediente non trovato in questa organizzazione.' using errcode = 'P0045';
  end if;

  -- Conversione definita una volta (021): il ledger vive nell'unità del prodotto.
  v_factor := unit_conversion_factor(p_unit, v_unit);
  if v_factor is null then
    raise exception 'Unità % incompatibile con "%" (unità %).', p_unit, v_name, v_unit using errcode = 'P0212';
  end if;
  v_qty := p_quantity_delta * v_factor;
  if v_qty = 0 then
    raise exception 'Quantità nulla: nessun movimento da registrare.' using errcode = 'P0042';
  end if;

  -- Giacenza sotto lock: la guardia di stock e qty_before/after sono coerenti
  -- anche con richieste concorrenti.
  select current_quantity into v_before
  from inventory_levels
  where organization_id = v_org and ingredient_product_id = p_ingredient_product_id
  for update;
  v_before := coalesce(v_before, 0);

  if p_movement_type in ('waste', 'return_to_supplier') and v_before + v_qty < 0 then
    raise exception 'Stock insufficiente per %: disponibili % %, l''operazione ne toglie %. Registra prima un carico o usa la rettifica del magazzino.',
      v_name, v_before, v_unit, abs(v_qty) using errcode = 'P0052';
  end if;

  insert into inventory_movements (
    organization_id, ingredient_product_id, movement_type, quantity_delta, unit,
    reference_type, reference_id, performed_by, qty_before, qty_after, notes
  ) values (
    v_org, p_ingredient_product_id, p_movement_type, v_qty, v_unit,
    case when p_reference_type is not null and p_reference_id is not null then p_reference_type end,
    case when p_reference_type is not null and p_reference_id is not null then p_reference_id end,
    v_user, v_before, v_before + v_qty,
    nullif(concat_ws(' · ', nullif(trim(p_notes), ''),
      case when v_factor <> 1 then format('convertito da %s %s', p_quantity_delta, p_unit) end), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.record_inventory_movement(uuid, movement_type, numeric, unit_of_measure, text, text, uuid) from public, anon;
grant execute on function public.record_inventory_movement(uuid, movement_type, numeric, unit_of_measure, text, text, uuid) to authenticated;

comment on function public.record_inventory_movement(uuid, movement_type, numeric, unit_of_measure, text, text, uuid) is
  'Unico write-path client verso inventory_movements (059): org-check, viewer escluso, tipi manuali, conversione unità (P0212), guardia stock sotto lock (P0052).';

-- =============================================================================
-- 2c) RPC: invenduto prodotti finiti
-- =============================================================================
create or replace function public.record_finished_goods_waste(
  p_recipe_id uuid,
  p_quantity  numeric,
  p_notes     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org  uuid := public.current_organization_id();
  v_role org_role;
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'record_finished_goods_waste: utente non autenticato' using errcode = 'P0001';
  end if;
  if v_org is null then
    raise exception 'record_finished_goods_waste: nessuna organizzazione per l''utente' using errcode = 'P0043';
  end if;
  v_role := public.current_org_role();
  if v_role is null or v_role = 'viewer' then
    raise exception 'Non hai i permessi per registrare l''invenduto (ruolo in sola lettura).' using errcode = 'P0050';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La quantità di invenduto deve essere positiva.' using errcode = 'P0042';
  end if;
  if not exists (select 1 from recipes where id = p_recipe_id and organization_id = v_org) then
    raise exception 'Prodotto non trovato in questa organizzazione.' using errcode = 'P0045';
  end if;

  insert into finished_goods_movements (
    organization_id, recipe_id, movement_type, quantity_delta, reference_type, performed_by, notes
  ) values (
    v_org, p_recipe_id, 'waste', -p_quantity, 'manual', v_user, nullif(trim(p_notes), '')
  )
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.record_finished_goods_waste(uuid, numeric, text) from public, anon;
grant execute on function public.record_finished_goods_waste(uuid, numeric, text) to authenticated;

comment on function public.record_finished_goods_waste(uuid, numeric, text) is
  'Unico write-path client verso finished_goods_movements (059): waste negativo, org-check su ricetta, viewer escluso.';

-- =============================================================================
-- Rollback (manuale, in ordine):
--   grant insert, update, delete on inventory_movements, finished_goods_movements,
--     inventory_levels, finished_goods_levels to authenticated;  + ricreare
--     inventory_movements_insert (009) e fgm_insert (050);
--   ridefinire complete_purchase_receipt dal corpo della 054;
--   drop trigger trg_receipt_line_tenant_guard; drop function fn_receipt_line_tenant_guard,
--     record_inventory_movement, record_finished_goods_waste, current_org_role;
--   alter table purchase_receipts drop constraint purchase_receipts_order_same_org,
--     drop constraint purchase_receipts_supplier_same_org;
-- =============================================================================
