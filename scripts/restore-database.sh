#!/usr/bin/env bash
# Zet de Postgres-database terug vanuit een dump gemaakt met scripts/backup-database.sh.
# Zet daarnaast standaard ook bonfoto's terug vanuit de bijbehorende receipts-archive
# (of expliciet via --receipts).
# Vernietigt alle huidige data in POSTGRES_DB. Vereist: draaiende postgres-container.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

YES=0
SKIP_RECEIPTS=0
RECEIPTS_ARCHIVE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes)
      YES=1
      shift
      ;;
    --skip-receipts)
      SKIP_RECEIPTS=1
      shift
      ;;
    --receipts)
      if [[ -z "${2:-}" ]]; then
        echo "--receipts vereist een pad naar .tar.gz" >&2
        exit 1
      fi
      RECEIPTS_ARCHIVE="$2"
      shift 2
      ;;
    *)
      break
      ;;
  esac
done

DUMP="${1:-}"
if [[ -z "$DUMP" ]]; then
  echo "Gebruik: $0 [--yes] [--skip-receipts] [--receipts backups/lunchkraam-....-receipts.tar.gz] <backups/lunchkraam-....sql.gz|....sql>" >&2
  echo "  --yes            Geen bevestigingsvraag (alleen voor scripts/automation)." >&2
  echo "  --skip-receipts  Sla herstel van bonfoto's over." >&2
  echo "  --receipts       Gebruik expliciet receipts-archief i.p.v. auto-detect." >&2
  exit 1
fi

if [[ ! -f "$DUMP" ]]; then
  echo "Bestand niet gevonden: $DUMP" >&2
  exit 1
fi

if [[ "$SKIP_RECEIPTS" -ne 1 && -z "$RECEIPTS_ARCHIVE" ]]; then
  base="$(basename "$DUMP")"
  stamp="$base"
  stamp="${stamp#lunchkraam-}"
  stamp="${stamp%.sql.gz}"
  stamp="${stamp%.sql}"
  auto_receipts="$(dirname "$DUMP")/lunchkraam-${stamp}-receipts.tar.gz"
  if [[ -f "$auto_receipts" ]]; then
    RECEIPTS_ARCHIVE="$auto_receipts"
  fi
fi
if [[ "$SKIP_RECEIPTS" -ne 1 && -n "$RECEIPTS_ARCHIVE" && ! -f "$RECEIPTS_ARCHIVE" ]]; then
  echo "Receipts-archief niet gevonden: $RECEIPTS_ARCHIVE" >&2
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
  if [[ "$SKIP_RECEIPTS" -eq 1 ]]; then
    echo "Bonfoto's: overslaan (--skip-receipts)."
  elif [[ -n "$RECEIPTS_ARCHIVE" ]]; then
    echo "Bonfoto's: herstellen vanuit '${RECEIPTS_ARCHIVE}'."
  else
    echo "Bonfoto's: geen archive gevonden, overslaan."
  fi
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

if [[ "$SKIP_RECEIPTS" -ne 1 && -n "$RECEIPTS_ARCHIVE" ]]; then
  RECEIPTS_DIR="${RECEIPTS_DIR:-data/receipts}"
  # Prefer Docker app volume restore; fallback to host path for non-Docker usage.
  if docker compose config --services 2>/dev/null | awk '$0=="app"{found=1} END{exit(found?0:1)}'; then
    RECEIPTS_DIR_IN_APP="$(docker compose run --rm --no-deps --entrypoint sh app -lc 'printf "%s" "${RECEIPTS_DIR:-/app/data/receipts}"')"
    docker compose run --rm --no-deps --entrypoint sh app -lc \
      "mkdir -p \"$RECEIPTS_DIR_IN_APP\" && find \"$RECEIPTS_DIR_IN_APP\" -mindepth 1 -delete"
    cat "$RECEIPTS_ARCHIVE" | docker compose run --rm --no-deps --entrypoint sh app -lc \
      "tar -xzf - -C \"$RECEIPTS_DIR_IN_APP\""
    echo "Bonfoto's hersteld in app-volume (${RECEIPTS_DIR_IN_APP}) vanuit ${RECEIPTS_ARCHIVE}."
  else
    mkdir -p "$RECEIPTS_DIR"
    find "$RECEIPTS_DIR" -mindepth 1 -delete
    tar -xzf "$RECEIPTS_ARCHIVE" -C "$RECEIPTS_DIR"
    echo "Bonfoto's hersteld in ${RECEIPTS_DIR} vanuit ${RECEIPTS_ARCHIVE}."
  fi
fi

echo "Klaar. Database '${POSTGRES_DB}' is hersteld vanuit ${DUMP}."
