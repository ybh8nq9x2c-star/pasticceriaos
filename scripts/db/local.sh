#!/usr/bin/env bash
# =============================================================================
# scripts/db/local.sh — DB Supabase usa-e-getta in Docker + catena + test SQL.
# Nessuna installazione sull'host oltre a Docker: psql gira dentro il container.
#
#   scripts/db/local.sh            # DB nuovo, catena da zero, test SQL, smoke
#   scripts/db/local.sh test       # solo test sul DB già avviato
#   scripts/db/local.sh stop       # rimuove il container
#
# Immagine: supabase/postgres (ruoli anon/authenticated/service_role, schema
# auth/storage/vault, pg_cron/pg_net disponibili), allineata a Supabase hosted.
# Il container è effimero e locale: non tocca mai progetti Supabase reali.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NAME="${BAKERYOS_SQLTEST_CONTAINER:-bakeryos-sqltest}"
IMAGE="${BAKERYOS_SQLTEST_IMAGE:-supabase/postgres:15.20.0.005}"
URL_IN_CONTAINER="postgresql://postgres:postgres@127.0.0.1:5432/postgres"
ADMIN_URL_IN_CONTAINER="postgresql://supabase_admin:postgres@127.0.0.1:5432/postgres"

run_in() { docker exec -e CHAIN_TEST_BOOTSTRAP=1 -e BOOTSTRAP_DATABASE_URL="$ADMIN_URL_IN_CONTAINER" -e DATABASE_URL="$URL_IN_CONTAINER" "$NAME" bash /repo/scripts/db/chain.sh "$@"; }

start_fresh() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres \
    -v "$ROOT:/repo:ro" -p 127.0.0.1:54329:5432 "$IMAGE" >/dev/null
  for _ in $(seq 1 60); do
    docker exec "$NAME" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break
    sleep 2
  done
  # l'init dell'immagine riavvia postgres una volta: attendi che sia stabile
  sleep 3
  docker exec "$NAME" pg_isready -U postgres -h 127.0.0.1 >/dev/null
}

case "${1:-all}" in
  all)  start_fresh && run_in all ;;
  test) run_in test ;;
  stop) docker rm -f "$NAME" >/dev/null && echo "✓ container rimosso" ;;
  *) echo "uso: $0 [all|test|stop]" >&2; exit 2 ;;
esac
