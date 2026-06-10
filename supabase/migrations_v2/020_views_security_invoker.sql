-- =============================================================================
-- 020_views_security_invoker.sql
-- Fix advisor ERROR "security_definer_view" sulle 4 viste reporting.
--
-- CONTESTO: 008_views.sql dichiarava esplicitamente l'intento "la RLS delle
-- tabelle sottostanti si applica per l'utente corrente, non serve WHERE
-- organization_id". Ma in Postgres una vista gira di default coi privilegi del
-- SUO OWNER (semantica security definer), quindi la RLS delle tabelle veniva
-- BYPASSATA: un utente autenticato che interrogava la vista via PostgREST
-- avrebbe potuto leggere righe di TUTTE le organizzazioni.
--
-- FIX: security_invoker = on (Postgres 15+) -> la vista viene valutata coi
-- permessi e la RLS dell'utente chiamante, cioè la semantica che 008 intendeva.
-- L'app filtra già per organization_id nelle query, quindi nessun cambiamento
-- funzionale lato UI: cambia solo che il DB ora applica il confine davvero.
--
-- BONUS hardening (advisor WARN): la trigger function
-- update_inventory_level_from_movement() non deve essere chiamabile come RPC.
-- I trigger continuano a funzionare (girano come table owner).
--
-- ADDITIVE & SAFE. Rollback: alter view ... set (security_invoker = off);
-- =============================================================================

alter view public.v_ingredient_requirements set (security_invoker = on);
alter view public.v_low_stock_alerts        set (security_invoker = on);
alter view public.v_open_orders             set (security_invoker = on);
alter view public.v_inventory_stock_full    set (security_invoker = on);

revoke all on function public.update_inventory_level_from_movement()
  from public, anon, authenticated;
