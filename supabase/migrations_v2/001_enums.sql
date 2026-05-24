-- =============================================================================
-- 001_enums.sql
-- Tutti gli enum del dominio PasticceriaOS MVP.
-- =============================================================================

-- Unità di misura usate in ricette, movimenti e righe ordine.
-- Scelta deliberata: enum chiuso, non testo libero. Garantisce coerenza
-- tra recipe_ingredients, inventory_movements e order_line_items.
CREATE TYPE unit_of_measure AS ENUM (
  'g',        -- grammi
  'kg',       -- chilogrammi
  'ml',       -- millilitri
  'l',        -- litri
  'pz',       -- pezzi
  'bustina',  -- bustina (vaniglia, lievito in polvere)
  'foglio'    -- fogli (colla di pesce, pasta sfoglia precotta)
);

-- Tipo di movimento di magazzino. Ogni movimento è immutabile.
-- Correzioni = nuovo movimento di tipo manual_adjustment.
CREATE TYPE movement_type AS ENUM (
  'purchase_receipt',    -- entrata da ricezione ordine fornitore
  'production_usage',    -- uscita da chiusura piano di produzione
  'manual_adjustment',   -- correzione manuale con nota obbligatoria
  'initial_stock',       -- carico iniziale al setup organizzazione
  'waste',               -- scarti, prodotti scaduti o deteriorati
  'return_to_supplier'   -- reso al fornitore
);

-- Stato di un ordine di acquisto.
-- 'partial' è nello schema per MVP+1 ma non esposto nella UI MVP.
CREATE TYPE order_status AS ENUM (
  'draft',      -- bozza, non ancora inviata
  'sent',       -- email inviata, in attesa di conferma
  'confirmed',  -- fornitore ha confermato (opzionale MVP)
  'received',   -- merce ricevuta integralmente
  'partial',    -- merce ricevuta parzialmente (MVP+1)
  'cancelled'   -- annullato
);

-- Stato di un piano di produzione giornaliero.
CREATE TYPE plan_status AS ENUM (
  'draft',       -- piano creato, non ancora avviato
  'in_progress', -- produzione iniziata
  'completed',   -- produzione chiusa, stock detratto
  'cancelled'    -- piano annullato
);

-- Ruolo di un membro nell'organizzazione.
-- 'viewer' è nello schema per MVP+1 ma supportato da RLS fin da ora.
CREATE TYPE org_role AS ENUM (
  'owner',   -- proprietario, accesso completo incluso delete
  'baker',   -- operatore di laboratorio, crea/modifica dati operativi
  'viewer'   -- sola lettura (MVP+1)
);
