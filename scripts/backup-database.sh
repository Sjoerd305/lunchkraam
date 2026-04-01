#!/usr/bin/env bash
# Maakt een gecomprimeerde SQL-dump van de Postgres-database uit docker-compose
# en (indien aanwezig) een tar.gz van bonfoto's.
# Bronvolgorde bonfoto's:
#   1) lokale map RECEIPTS_DIR (host)
#   2) app-container RECEIPTS_DIR (handig bij named volume in docker-compose)
# Terugzetten: scripts/restore-database.sh backups/lunchkraam-....sql.gz
# Vereist: draaiende stack (minstens postgres).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p backups
RECEIPTS_DIR="${RECEIPTS_DIR:-data/receipts}"

if [ -z "$(docker compose ps -q postgres 2>/dev/null)" ]; then
  echo "Geen draaiende postgres-container. Start met: docker compose up -d postgres" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="backups/lunchkraam-${STAMP}.sql"
RECEIPTS_OUT="backups/lunchkraam-${STAMP}-receipts.tar.gz"

docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" --no-owner --no-acl "$POSTGRES_DB"' >"$OUT"
gzip -f "$OUT"

echo "Backup geschreven: ${OUT}.gz"
ls -lh "${OUT}.gz"

if [[ -d "$RECEIPTS_DIR" ]]; then
  tar -C "$RECEIPTS_DIR" -czf "$RECEIPTS_OUT" .
  echo "Bonfoto-backup geschreven vanaf host-map: ${RECEIPTS_OUT}"
  ls -lh "${RECEIPTS_OUT}"
elif [ -n "$(docker compose ps -q app 2>/dev/null)" ]; then
  RECEIPTS_DIR_IN_APP="$(docker compose exec -T app sh -lc 'printf "%s" "${RECEIPTS_DIR:-/app/data/receipts}"')"
  if docker compose exec -T app sh -lc "test -d \"$RECEIPTS_DIR_IN_APP\""; then
    docker compose exec -T app sh -lc "tar -C \"$RECEIPTS_DIR_IN_APP\" -czf - ." >"$RECEIPTS_OUT"
    echo "Bonfoto-backup geschreven vanaf app-container: ${RECEIPTS_OUT}"
    ls -lh "${RECEIPTS_OUT}"
  else
    echo "Bonfoto-map niet gevonden (host: ${RECEIPTS_DIR}, app: ${RECEIPTS_DIR_IN_APP}); bonfoto-backup overgeslagen."
  fi
else
  echo "Bonfoto-map niet gevonden (${RECEIPTS_DIR}) en app-container draait niet; bonfoto-backup overgeslagen."
fi
