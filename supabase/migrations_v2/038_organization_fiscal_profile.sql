-- =============================================================================
-- 038_organization_fiscal_profile.sql
-- Profilo fiscale dell'organizzazione: P.IVA + denominazione + forma giuridica.
--
-- ADDITIVO & SAFE: solo colonne NULLABLE su `organizations` (l'entità canonica
-- "azienda"). NESSUNA nuova tabella, nessun sistema parallelo per dati aziendali
-- o fatturazione. La fatturazione NON viene attivata da qui: `billing_eligible`
-- esprime solo l'IDONEITÀ (P.IVA formalmente valida), non l'emissione automatica.
--
-- `fiscal_data_source` distingue dati INSERITI manualmente da dati provenienti da
-- un futuro lookup esterno (vies / registro_imprese): la V1 scrive solo 'manual'.
-- =============================================================================

alter table organizations add column if not exists vat_number text;
alter table organizations add column if not exists vat_country text not null default 'IT';
alter table organizations add column if not exists legal_name text;
alter table organizations add column if not exists legal_form text;
alter table organizations add column if not exists fiscal_data_source text
  check (fiscal_data_source is null or fiscal_data_source in ('manual', 'vies', 'registro_imprese'));
alter table organizations add column if not exists vat_validated_at timestamptz;
alter table organizations add column if not exists billing_eligible boolean not null default false;

comment on column organizations.vat_number is
  'Partita IVA (solo cifre per IT). Validazione formale (checksum) lato app; lookup esterno futuro.';
comment on column organizations.vat_country is
  'Country code della P.IVA (default IT). In V1 è verificabile via checksum solo IT.';
comment on column organizations.legal_name is
  'Denominazione/ragione sociale ufficiale (può differire dal nome visualizzato dell''org).';
comment on column organizations.legal_form is
  'Forma giuridica: ditta_individuale | srl | srls | spa | sas | snc | sapa | cooperativa | altro.';
comment on column organizations.fiscal_data_source is
  'Provenienza dei dati azienda: manual (inseriti) | vies | registro_imprese (lookup esterni, futuri).';
comment on column organizations.billing_eligible is
  'Idoneità alla fatturazione (P.IVA formalmente valida). NON attiva l''emissione automatica di fatture.';
