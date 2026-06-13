-- =============================================================================
-- 036_inventory_reference_type_receipt.sql
-- FIX BUG B (bloccante): il goods receipt engine non riusciva a contabilizzare
-- stock.
--
-- CAUSA: complete_purchase_receipt (035) inserisce inventory_movements con
--   reference_type = 'purchase_receipt', ma il CHECK
--   inventory_movements_reference_type_check (005) ammetteva solo
--   'purchase_order' | 'production_plan' | 'manual'. Ogni completamento che
--   contabilizzava stock falliva con check_violation (23514): l'engine non
--   poteva mai caricare a magazzino.
--
-- FIX: ESTENDE il CHECK (FK polimorfa soft) per ammettere anche
--   'purchase_receipt'. reference_id resta il puntatore a purchase_receipts.id,
--   coerente con la tracciabilità documento→receipt→movimento già prevista da 035.
--
-- ADDITIVE & SAFE: nessuna nuova tabella, nessuna nuova fonte di verità.
--   inventory_movements resta l'unico ledger append-only; inventory_levels resta
--   una proiezione del trigger. Solo l'insieme dei reference_type ammessi si allarga.
--   I movimenti esistenti (purchase_order/production_plan/manual/null) restano validi.
-- =============================================================================

alter table inventory_movements
  drop constraint inventory_movements_reference_type_check;

alter table inventory_movements
  add constraint inventory_movements_reference_type_check check (
    reference_type is null
    or reference_type in ('purchase_order', 'production_plan', 'manual', 'purchase_receipt')
  );

comment on column inventory_movements.reference_type is
  'Tipo entità che ha originato il movimento: purchase_order | production_plan | manual | purchase_receipt.';

-- ── Rollback (eseguire solo per revert) ──────────────────────────────────────
-- ATTENZIONE: il revert fallisce se esistono già movimenti con
-- reference_type='purchase_receipt' (vanno prima rimossi/rietichettati).
-- alter table inventory_movements drop constraint inventory_movements_reference_type_check;
-- alter table inventory_movements add constraint inventory_movements_reference_type_check check (
--   reference_type is null or reference_type in ('purchase_order','production_plan','manual'));
