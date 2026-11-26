#!/usr/bin/env bash
# =============================================================================
# scripts/db/chain.sh — applica la catena di migration e/o esegue i test SQL.
# Unico entrypoint usato da CI, ambiente locale e documentazione (W1).
#
#   scripts/db/chain.sh check   # verifica che CHAIN classifichi ogni migration
#   scripts/db/chain.sh apply   # applica supabase/migrations_v2/CHAIN in ordine
#   scripts/db/chain.sh test    # esegue supabase/tests/SUITE
#   scripts/db/chain.sh all     # check + apply + test + smoke riconciliazione
#
# Richiede: psql nel PATH e DATABASE_URL (Postgres con schema Supabase: ruoli
# anon/authenticated/service_role, schema auth/storage). Per un DB locale usa
# scripts/db/local.sh, che avvia supabase/postgres in Docker e chiama questo file.
# Il DB deve partire con lo schema public VUOTO: la catena è da zero.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIG_DIR="$ROOT/supabase/migrations_v2"
CHAIN="$MIG_DIR/CHAIN"
TEST_DIR="$ROOT/supabase/tests"
SUITE="$TEST_DIR/SUITE"

# `check` è statico; gli altri comandi richiedono DATABASE_URL.
if [[ "${1:-all}" != "check" ]]; then
  : "${DATABASE_URL:?DATABASE_URL non impostata}"
fi
PSQL=(psql "${DATABASE_URL:-}" -v ON_ERROR_STOP=1 -X -q)

# righe significative di un manifest (senza commenti né righe vuote)
entries() { sed -e 's/#.*//' -e 's/[[:space:]]*$//' "$1" | grep -v '^[[:space:]]*$' || true; }

cmd_check() {
  local missing=0 listed excluded f
  listed="$(entries "$CHAIN" | grep -v '^!exclude' || true)"
  excluded="$(entries "$CHAIN" | sed -n 's/^!exclude[[:space:]]*//p')"
  for f in "$MIG_DIR"/[0-9]*.sql; do
    f="$(basename "$f")"
    if ! grep -qxF "$f" <<<"$listed" && ! grep -qxF "$f" <<<"$excluded"; then
      echo "✗ $f non è classificata in CHAIN (aggiungila in ordine o con !exclude)" >&2
      missing=1
    fi
  done
  while read -r f; do
    [[ -z "$f" ]] && continue
    [[ -f "$MIG_DIR/$f" ]] || { echo "✗ CHAIN cita $f che non esiste" >&2; missing=1; }
    [[ "$f" == *_down.sql ]] && { echo "✗ $f è un rollback: va in !exclude" >&2; missing=1; }
  done <<<"$listed"
  [[ $missing -eq 0 ]] || exit 1
  echo "✓ CHAIN coerente: $(wc -l <<<"$listed" | tr -d ' ') migration, $(grep -c . <<<"$excluded" || true) escluse"
}

cmd_bootstrap() {
  # Solo DB di test: stub di oggetti che su Supabase hosted crea la piattaforma
  # (es. tabelle storage.*). Attivo con CHAIN_TEST_BOOTSTRAP=1 (local.sh, CI).
  [[ "${CHAIN_TEST_BOOTSTRAP:-0}" == "1" ]] || return 0
  # Gli schemi di piattaforma (storage) non appartengono a `postgres`: il
  # bootstrap usa un ruolo superuser (supabase_admin) se indicato.
  local b url="${BOOTSTRAP_DATABASE_URL:-$DATABASE_URL}"
  for b in "$TEST_DIR"/bootstrap/*.sql; do
    [[ -e "$b" ]] || continue
    echo "── bootstrap (solo test) $(basename "$b")"
    psql "$url" -v ON_ERROR_STOP=1 -X -q -f "$b" || { echo "✗ bootstrap fallito: $b" >&2; exit 1; }
  done
}

cmd_apply() {
  local f n=0
  cmd_bootstrap
  while read -r f; do
    [[ -z "$f" || "$f" == '!exclude'* ]] && continue
    echo "── applying $f"
    "${PSQL[@]}" -f "$MIG_DIR/$f" || { echo "✗ migration fallita: $f" >&2; exit 1; }
    n=$((n + 1))
  done < <(entries "$CHAIN")
  echo "✓ catena applicata: $n migration"
}

cmd_test() {
  local t n=0 failed=()
  while read -r t; do
    [[ -z "$t" ]] && continue
    echo "── running $t"
    "${PSQL[@]}" -f "$TEST_DIR/$t" || { echo "✗ test fallito: $t" >&2; failed+=("$t"); continue; }
    n=$((n + 1))
  done < <(entries "$SUITE")
  # Test multi-sessione (fixture committate): SOLO su DB effimero.
  if [[ "${CHAIN_TEST_BOOTSTRAP:-0}" == "1" ]]; then
    for t in "$TEST_DIR"/concurrency/*.sh; do
      [[ -e "$t" ]] || continue
      echo "── running concurrency/$(basename "$t")"
      bash "$t" || { echo "✗ test fallito: $(basename "$t")" >&2; failed+=("$(basename "$t")"); continue; }
      n=$((n + 1))
    done
  else
    echo "── (test di concorrenza saltati: richiedono DB effimero, CHAIN_TEST_BOOTSTRAP=1)"
  fi
  if ((${#failed[@]})); then
    echo "✗ test SQL ROSSI: ${#failed[@]}/$((n + ${#failed[@]})) → ${failed[*]}" >&2
    exit 1
  fi
  echo "✓ test SQL verdi: $n suite"
}

cmd_smoke() {
  echo "── smoke run_nightly_reconciliation (read-only)"
  "${PSQL[@]}" -c "select public.run_nightly_reconciliation();" >/dev/null || { echo "✗ smoke fallito" >&2; exit 1; }
  echo "✓ riconciliazione eseguita"
}

case "${1:-all}" in
  check) cmd_check ;;
  # NB: niente catene `a && b`: dentro una lista && `set -e` è disattivato.
  apply) cmd_check; cmd_apply ;;
  test)  cmd_test ;;
  all)   cmd_check; cmd_apply; cmd_test; cmd_smoke ;;
  *) echo "uso: $0 check|apply|test|all" >&2; exit 2 ;;
esac
