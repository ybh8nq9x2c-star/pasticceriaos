-- =============================================================================
-- 030_advisor_hardening_2.sql
-- search_path fisso sulla trigger function del guard terminale; revoca PUBLIC
-- dagli helper SECURITY DEFINER (il grant implicito a PUBLIC riesposava anon).
-- =============================================================================

alter function fn_block_terminal_status_change() set search_path = '';

revoke execute on function current_account_type() from public;
revoke execute on function current_organization_id() from public;
revoke execute on function is_org_owner() from public;
grant execute on function current_account_type() to authenticated;
grant execute on function current_organization_id() to authenticated;
grant execute on function is_org_owner() to authenticated;
