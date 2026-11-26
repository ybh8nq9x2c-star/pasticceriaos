#!/usr/bin/env bash
# =============================================================================
# receipts_concurrency.sh — regressione W4 con DUE sessioni Postgres reali.
# Gira SOLO su DB effimero (CHAIN_TEST_BOOTSTRAP=1): le fixture vanno COMMITTATE
# perché l'altra sessione le veda; vengono rimosse a inizio e fine.
#
#   C1  due aperture concorrenti dello stesso ordine → UNA sola sessione;
#   C2  due consegne concorrenti (+4 e +5) sulla stessa sessione → a magazzino
#       esattamente la somma (9), riga d'ordine 9/10;
#   C3  due consegne concorrenti che insieme superano il residuo (+6 e +6 su 10)
#       → una passa, l'altra è rifiutata (P0046): a magazzino 6, mai 12.
# =============================================================================
set -euo pipefail
: "${DATABASE_URL:?}"
P=(psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -At)

ORG=9c000000-0000-0000-0000-00000000000a
USR=9c000000-0000-0000-0000-0000000000a1
SUP=9c000000-0000-0000-0000-0000000005a1
ING=9c000000-0000-0000-0000-0000000001a1
PO1=9c000000-0000-0000-0000-0000000009a1
PO2=9c000000-0000-0000-0000-0000000009a2
OL1=9c000000-0000-0000-0000-000000000e01
OL2=9c000000-0000-0000-0000-000000000e02
AS="set role authenticated; select set_config('request.jwt.claims', json_build_object('sub','$USR','role','authenticated')::text, false);"

cleanup() {
  "${P[@]}" <<SQL >/dev/null
delete from production_batch_ingredients where organization_id = '$ORG';
delete from ingredient_batches where organization_id = '$ORG';
delete from inventory_movements where organization_id = '$ORG';
delete from inventory_levels where organization_id = '$ORG';
delete from purchase_receipt_lines where receipt_id in (select id from purchase_receipts where organization_id = '$ORG');
delete from purchase_receipts where organization_id = '$ORG';
delete from order_status_history where purchase_order_id in ('$PO1', '$PO2');
delete from order_line_items where purchase_order_id in ('$PO1', '$PO2');
delete from purchase_orders where organization_id = '$ORG';
delete from ingredient_products where organization_id = '$ORG';
delete from suppliers where organization_id = '$ORG';
delete from org_members where organization_id = '$ORG';
delete from organizations where id = '$ORG';
delete from auth.users where id = '$USR';
SQL
}
fail() { echo "✗ receipts_concurrency: $*" >&2; cleanup; exit 1; }

cleanup
"${P[@]}" <<SQL >/dev/null
insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '$USR', 'authenticated', 'authenticated', 'w4c@test.local');
insert into organizations (id, name, slug, account_type) values ('$ORG', 'W4 Conc', 'w4-conc', 'customer');
insert into org_members (organization_id, user_id, role) values ('$ORG', '$USR', 'owner');
insert into suppliers (id, organization_id, name, email) values ('$SUP', '$ORG', 'Sup C', 'c@test.local');
insert into ingredient_products (id, organization_id, supplier_id, name, unit) values ('$ING', '$ORG', '$SUP', 'Farina C', 'kg');
insert into purchase_orders (id, organization_id, supplier_id, status, order_date, sent_at, created_by) values
  ('$PO1', '$ORG', '$SUP', 'confirmed', current_date, now(), '$USR'),
  ('$PO2', '$ORG', '$SUP', 'confirmed', current_date, now(), '$USR');
insert into order_line_items (id, purchase_order_id, ingredient_product_id, quantity_ordered, quantity_received, unit) values
  ('$OL1', '$PO1', '$ING', 10, 0, 'kg'),
  ('$OL2', '$PO2', '$ING', 10, 0, 'kg');
SQL

