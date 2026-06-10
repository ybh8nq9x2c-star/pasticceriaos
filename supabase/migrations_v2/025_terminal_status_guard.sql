-- =============================================================================
-- 025_terminal_status_guard.sql  (gate finale — bug bloccante)
-- Il service applicativo blocca già la modifica di piani completati e ordini
-- ricevuti, ma via PostgREST un membro org poteva riaprire uno stato TERMINALE
-- (received/completed/cancelled) e ricompletare/ri-ricevere -> movimenti
-- duplicati. Questi trigger chiudono il varco a livello DB.
-- Nessun path legittimo esce da uno stato terminale (le RPC partono da
-- confirmed/draft/in_progress), quindi zero impatti sui flussi esistenti.
-- =============================================================================

create or replace function fn_block_terminal_status_change()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'purchase_orders' then
    if old.status in ('received', 'cancelled') and new.status is distinct from old.status then
      raise exception 'Ordine in stato terminale (%): la transizione a % non è consentita', old.status, new.status
        using errcode = 'P0040';
    end if;
  elsif tg_table_name = 'production_plans' then
    if old.status in ('completed', 'cancelled') and new.status is distinct from old.status then
      raise exception 'Piano in stato terminale (%): la transizione a % non è consentita', old.status, new.status
        using errcode = 'P0040';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function fn_block_terminal_status_change() from public, anon, authenticated;

drop trigger if exists trg_po_terminal_guard on purchase_orders;
create trigger trg_po_terminal_guard
  before update of status on purchase_orders
  for each row execute function fn_block_terminal_status_change();

drop trigger if exists trg_plan_terminal_guard on production_plans;
create trigger trg_plan_terminal_guard
  before update of status on production_plans
  for each row execute function fn_block_terminal_status_change();
