-- =============================================================================
-- 024_advisor_hardening.sql
-- Fix advisor WARN: search_path immutabile su unit_conversion_factor e revoca
-- EXECUTE ad anon sugli helper SECURITY DEFINER (per anon restituirebbero solo
-- NULL, ma il principio di minimo privilegio vale comunque).
-- =============================================================================

alter function unit_conversion_factor(unit_of_measure, unit_of_measure) set search_path = '';

revoke execute on function current_account_type() from anon;
revoke execute on function current_organization_id() from anon;
revoke execute on function is_org_owner() from anon;
