#!/usr/bin/env bash
# Verwijdert Cursor-attributieregel(s) uit commit-berichten in de hele git-historie.
# Standaard: alleen tonen welke commits geraakt worden (dry-run).
# Uitvoeren: ./scripts/strip-cursor-commit-footers.sh --apply
# Zonder bevestigingsvraag (alleen als je zeker bent): STRIP_CURSOR_APPLY_YES=1 ./scripts/strip-cursor-commit-footers.sh --apply
#
# Vereist schone working tree. Daarna: force-push naar remote(s) indien van toepassing,
# en eventueel bij anderen: git fetch --all && git reset --hard origin/main
#
# Opruimen oude backup-refs na tevredenheid:
#   git for-each-ref --format='%(refname)' refs/original/ | xargs -r -n1 git update-ref -d
#   git reflog expire --expire=now --all && git gc --prune=now
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FILTER_PY="$ROOT/tmp/strip_cursor_commit_msg_filter.py"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Geen git-repository (geen .git)." >&2
  exit 1
fi

if [ ! -f "$FILTER_PY" ]; then
  echo "Filter ontbreekt: $FILTER_PY" >&2
  exit 1
fi

list_matching_commits() {
  local commit
  while IFS= read -r commit; do
    [ -z "$commit" ] && continue
    local body stripped
    body="$(git log -1 --format=%B "$commit" 2>/dev/null || true)"
    stripped="$(printf '%s' "$body" | python3 "$FILTER_PY")"
    if [ "$body" != "$stripped" ]; then
      echo "$commit $(git log -1 --format=%s "$commit")"
    fi
  done < <(git rev-list --all)
}

apply_filter_branch() {
  git filter-branch -f --msg-filter "python3 \"$FILTER_PY\"" -- --all
}

case "${1:-}" in
  "")
    echo "Commits waarvan het bericht wordt aangepast (dry-run):"
    n=0
    while IFS= read -r line; do
      echo "  $line"
      n=$((n + 1))
    done < <(list_matching_commits)
    if [ "$n" -eq 0 ]; then
      echo "  (geen)"
    fi
    echo
    echo "Historie herschrijven: $0 --apply"
    echo "Let op: schone working tree; daarna force-push als je al gepusht had."
    ;;
  --apply)
    if [ -n "$(git status --porcelain)" ]; then
      echo "Working tree is niet schoon. Commit of stash eerst je wijzigingen." >&2
      exit 1
    fi
    echo "Commits die worden aangepast:"
    list_matching_commits | sed 's/^/  /' || true
    echo
    if [ "${STRIP_CURSOR_APPLY_YES:-}" = 1 ]; then
      ok=y
    else
      read -r -p "Doorgaan met git filter-branch op alle refs? [j/N] " ok
    fi
    case "$ok" in
      j|J|ja|Ja|y|Y|yes|Yes) ;;
      *) echo "Afgebroken." >&2; exit 1 ;;
    esac
    apply_filter_branch
    echo
    echo "Klaar. Verwijder oude backup-refs als je tevreden bent, zie commentaar bovenaan dit script."
    ;;
  -h|--help)
    echo "Gebruik: $0           dry-run: lijst commits"
    echo "        $0 --apply    herschrijf alle commit-berichten (alle refs)"
    ;;
  *)
    echo "Onbekende optie: $1 (probeer --help)" >&2
    exit 1
    ;;
esac
