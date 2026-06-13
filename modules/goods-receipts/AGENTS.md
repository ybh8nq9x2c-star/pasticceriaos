# modules/goods-receipts/ — Agent Guide

> **Goods Receipt Engine**: motore UNICO di ricevimento merce, condiviso da bakery e
> supplier (`mode: 'bakery' | 'supplier'`). Le stesse action servono entrambe le UI
> (`/receipts` e `/supplier/receipts`); il `mode` decide path di revalidate/redirect.

## Cosa fa

Sessione di ricevimento assistita: **scanner barcode**, **import DDT (PDF)**, o
inserimento manuale → matching sul catalogo dell'org → completamento che contabilizza
lo stock. Supporta fornitori **connessi BakeryOs** e **fornitori esterni** (la bakery
compra anche da chi non usa BakeryOs).

## INVARIANTE: come muove lo stock

> Lo stock cambia **solo** via la RPC transazionale **`complete_purchase_receipt`**
> (`supabase/migrations_v2/035_goods_receipts.sql`). Mai update diretti delle giacenze.

La RPC, in **una transazione** (row-lock sul receipt → serializza i doppi submit):
1. per ogni riga calcola `delta = qty_received − qty_posted` (salta delta = 0);
2. inserisce un `inventory_movements` `purchase_receipt` (con `qty_before`/`qty_after` di audit);
3. crea il lotto in `ingredient_batches` se c'è `expiry_date`;
4. avanza l'eventuale ordine collegato (`order_line_items.quantity_received`, cap alla qty ordinata);
5. ricalcola lo stato del receipt e porta il PO a `received` se tutte le righe sono coperte.

✅ **Verificato**: usa correttamente il ledger esistente (`inventory_movements` +
trigger su `inventory_levels`). **Non crea una fonte di verità duplicata.**

## Idempotenza — il cuore del design

`purchase_receipt_lines.qty_posted` = quantità GIÀ contabilizzata. Il prossimo
`complete` registra solo `qty_received − qty_posted`. Quindi:
- doppio submit / doppio scan → **nessun movimento duplicato**;
- ricevimenti parziali incrementali → si aggiunge solo il nuovo delta.

**Non rompere `qty_posted`**: non azzerarlo, non scriverlo dall'app (lo gestisce la RPC).
`updateLine` impedisce di portare `qty_received` sotto `qty_posted` (serve una rettifica di magazzino).

## Stati

`receipt_status`: `draft → expected → partial → (completed | discrepancy | cancelled)`.
Modificabile solo se `OPEN_STATUSES = [draft, expected, partial]` (`assertOpen`).
Annullamento consentito solo se nessuna riga ha `qty_posted > 0` (altrimenti serve rettifica).

## File

| File | Ruolo |
|------|-------|
| `service.ts` | Ciclo di vita receipt, matching, completamento. **Non muove stock se non via RPC.** |
| `repository.ts` | Query tipizzate RLS. Zero logica. |
| `matching.ts` | Match prodotto da barcode/sku/nome + `AUTO_MATCH_THRESHOLD`. Coperto da test. |
| `ddt-parser.ts` | Parsing testo DDT → righe. Best-effort, accumula `warnings`. Test dedicato. |
| `pdf-text.ts` | `extractPdfText(file: File)` via `pdf-parse`. **`server-only`**. ⚠️ vedi sotto. |
| `actions.ts` | `'use server'`, thin; `revalidateReceipt` rinfresca anche `/inventory*`. |

## ⚠️ Trappole runtime (già costate deploy)

- **Node 20 obbligatorio.** `pdf-text.ts` riceve un `File` (global Web API): esiste solo
  da Node 20. Su Node 18 → `File is not defined`. Pin in `package.json` `engines.node`.
- **`pdf-parse` non bundlato**: dichiarato in `next.config.mjs`
  `serverComponentsExternalPackages`. L'import usa il path interno
  `pdf-parse/lib/pdf-parse.js` (il wrapper rompe webpack). Non "semplificare" l'import.
- Aggiungendo dipendenze qui (es. parser), **sincronizza `package-lock.json`** (già causa di build rotte).

## Rapporto con gli altri write-path

Non è l'unico modo di caricare stock: vedi i **tre write-path** in
[`../inventory/AGENTS.md`](../inventory/AGENTS.md). Preferisci SEMPRE questo engine per
ricezioni reali (scan/DDT/parziali). Non aggiungere un quarto path: estendi questo.

## Validazione

`npm run typecheck && npm run test` (`__tests__/`: `matching`, `ddt-parser`,
`receipt-status`) + e2e `e2e/tests/80-goods-receipts.spec.ts`.
