#!/usr/bin/env bash
# Maakt een Postgres-dump (docker compose), uploadt naar rclone (bijv. Google Drive),
# en houdt op de remote maximaal REMOTE_BACKUP_KEEP bestanden (standaard 30).
# De dump staat alleen tijdelijk op schijf (/tmp); na afloop wordt die verwijderd.
#
# Vereist: draaiende postgres-container, rclone, python3.
#
# Voorbeeld cron (één regel vervangt aparte backup + upload):
#   15 3 * * * /home/sjoerd/lunchkraam/scripts/upload-backups-to-drive.sh
#
# Omgeving (optioneel):
#   RCLONE_DEST=maasgroep18:lunchkraam-backups
#   REMOTE_BACKUP_KEEP=30
#   RCLONE_EXTRA_FLAGS='--bwlimit 10M'
#
# Alleen een lokale dump (geen upload): scripts/backup-database.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RCLONE_DEST="${RCLONE_DEST:-maasgroep18:lunchkraam-backups}"
REMOTE_BACKUP_KEEP="${REMOTE_BACKUP_KEEP:-30}"

if [[ -z "$RCLONE_DEST" ]]; then
  echo "Zet RCLONE_DEST (bijv. maasgroep18:lunchkraam-backups)." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 ontbreekt (nodig voor retentie op de remote)." >&2
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

docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" --no-owner --no-acl "$POSTGRES_DB"' >"$OUT"
gzip -f "$OUT"

DUMP_GZ="${OUT}.gz"
echo "Dump: ${DUMP_GZ} ($(du -h "$DUMP_GZ" | cut -f1))"

# shellcheck disable=SC2206
extra=( ${RCLONE_EXTRA_FLAGS:-} )

rclone copy "$TMP_WORK" "$RCLONE_DEST" \
  --include 'lunchkraam-*.sql.gz' \
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
    and x["Name"].endswith(".sql.gz")
]
items.sort(key=lambda x: (x["ModTime"], x["Path"]))
while len(items) > keep:
    x = items.pop(0)
    target = remote_join(dest, x["Path"])
    subprocess.run(["rclone", "deletefile", target], check=True)
PY

echo "Klaar: upload naar ${RCLONE_DEST}, max. ${REMOTE_BACKUP_KEEP} dumps op de remote."
