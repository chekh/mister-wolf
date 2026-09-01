#!/usr/bin/env bash
# scripts/playground-reset.sh — пересоздать playground/ из HEAD main (pristine).
#
# PRISTINE: только код снапшота, БЕЗ wolf-артефактов и БЕЗ wolf init —
# init остаётся первым экспериментом площадки (README-PLAYGROUND.md, сценарий 1).
# Шаги:
#   1. rm -rf playground/       — ЕДИНСТВЕННОЕ опасное действие, только этот путь
#   2. git init -b main + git archive main | tar -x (снапшот без истории/node_modules)
#   3. исключить wolf-артефакты снапшота: .opencode/ AGENTS.md opencode.json
#      + .opencode.json (MCP-конфиг mr-wolf) и .wolf/ (в main трекается SKILL.md)
#   4. начальный коммит своего репо площадки (README-PLAYGROUND.md переживает reset)
#
# Usage: scripts/playground-reset.sh [--force]

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLAYGROUND="$REPO_ROOT/playground"

# --- защита: rm только на <repo>/playground, больше ни на что ---
if [[ "$PLAYGROUND" != */playground || -z "$REPO_ROOT" ]]; then
  echo "ERROR: не смог вычислить путь playground ($PLAYGROUND) — отказ." >&2
  exit 1
fi

if [[ "${1:-}" != "--force" ]]; then
  echo "Пересоздам площадку (pristine, БЕЗ wolf init): $PLAYGROUND"
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

# pristine: выкинуть wolf-артефакты, пришедшие из снапшота main
rm -rf "$PLAYGROUND/.opencode" \
       "$PLAYGROUND/AGENTS.md" \
       "$PLAYGROUND/opencode.json" \
       "$PLAYGROUND/.opencode.json" \
       "$PLAYGROUND/.wolf"

[[ -n "$README_BAK" ]] && cp "$README_BAK" "$PLAYGROUND/README-PLAYGROUND.md"

# контроль pristine ДО коммита: волчьих следов быть не должно
for p in .opencode .wolf AGENTS.md opencode.json .opencode.json .wolfrc; do
  if [[ -e "$PLAYGROUND/$p" ]]; then
    echo "ERROR: pristine нарушен — остался $p" >&2
    exit 1
  fi
done

git -C "$PLAYGROUND" add -A
git -C "$PLAYGROUND" commit -q -m "init: чистый снапшот кода без wolf-артефактов"

echo "OK: площадка пересоздана (pristine) — $PLAYGROUND"
echo "Wolf НЕ устанавливался. Первый эксперимент: wolf init — см. README-PLAYGROUND.md, сценарий 1."
