-- =============================================================================
-- 034_expiry_alerts_cron.sql
-- Scheduler giornaliero (05:00 UTC = 06:00 IT solare) che invoca la Edge
-- Function expiry-alerts via pg_net. Il CRON_SECRET vive nel Vault.
-- L'anon key nel header Authorization soddisfa verify_jwt (è una chiave
-- pubblica per definizione); il secret x-cron-secret è la difesa reale.
--
-- NB: nel DB live questa migration è stata applicata con il secret reale nel
-- Vault. Questo file usa un placeholder: NON committare secret in chiaro.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'expiry_alerts_cron_secret') then
    perform vault.create_secret(
      '<CRON_SECRET — vedi .env.local / password manager>',
      'expiry_alerts_cron_secret',
      'Header x-cron-secret per la edge function expiry-alerts'
    );
  end if;
end $$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'expiry-alerts-daily') then
    perform cron.unschedule('expiry-alerts-daily');
  end if;
end $$;

select cron.schedule(
  'expiry-alerts-daily',
  '0 5 * * *',
  $$
  select net.http_post(
    url := 'https://btxmjfjctrwlmonbnjpz.supabase.co/functions/v1/expiry-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <NEXT_PUBLIC_SUPABASE_ANON_KEY>',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'expiry_alerts_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