# ── C1: due aperture concorrenti ──────────────────────────────────────────────
# A apre e TIENE la transazione 2 s; B parte dopo 0.3 s e deve attendere il lock.
tmp="$(mktemp -d)"
"${P[@]}" -c "$AS begin; select public.open_receipt_for_order('$PO1'); select pg_sleep(2); commit;" \
  | grep -E '^[0-9a-f-]{36}$' > "$tmp/a" &
sleep 0.3
"${P[@]}" -c "$AS select public.open_receipt_for_order('$PO1');" | grep -E '^[0-9a-f-]{36}$' > "$tmp/b"
wait
[[ -s "$tmp/a" && "$(cat "$tmp/a")" == "$(cat "$tmp/b")" ]] || fail "C1 due sessioni diverse: $(cat "$tmp/a") vs $(cat "$tmp/b")"
n=$("${P[@]}" -c "select count(*) from purchase_receipts where purchase_order_id = '$PO1' and status in ('draft','expected','partial');")
[[ "$n" == "1" ]] || fail "C1 attesa 1 sessione aperta, trovate $n"
RID="$(cat "$tmp/a")"
echo "  C1 OK: aperture concorrenti → stessa sessione $RID"

# ── C2: due consegne concorrenti +4 e +5 sulla stessa sessione ───────────────
inc() { # $1 = quantità, $2 = sleep dentro la transazione
  "${P[@]}" -c "$AS begin;
    update purchase_receipt_lines set qty_received = qty_received + $1
     where receipt_id = '$RID' and order_line_item_id = '$OL1';
    select public.complete_purchase_receipt('$RID');
    select pg_sleep($2);
    commit;" >/dev/null 2>"$tmp/err_$1_$2" || true
}
inc 4 1.5 &
sleep 0.3
inc 5 0
wait
stock=$("${P[@]}" -c "select current_quantity::numeric(12,2) from inventory_levels where ingredient_product_id = '$ING';")
oli=$("${P[@]}" -c "select quantity_received::numeric(12,2) from order_line_items where id = '$OL1';")
[[ "$stock" == "9.00" ]] || fail "C2 stock atteso 9 (4+5), trovato $stock — err: $(cat "$tmp"/err_* 2>/dev/null)"
[[ "$oli" == "9.00" ]] || fail "C2 riga ordine attesa 9, trovata $oli"
echo "  C2 OK: consegne concorrenti +4/+5 → stock 9, riga ordine 9/10"

# ── C3: +6 e +6 su residuo 10 (secondo ordine) → una rifiutata ───────────────
RID2=$("${P[@]}" -c "$AS select public.open_receipt_for_order('$PO2');" | grep -E '^[0-9a-f-]{36}$')
inc2() {
  "${P[@]}" -c "$AS begin;
    update purchase_receipt_lines set qty_received = qty_received + 6
     where receipt_id = '$RID2' and order_line_item_id = '$OL2';
    select public.complete_purchase_receipt('$RID2');
    select pg_sleep($1);
    commit;" >/dev/null 2>"$tmp/c3_$1" || true
}
inc2 1.5 &
sleep 0.3
inc2 0
wait
moved=$("${P[@]}" -c "select coalesce(sum(quantity_delta),0)::numeric(12,2) from inventory_movements where reference_id = '$RID2';")
oli2=$("${P[@]}" -c "select quantity_received::numeric(12,2) from order_line_items where id = '$OL2';")
grep -q "Eccedenza" "$tmp"/c3_* || fail "C3 nessuna sessione ha ricevuto P0046"
[[ "$moved" == "6.00" ]] || fail "C3 a magazzino attesi 6 (una consegna), trovati $moved"
[[ "$oli2" == "6.00" ]] || fail "C3 riga ordine attesa 6, trovata $oli2"
echo "  C3 OK: +6/+6 su residuo 10 → una consegna posta 6, l'altra rifiutata (P0046)"

rm -rf "$tmp"
cleanup
echo "receipts_concurrency: OK"
