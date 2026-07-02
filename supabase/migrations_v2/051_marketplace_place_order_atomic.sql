-- =============================================================================
-- 051_marketplace_place_order_atomic.sql
-- Fix P0-1 + P0-2 della QA review "Sync ordini Pasticceria ↔ Fornitore".
--
-- P0-1 (atomicità): il vecchio createOrder TS inseriva header e righe in due
--   statement separati. Se l'insert righe falliva restava un draft a 0 righe
--   CON idempotency key consumata: ogni retry restituiva per sempre l'ordine
--   rotto, sottomettibile vuoto al fornitore.
-- P0-2 (idempotenza end-to-end): placeOrder = create + submit in due step.
--   Retry dopo risposta HTTP persa -> transizione submitted->submitted ->
--   errore mostrato per un ordine riuscito -> l'utente ricreava a mano
--   (duplicato indotto).
--
-- place_marketplace_order() esegue header + righe + submit in UNA transazione:
--   * niente ordine incompleto persistibile (rollback totale su errore);
--   * retry con la stessa idempotency key = successo con l'ordine esistente;
--   * draft fantasma legacy con stessa key = riparato (righe reinserite,
--     submit) invece di restare avvelenato.
--
-- SECURITY INVOKER (default): ogni statement passa da RLS (mo_insert,
-- mol_write, mo_update) e dai trigger guard/history. La funzione aggiunge solo
-- l'atomicità; il confine di sicurezza resta il DB.
--
-- Errcode nuovi (mappati in modules/marketplace/service.ts):
--   P0304 = connessione non valida/revocata o non del chiamante
--   P0305 = riga con prodotto non valido per il fornitore collegato
--   P0306 = payload righe vuoto o malformato
-- =============================================================================

create or replace function public.place_marketplace_order(
  p_connection_id   uuid,
  p_lines           jsonb,
  p_notes           text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_org      uuid := public.current_organization_id();
  v_conn     supplier_customer_connections%rowtype;
  v_existing record;
  v_order_id uuid;
  v_expected int;
  v_inserted int;
begin
  if v_org is null then
    raise exception 'place_marketplace_order: nessuna organizzazione per l''utente corrente' using errcode = 'P0001';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'place_marketplace_order: righe mancanti' using errcode = 'P0306';
  end if;
  v_expected := jsonb_array_length(p_lines);

  -- ── Idempotenza end-to-end (P0-2) ──────────────────────────────────────────
  -- Stessa key = stesso ordine logico: un retry benigno è un SUCCESSO.
  if p_idempotency_key is not null and p_idempotency_key <> '' then
    select id, status, connection_id into v_existing
    from marketplace_orders
    where customer_org_id = v_org and idempotency_key = p_idempotency_key;

    if v_existing.id is not null then
      if v_existing.status <> 'draft' then
        return v_existing.id;  -- già piazzato: retry = successo, nessun duplicato.
      end if;
      -- Draft fantasma lasciato dal vecchio path non atomico: riparalo qui
      -- (righe reinserite da questo payload + submit) invece di restituire
      -- per sempre un ordine rotto. Solo se la connessione coincide: mai
      -- righe di un fornitore su un ordine intestato a un altro. RLS
      -- mol_write consente al cliente di riscrivere le righe finché è draft.
      if v_existing.connection_id <> p_connection_id then
        raise exception 'place_marketplace_order: idempotency key già usata per un altro fornitore' using errcode = 'P0304';
      end if;
      v_order_id := v_existing.id;
      delete from marketplace_order_lines where order_id = v_order_id;
    end if;
  end if;

  -- ── Connessione attiva del chiamante ──────────────────────────────────────
  select * into v_conn
  from supplier_customer_connections
  where id = p_connection_id and customer_org_id = v_org and status = 'active';
  if v_conn.id is null then
    raise exception 'place_marketplace_order: connessione fornitore non valida o revocata' using errcode = 'P0304';
  end if;

  -- ── Header (solo se non stiamo riparando un draft esistente) ───────────────
  if v_order_id is null then
    begin
      insert into marketplace_orders (
        customer_org_id, supplier_org_id, connection_id, status, notes,
        idempotency_key, created_by
      )
      values (
        v_org, v_conn.supplier_org_id, v_conn.id, 'draft', nullif(trim(coalesce(p_notes, '')), ''),
        nullif(trim(coalesce(p_idempotency_key, '')), ''), auth.uid()
      )
      returning id into v_order_id;
    exception when unique_violation then
      -- Gara persa sull'indice (customer_org_id, idempotency_key): l'altro
      -- commit è atomico, quindi l'ordine esistente è completo e piazzato.
      select id into v_order_id
      from marketplace_orders
      where customer_org_id = v_org and idempotency_key = p_idempotency_key;
      if v_order_id is null then raise; end if;
      return v_order_id;
    end;
  end if;

  -- ── Righe: snapshot dal catalogo del fornitore collegato (P0-1) ────────────
  -- Il join valida ogni riga: prodotto esistente, attivo e DEL fornitore della
  -- connessione. Se anche una sola riga è invalida, il conteggio non torna e
  -- l'intera transazione (header compreso) viene annullata.
  insert into marketplace_order_lines (
    order_id, catalog_item_id, name_snapshot, sku_snapshot, unit, quantity,
    unit_price_snapshot, sort_order
  )
  select
    v_order_id, i.id, i.name, i.sku, i.unit,
    (l.value ->> 'quantity')::numeric, i.unit_price, l.ordinality - 1
  from jsonb_array_elements(p_lines) with ordinality as l(value, ordinality)
  join supplier_catalog_items i
    on i.id = (l.value ->> 'catalog_item_id')::uuid
   and i.supplier_org_id = v_conn.supplier_org_id
   and i.is_active;

  get diagnostics v_inserted = row_count;
  if v_inserted <> v_expected then
    raise exception 'place_marketplace_order: % righe su % non valide per questo fornitore', v_expected - v_inserted, v_expected
      using errcode = 'P0305';
  end if;

  -- ── Submit nella STESSA transazione ────────────────────────────────────────
  -- Il trigger guard rivalida transizione+parte e stampa submitted_at; il
  -- trigger history scrive draft e draft->submitted. Se fallisce, rollback
  -- totale: nessun draft superstite, key non consumata.
  update marketplace_orders set status = 'submitted' where id = v_order_id;

  return v_order_id;
end;
$$;

comment on function public.place_marketplace_order(uuid, jsonb, text, text) is
  'Crea e sottomette un ordine marketplace in una transazione (P0-1). Retry con stessa idempotency key = successo con l''ordine esistente (P0-2). SECURITY INVOKER: RLS e trigger restano il confine.';

revoke all on function public.place_marketplace_order(uuid, jsonb, text, text) from public, anon;
grant execute on function public.place_marketplace_order(uuid, jsonb, text, text) to authenticated;
