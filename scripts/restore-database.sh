#!/usr/bin/env bash
# Zet de Postgres-database terug vanuit een dump gemaakt met scripts/backup-database.sh.
# Vernietigt alle huidige data in POSTGRES_DB. Vereist: draaiende postgres-container.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

YES=0
if [[ "${1:-}" == "--yes" ]]; then
  YES=1
  shift
fi

DUMP="${1:-}"
if [[ -z "$DUMP" ]]; then
  echo "Gebruik: $0 [--yes] <backups/lunchkraam-....sql.gz|....sql>" >&2
  echo "  --yes  Geen bevestigingsvraag (alleen voor scripts/automation)." >&2
  exit 1
fi

if [[ ! -f "$DUMP" ]]; then
  echo "Bestand niet gevonden: $DUMP" >&2
  exit 1
fi

if [ -z "$(docker compose ps -q postgres 2>/dev/null)" ]; then
  echo "Geen draaiende postgres-container. Start met: docker compose up -d postgres" >&2
  exit 1
fi

# Geen .env sourcen: waarden met spaties/specials (bijv. IBAN) breken dan als shellcode.
POSTGRES_USER="$(docker compose exec -T postgres printenv POSTGRES_USER | tr -d '\r')"
POSTGRES_DB="$(docker compose exec -T postgres printenv POSTGRES_DB | tr -d '\r')"

if [[ -z "$POSTGRES_USER" || -z "$POSTGRES_DB" ]]; then
  echo "Kon POSTGRES_USER/POSTGRES_DB niet uit de postgres-container lezen." >&2
  exit 1
fi

if [[ "$YES" -ne 1 ]]; then
  echo "Dit wist alle data in database '${POSTGRES_DB}' en vervangt die door '${DUMP}'."
  read -r -p "Doorgaan? typ ja: " reply
  if [[ "$reply" != "ja" ]]; then
    echo "Afgebroken." >&2
    exit 1
  fi
fi

stopped_app=0
restart_app_if_stopped() {
  if [[ "$stopped_app" -eq 1 ]]; then
    echo "App-container weer starten…"
    docker compose start app || true
  fi
}
trap restart_app_if_stopped EXIT

if [ -n "$(docker compose ps -q --status running app 2>/dev/null)" ]; then
  echo "App-container tijdelijk stoppen (voorkomt verbindingen tijdens restore)…"
  docker compose stop app
  stopped_app=1
fi

echo "Verbreken van verbindingen en database opnieuw aanmaken…"
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 <<-EOSQL
	SELECT pg_terminate_backend(pid)
	FROM pg_stat_activity
	WHERE datname = '${POSTGRES_DB}' AND pid <> pg_backend_pid();
	DROP DATABASE IF EXISTS "${POSTGRES_DB}";
	CREATE DATABASE "${POSTGRES_DB}" OWNER "${POSTGRES_USER}";
EOSQL

echo "Dump terugzetten…"
if [[ "$DUMP" == *.gz ]]; then
  gunzip -c "$DUMP"
else
  cat "$DUMP"
fi | docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1

echo "Klaar. Database '${POSTGRES_DB}' is hersteld vanuit ${DUMP}."
