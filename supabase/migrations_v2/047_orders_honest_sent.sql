-- =============================================================================
-- 047_orders_honest_sent.sql
-- SPRINT 1 flusso ordini — invio ONESTO + transizione "sent" ATOMICA.
--
-- Problema: oggi un ordine diventa 'sent' anche quando il recapito automatico
-- NON è realmente attestato (canale email non configurato / fallito), ma la UI
-- mostra "Inviato" come se fosse consegnato. Inoltre status + history sono scritti
-- in due statement separati non atomici (buco di audit se il secondo fallisce).
--
-- Soluzione minimale:
--   1) dispatch_outcome: registra l'esito reale dell'invio sull'ordine
--      ('delivered' = recapito automatico attestato; 'manual' = nessun canale,
--      da inviare a mano; 'failed' = canale presente ma invio non riuscito).
--      La UI mostra "Inviato" SOLO per 'delivered', altrimenti "Da inviare a mano".
--   2) mark_order_sent(): porta draft -> sent, valorizza sent_at + dispatch_outcome
--      e scrive la history in UNA transazione (row-lock + org-check). Stesso
--      pattern delle altre RPC di dominio.
--
-- ADDITIVE & SAFE: 1 colonna nullable + 1 funzione nuova. Nessun nuovo status
-- enum, nessun effetto su magazzino, nessun secondo write-path di ricezione.
-- =============================================================================

-- ── 1) Esito invio sull'ordine ───────────────────────────────────────────────
alter table purchase_orders add column if not exists dispatch_outcome text
  check (dispatch_outcome is null or dispatch_outcome in ('delivered', 'manual', 'failed'));

comment on column purchase_orders.dispatch_outcome is
  'Esito dell''invio al fornitore: delivered = recapito automatico attestato; '
  'manual = nessun canale configurato, da inviare a mano; failed = invio tentato ma non riuscito. '
  'NULL = ordini non ancora inviati o pre-feature. La UI mostra "Inviato" solo se delivered.';

-- ── 2) Transizione draft -> sent ATOMICA (stato + sent_at + outcome + history) ─
create or replace function public.mark_order_sent(
  p_order_id uuid,
  p_outcome  text,
  p_note     text default null
)
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
    raise exception 'mark_order_sent: utente non autenticato' using errcode = 'P0001';
  end if;
  if p_outcome not in ('delivered', 'manual', 'failed') then
    raise exception 'mark_order_sent: esito invio non valido (%)', p_outcome using errcode = 'P0042';
  end if;

  -- Row-lock dell'ordine: serializza i doppi submit (no doppio invio/history).
  select organization_id, status into v_org, v_status
  from purchase_orders where id = p_order_id
  for update;

  if v_org is null then
    raise exception 'mark_order_sent: ordine non trovato' using errcode = 'P0044';
  end if;
  if v_org is distinct from current_organization_id() then
    raise exception 'mark_order_sent: ordine di un''altra organizzazione' using errcode = 'P0043';
  end if;
  if v_status <> 'draft' then
    raise exception 'mark_order_sent: transizione non consentita % -> sent', v_status using errcode = 'P0040';
  end if;

  update purchase_orders
  set status           = 'sent',
      sent_at          = now(),
      dispatch_outcome = p_outcome,
      updated_at       = now()
  where id = p_order_id;

  insert into order_status_history (purchase_order_id, from_status, to_status, changed_by, notes)
  values (p_order_id, v_status, 'sent', v_user, p_note);
end;
$$;

revoke all on function public.mark_order_sent(uuid, text, text) from public, anon;
grant execute on function public.mark_order_sent(uuid, text, text) to authenticated;

comment on function public.mark_order_sent(uuid, text, text) is
  'Transizione draft -> sent atomica: status + sent_at + dispatch_outcome + order_status_history in una transazione. Row-lock + org-check. SECURITY DEFINER.';
