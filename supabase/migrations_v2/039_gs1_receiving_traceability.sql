-- =============================================================================
-- 039_gs1_receiving_traceability.sql
-- Tracciabilità GS1 completa sulle righe di ricevimento.
--
-- Quando si scansiona/incolla un'etichetta GS1-128, oltre a lotto e scadenza
-- (già persistiti) vogliamo conservare TUTTI i dati di tracciabilità letti:
-- SSCC, GTIN, numero colli, data di produzione, il raw payload e la mappa
-- completa degli Application Identifier (anche quelli non ancora mappati a una
-- colonna canonica).
--
-- ADDITIVE & SAFE: solo colonne nullable su purchase_receipt_lines. Nessuna
-- modifica ai write-path esistenti (035/036/037 invariati). I ricevimenti
-- senza GS1 (manuali/DDT) restano con queste colonne a NULL.
-- =============================================================================

alter table purchase_receipt_lines
  add column if not exists gtin             text,
  add column if not exists sscc             text,
  add column if not exists case_quantity    integer check (case_quantity is null or case_quantity >= 0),
  add column if not exists production_date  date,
  add column if not exists gs1_raw          text,
  add column if not exists gs1_ai           jsonb;

comment on column purchase_receipt_lines.gtin is
  'GTIN del prodotto letto da GS1 AI (01), o GTIN contenuto (02) se manca (01).';
comment on column purchase_receipt_lines.sscc is
  'SSCC (00): identificativo dell''unità logistica/pallet. Dato logistico, non identifica il prodotto.';
comment on column purchase_receipt_lines.case_quantity is
  'Numero di trade item nell''unità logistica, da GS1 AI (37). NON usato come quantità a magazzino.';
comment on column purchase_receipt_lines.production_date is
  'Data di produzione da GS1 AI (11).';
comment on column purchase_receipt_lines.gs1_raw is
  'Raw payload originale del barcode GS1 (audit/tracciabilità/debug).';
comment on column purchase_receipt_lines.gs1_ai is
  'Mappa completa Application Identifier → valore letti dal barcode (jsonb). Conserva anche gli AI senza colonna canonica (13/16/pesi 310x/320x…).';

-- Lookup per SSCC (rintraccio di un pallet/collo specifico).
create index if not exists idx_receipt_lines_sscc
  on purchase_receipt_lines (sscc) where sscc is not null;
