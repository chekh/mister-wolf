#!/usr/bin/env bash
# scripts/playground-reset.sh — пересоздать playground/ из HEAD main.
#
# Шаги (эквивалент ручной процедуры из README-PLAYGROUND.md):
#   1. rm -rf playground/          — ЕДИНСТВЕННОЕ опасное действие, только этот путь
#   2. git init -b main + git archive main | tar -x (снапшот без истории/node_modules)
#   3. начальный коммит своего репо площадки
#   4. wolf init из ЛОКАЛЬНОГО билда (dist/ main-репо, не npm)
#
# Требует свежий dist: npm run build в корне main-репо.
# Usage: scripts/playground-reset.sh [--force]

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLAYGROUND="$REPO_ROOT/playground"
WOLF_CLI="$REPO_ROOT/dist/bootstrap/cli.js"

# --- защита: rm только на <repo>/playground, больше ни на что ---
if [[ "$PLAYGROUND" != */playground || -z "$REPO_ROOT" ]]; then
  echo "ERROR: не смог вычислить путь playground ($PLAYGROUND) — отказ." >&2
  exit 1
fi

if [[ ! -f "$WOLF_CLI" ]]; then
  echo "ERROR: нет $WOLF_CLI — сначала npm run build в корне main-репо." >&2
  exit 1
fi

if [[ "${1:-}" != "--force" ]]; then
  echo "Пересоздам площадку: $PLAYGROUND"
  echo "Память площадки (.wolf/, жалобы, playbook-мутации) будет УДАЛЕНА."
  read -r -p "Продолжить? [y/N] " answer
  case "$answer" in
    y|Y) ;;
    *) echo "Отменено."; exit 1 ;;
  esac
fi

# сохранить README площадки через пересоздание (не входит в archive main)
README_BAK=""
if [[ -f "$PLAYGROUND/README-PLAYGROUND.md" ]]; then
  README_BAK="$(mktemp -d)/README-PLAYGROUND.md"
  cp "$PLAYGROUND/README-PLAYGROUND.md" "$README_BAK"
fi

rm -rf "$PLAYGROUND"

mkdir -p "$PLAYGROUND"
git init -b main --quiet "$PLAYGROUND"
git -C "$REPO_ROOT" archive main | tar -x -C "$PLAYGROUND"
[[ -n "$README_BAK" ]] && cp "$README_BAK" "$PLAYGROUND/README-PLAYGROUND.md"
git -C "$PLAYGROUND" add -A
git -C "$PLAYGROUND" commit -q -m "init: снапшот mister-wolf@main — площадка для сценариев Wolf"

# wolf init из локального билда, cwd = playground
(cd "$PLAYGROUND" && node "$WOLF_CLI" init)

# закоммитить артефакты init'а в репо площадки (чистый статус)
if [[ -n "$(git -C "$PLAYGROUND" status --short)" ]]; then
  git -C "$PLAYGROUND" add -A
  git -C "$PLAYGROUND" commit -q -m "init: wolf init из локального билда (base set + память)"
fi

echo "OK: площадка пересоздана — $PLAYGROUND"
echo "Инвентарь: ls $PLAYGROUND/.opencode/agent | wc -l (агенты),"
echo "           find $PLAYGROUND/.wolf/memory/shared/playbooks -type f | wc -l (playbook'и)"
