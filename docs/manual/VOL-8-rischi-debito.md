# VOLUME 8 — Rischi, limiti, debito tecnico e roadmap documentale

> Collana: **Manuale BakeryOS** · [Indice](INDEX.md)
> Classificazione onesta in tre fasce. Stato al commit `371b0c7` / migration `056`. Dove il documento di Fase 1 (`../BAKERYOS_PHASE1_INVENTORY.md`) diverge dal codice attuale, prevale il codice e il **delta è annotato**.

## 8.1 Delta rispetto all'inventario Fase 1 (cosa NON è più vero)

| Fase 1 diceva | Oggi |
|---|---|
| 6 pagine client-fetch `[RISCHIO]` (production/new, ingredients/*, suppliers/[id], recipes/new, inventory/movement) | **Risolto** (P0-1, `371b0c7`): tutte server-first; le 9 route `/api/catalog|customers|production|inventory-level` sono **eliminate** |
| Mappature POS in `/settings/pos`; doppia superficie di link (LinkProductForm) | **Risolto** (`c4aaa5f`): wizard unico `/sales/pos`, redirect legacy, seconda via rimossa |
| Nessun waste sui finiti; teorico = produced−sold | **Risolto** (056): `waste` + vista `produced−sold−wasted` |
| Nav con "Vendite" e "Ordini clienti" separate | **Risolto**: voce unica con alias d'area |
| *(sprint friction-removal)* fine giornata sparso; conferma produzione al buio; ritiro≠vendita; mappa→inbox→riprova; giorno-1 muto | **Risolto**: CloseDayCard + ActivationChecklist in dashboard; ConfirmDialog con riepilogo sul completamento; "Consegnato · registra vendita" con form precompilato; auto-relink al salvataggio mappatura |
| *(sprint friction-removal)* fail-open totale del gating; scoping service-role a mano; `norm()` ×3; commenti "esplosione BOM"; bozze magazzino monofornitore; draft receipts eterni | **Risolto**: `lib/workspace-gate.ts` (supplier mai senza tipo confermato, testato); `lib/supabase/org-scope.ts` by-construction su `pos/repository`; `normalizePosRef` unico + parity test 7×7; commenti corretti; `createDraftOrdersFromLowStock` per-fornitore; auto-archivio draft vuoti >7gg; `.nvmrc` |
| `complete_purchase_receipt` posta nell'unità della riga | **Risolto** (054): unità del prodotto, conversione-o-P0212 |
| Nessuna CI / riconciliazione | **Risolto** (ci.yml, 055) |
| 14 route API | Oggi **5** (webhook + 4 `pos/*`) |

## 8.2 Rischio reale OGGI (da tenere d'occhio, non da drammatizzare)

1. **Pipeline POS mai esercitata in produzione** (0 eventi reali al momento degli audit). Il motore è testato e idempotente "by construction": il primo pilota va accompagnato con la riconciliazione giornaliera sotto gli occhi. *Mitigazione già in atto: wizard, dry-run, inbox, card stato.*
2. **`MIPOS_WEBHOOK_SECRET` globale (env), non per-org**: con UN cliente POS va bene; PRIMA del secondo serve il secret in `pos_configs` (piano B9 dell'audit).
3. **Ordini cliente: insert ordine+righe non atomico e transizioni senza history** (`modules/customers`): rischio contenuto (dati piccoli, correzione manuale), ma è l'unico stato del sistema non auditabile.
4. **Ritiro prenotazione ≠ vendita**: se il banconista non registra la vendita al ritiro, i finiti non scendono (procedura nel VOL-7 §7.4; fix P1: "Consegnato → proponi vendita").
5. **e2e fuori CI**: girano manualmente su staging (dataset+auth dedicati). La CI copre typecheck+unit+SQL; il layer visuale/flow è a esecuzione umana.

## 8.3 Hardening futuro (P1 — pianificato, non bloccante)

- Auto-match documenti all'upload quando l'ordine è noto + coda anomalie ordinata per € di varianza.
- Bozza d'ordine AGGREGATA per fornitore da tutti i sotto-soglia (oggi: 1 link = 1 ingrediente).
- Auto-archiviazione dei receipt `draft` vuoti >7gg (in prod se ne accumulano).
- Dettaglio ordine cliente + history + collegamento ritiro→vendita.
- "Collega tutti i suggeriti" (bulk mapping POS a soglia di confidenza).
- Empty-state esplicativi in Analytics per i KPI che si popoleranno col POS.
- Riconciliazione POS per giorno: usare la data vendita anche lato eventi (oggi `received_at`: falsi mismatch a cavallo di mezzanotte).

## 8.4 Miglioramenti non bloccanti (P2)

- Merge concettuale **Ingredienti → tab di Magazzino** (stesso oggetto fisico, due voci di menu).
- Superficie per `finished_goods_levels` (il ledger finiti è scritto ma MAI letto da una pagina: la UI mostra solo il teorico giornaliero — due verità, una esposta).
- FEFO reale (consumo per lotto in produzione) — SOLO con ladder di test come 036/037.
- Membri/ruoli in Impostazioni; lead-time fornitori; secondo provider POS (il seam adapter è pronto).
- Realtime/polling sulle code operative (oggi propagazione on-demand, dichiarata).

## 8.5 Layering violations, dead code, incoerenze testuali

| Tipo | Dove | Nota |
|---|---|---|
| Layering | `suppliers/page.tsx` interroga `supplier_price_list` direttamente (bypass service) | non è un rischio RLS; da rientrare nel catalog service |
| Pattern misto | `DryRunTester`/`ReplayButton` usano fetch verso `/api/pos/*` invece di server action | guardie corrette nel service; uniformare quando si tocca |
| Dead-by-design | `receive_purchase_order` (RPC legacy, revocata all'app) | tenuta come storia; non riesumare |
| Commenti stale | `pos/ingest.ts` e `sales/service.ts` citano ancora "esplosione BOM" | il codice fa la 050; ripulire i commenti |
| Fixture drift | staging ≠ prod per storia migration (slice); la CI compila la catena DA ZERO e fa da arbitro | documentato in `bakeryos-inventory-writepath-bugs` |
| File orfano | `e2e/package-lock.json` non tracciato | decidere: commit o ignore |
| Config | `npm run lint` esiste ma ESLint non è inizializzato (build ignora il lint) | scelta esplicita in `next.config.mjs`; valutare init dedicato |

## 8.6 Gap di test (mappa onesta)

**Coperto bene**: parser (DDT/GS1/matching/recipe-import), motore POS (adapter/ingest/webhook/relink/recon/status), transizioni (marketplace/ordering/customers/production), unità (TS+SQL), write-path SQL critici (5 suite transazionali in CI: RLS, place/receive, unit-guard, double-count, waste), riconciliazione (smoke in CI + prima run verificata su entrambi gli ambienti).
**Scoperto**: ramo "anomalie>0 ⇒ notifica" della 055 (verificato solo il ramo a zero); documents matching (solo `matching.test.ts` di base, il service no); portal service; e2e in CI; `ingest_sale_system` a livello SQL (coperto via unit TS del contorno).

## 8.7 Roadmap documentale

1. Aggiornare questo manuale a ogni migration nuova (≥057) e a ogni cambio di nav — un volume tocca di rado più di un file.
2. Scrivere la scheda "runbook pilota POS" come documento operativo separato quando parte il primo cliente (bozza: checklist nel report dello sprint P0).
3. Dopo il merge Ingredienti→Magazzino (P2): rifondere §2.6/§2.10.
4. **[non confermato]** da validare con lettura dedicata alla prossima edizione: internals `portal/service.ts` completi, commit finale `recipe-import`, corpo di `applyWeekTemplate`.

---
*Fine collana. [Torna all'indice](INDEX.md)*
