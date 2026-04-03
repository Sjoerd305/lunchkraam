#!/usr/bin/env bash
# Maakt een Postgres-dump (docker compose), uploadt naar rclone (bijv. Google Drive),
# en maakt/üploadt optioneel een receipts-archive met dezelfde timestamp.
# en houdt op de remote maximaal REMOTE_BACKUP_KEEP bestanden (standaard 30).
# De dump staat alleen tijdelijk op schijf (/tmp); na afloop wordt die verwijderd.
#
# Vereist: draaiende postgres-container, rclone, python3.
#
# Voorbeeld cron (één regel vervangt aparte backup + upload):
#   15 3 * * * /home/sjoerd/lunchkraam/scripts/upload-backups-to-drive.sh
#
# Configuratie in repo-root .env ($ROOT/.env), o.a. RCLONE_DEST (verplicht).
# Waarden met spaties horen tussen enkele aanhalingstekens, bv.:
#   RCLONE_EXTRA_FLAGS='--transfers=1 --checkers=1 --stats=1s --log-level INFO'
# Retentie: REMOTE_BACKUP_KEEP of RCLONE_BACKUP_KEEP (default 30).
# Al geëxporteerde RCLONE_DEST vóór aanroep gaat vóór .env.
#
# Alleen een lokale dump (geen upload): scripts/backup-database.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Cron heeft vaak een minimale PATH; zet expliciet veelgebruikte paden.
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Vereiste command ontbreekt in PATH: $1 (PATH=$PATH)" >&2
    exit 1
  fi
}

require_cmd docker
require_cmd rclone
require_cmd python3
require_cmd gzip
require_cmd date
require_cmd mktemp

ENV_FILE="$ROOT/.env"
if [ -n "${RCLONE_DEST+x}" ]; then
  _rclone_from_env=1
  _rclone_override="$RCLONE_DEST"
else
  _rclone_from_env=0
fi
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ENV_FILE"
  set +a
fi
if [ "$_rclone_from_env" = 1 ]; then
  RCLONE_DEST="$_rclone_override"
fi
unset _rclone_from_env _rclone_override

REMOTE_BACKUP_KEEP="${REMOTE_BACKUP_KEEP:-${RCLONE_BACKUP_KEEP:-30}}"
RECEIPTS_DIR="${RECEIPTS_DIR:-data/receipts}"

if [[ -z "${RCLONE_DEST:-}" ]]; then
  echo "Zet RCLONE_DEST in ${ENV_FILE} of exporteer het vóór dit script." >&2
  exit 1
fi

if [ -z "$(docker compose ps -q postgres 2>/dev/null)" ]; then
  echo "Geen draaiende postgres-container. Start met: docker compose up -d postgres" >&2
  exit 1
fi

TMP_WORK="$(mktemp -d "${TMPDIR:-/tmp}/lunchkraam-backup.XXXXXX")"
trap 'rm -rf "${TMP_WORK}"' EXIT

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${TMP_WORK}/lunchkraam-${STAMP}.sql"
RECEIPTS_OUT="${TMP_WORK}/lunchkraam-${STAMP}-receipts.tar.gz"

docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" --no-owner --no-acl "$POSTGRES_DB"' >"$OUT"
gzip -f "$OUT"

DUMP_GZ="${OUT}.gz"
echo "Dump: ${DUMP_GZ} ($(du -h "$DUMP_GZ" | cut -f1))"

if [[ -d "$RECEIPTS_DIR" ]]; then
  tar -C "$RECEIPTS_DIR" -czf "$RECEIPTS_OUT" .
  echo "Receipts-archive (host): ${RECEIPTS_OUT} ($(du -h "$RECEIPTS_OUT" | cut -f1))"
elif [ -n "$(docker compose ps -q app 2>/dev/null)" ]; then
  RECEIPTS_DIR_IN_APP="$(docker compose exec -T app sh -lc 'printf "%s" "${RECEIPTS_DIR:-/app/data/receipts}"')"
  if docker compose exec -T app sh -lc "test -d \"$RECEIPTS_DIR_IN_APP\""; then
    docker compose exec -T app sh -lc "tar -C \"$RECEIPTS_DIR_IN_APP\" -czf - ." >"$RECEIPTS_OUT"
    echo "Receipts-archive (app): ${RECEIPTS_OUT} ($(du -h "$RECEIPTS_OUT" | cut -f1))"
  else
    echo "Bonfoto-map niet gevonden (host: ${RECEIPTS_DIR}, app: ${RECEIPTS_DIR_IN_APP}); receipts-archive overgeslagen."
  fi
else
  echo "Bonfoto-map niet gevonden (${RECEIPTS_DIR}) en app-container draait niet; receipts-archive overgeslagen."
fi

# shellcheck disable=SC2206
extra=( ${RCLONE_EXTRA_FLAGS:-} )

rclone copy "$TMP_WORK" "$RCLONE_DEST" \
  --include 'lunchkraam-*.sql.gz' \
  --include 'lunchkraam-*-receipts.tar.gz' \
  --include 'tostikaart-*.sql.gz' \
  --fast-list \
  "${extra[@]}"

REMOTE_RETENTION_KEEP="$REMOTE_BACKUP_KEEP" RCLONE_DEST="$RCLONE_DEST" python3 - <<'PY'
import json, os, subprocess

def remote_join(dest: str, rel: str) -> str:
    remote, _, base = dest.partition(":")
    if not remote:
        raise SystemExit("RCLONE_DEST mist remote (vóór ':')")
    base = base.strip("/")
    if base:
        return f"{remote}:{base}/{rel}"
    return f"{remote}:{rel}"

keep = int(os.environ["REMOTE_RETENTION_KEEP"])
dest = os.environ["RCLONE_DEST"]
if keep < 1:
    raise SystemExit("REMOTE_RETENTION_KEEP moet minstens 1 zijn")

raw = subprocess.check_output(["rclone", "lsjson", dest], text=True)
items = json.loads(raw or "[]")
items = [
    x
    for x in items
    if not x.get("IsDir")
    and (
        x["Name"].startswith("lunchkraam-")
        or x["Name"].startswith("tostikaart-")
    )
    and (
        x["Name"].endswith(".sql.gz")
        or x["Name"].endswith("-receipts.tar.gz")
    )
]
items.sort(key=lambda x: (x["ModTime"], x["Path"]))
while len(items) > keep:
    x = items.pop(0)
    target = remote_join(dest, x["Path"])
    subprocess.run(["rclone", "deletefile", target], check=True)
PY

echo "Klaar: upload naar ${RCLONE_DEST}, max. ${REMOTE_BACKUP_KEEP} dumps op de remote."
if [ -f "$RECEIPTS_OUT" ]; then
  echo "Bonfoto-archive geüpload met dezelfde retentie."
fi
