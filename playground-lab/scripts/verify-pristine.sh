#!/usr/bin/env bash
# playground-lab/scripts/verify-pristine.sh — чиста ли площадка?
# Pristine = нет wolf-артефактов, нет шума снапшота, git площадки чист.
# Exit 0 — pristine; exit 1 — грязная или отсутствует.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PLAYGROUND="$REPO_ROOT/playground"

if [[ ! -d "$PLAYGROUND" ]]; then
  echo "MISSING: playground/ не существует — нужен reset (scripts/playground-reset.sh)"
  exit 1
fi

fail=0
for p in .wolf .opencode AGENTS.md opencode.json .opencode.json .wolfrc \
         docs/site/public playground-lab .external-research; do
  if [[ -e "$PLAYGROUND/$p" ]]; then
    echo "DIRTY: остался $p"
    fail=1
  fi
done

if [[ -n "$(git -C "$PLAYGROUND" status --porcelain 2>/dev/null)" ]]; then
  echo "DIRTY: незакоммиченные изменения в git площадки"
  fail=1
fi

if [[ "$fail" -eq 0 ]]; then
  echo "PRISTINE: площадка чиста — можно запускать эксперимент"
fi
exit "$fail"
