#!/usr/bin/env bash
# Maakt een gecomprimeerde SQL-dump van de Postgres-database uit docker-compose.
# Terugzetten: scripts/restore-database.sh backups/lunchkraam-....sql.gz
# Vereist: draaiende stack (minstens postgres).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p backups

if [ -z "$(docker compose ps -q postgres 2>/dev/null)" ]; then
  echo "Geen draaiende postgres-container. Start met: docker compose up -d postgres" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="backups/lunchkraam-${STAMP}.sql"

docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" --no-owner --no-acl "$POSTGRES_DB"' >"$OUT"
gzip -f "$OUT"

echo "Backup geschreven: ${OUT}.gz"
ls -lh "${OUT}.gz"
