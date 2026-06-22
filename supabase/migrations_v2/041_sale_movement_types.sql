-- =============================================================================
-- 041_sale_movement_types.sql
-- Aggiunge i tipi di movimento per la deduzione magazzino AL MOMENTO DELLA
-- VENDITA (V1 sale-time deduction):
--   • sale_deduction  → uscita (negativo): consumo materie prime per vendita
--   • sale_reversal   → entrata (positivo): storno/reso/annullo scontrino
--
-- DEVE stare in una migration SEPARATA da 042: un nuovo valore di enum non può
-- essere USATO (es. in un CHECK o in un INSERT) nella stessa transazione in cui
-- viene aggiunto. 041 commit-a i valori, 042 li usa.
-- ADDITIVE & SAFE: solo nuovi valori enum; nessun comportamento live cambia.
-- =============================================================================

alter type movement_type add value if not exists 'sale_deduction';
alter type movement_type add value if not exists 'sale_reversal';
