-- =============================================================================
-- 064_marketplace_line_snapshot_guard.sql  (F-08 di SECURITY_REPORT.md)
--
-- Problema: place_marketplace_order (051) prende prezzo/nome/unità dal catalogo
-- del fornitore, ma le policy mo_insert + mol_write permettevano lo stesso flusso
-- SENZA RPC: il cliente inseriva testata e righe da PostgREST con
-- unit_price_snapshot / name_snapshot arbitrari e poi passava l'ordine a
-- 'submitted'. Il fornitore riceveva prezzi non suoi; la pasticceria, alla
-- ricezione, aggiornava la propria cache prezzi con valori falsi.
--
-- Fix: sulle scritture dal client (authenticated, incluso place_marketplace_order
-- che è SECURITY INVOKER) lo snapshot della riga viene SEMPRE ricalcolato dal
-- catalogo del fornitore dell'ordine. Riga senza prodotto del catalogo, di un
-- altro fornitore o non attivo → P0305 (stesso codice della 051). Il client
-- sceglie solo prodotto e quantità. Le scritture del ruolo di migrazione/service
-- non passano dal guard (fixture e manutenzione).
-- Funzione SECURITY INVOKER di proposito: deve vedere il current_user reale
-- (is_direct_client_write, 058) e leggere il catalogo con la RLS del chiamante.
-- =============================================================================

create or replace function public.fn_marketplace_line_snapshot_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_item record;
begin
  if not public.is_direct_client_write() then
    return new;
  end if;

  if new.catalog_item_id is null then
    raise exception 'riga d''ordine marketplace senza prodotto del catalogo del fornitore'
      using errcode = 'P0305';
  end if;

  select i.name, i.sku, i.unit, i.unit_price into v_item
  from marketplace_orders o
  join supplier_catalog_items i on i.id = new.catalog_item_id
                               and i.supplier_org_id = o.supplier_org_id
                               and i.is_active
  where o.id = new.order_id;
  if not found then
    raise exception 'il prodotto non appartiene al fornitore dell''ordine o non è disponibile'
      using errcode = 'P0305';
  end if;

  -- snapshot SEMPRE dal catalogo: il client non decide prezzo, nome o unità
  new.name_snapshot       := v_item.name;
  new.sku_snapshot        := v_item.sku;
  new.unit                := v_item.unit;
  new.unit_price_snapshot := v_item.unit_price;
  return new;
end;
$$;
revoke all on function public.fn_marketplace_line_snapshot_guard() from public, anon, authenticated;

drop trigger if exists trg_marketplace_line_snapshot_guard on public.marketplace_order_lines;
create trigger trg_marketplace_line_snapshot_guard
  before insert or update on public.marketplace_order_lines
  for each row execute function public.fn_marketplace_line_snapshot_guard();

comment on function public.fn_marketplace_line_snapshot_guard() is
  'F-08 (064): sulle scritture client lo snapshot delle righe marketplace (nome, sku, unità, prezzo) è ricalcolato dal catalogo del fornitore dell''ordine; prodotto non valido → P0305.';
