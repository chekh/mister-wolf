#!/usr/bin/env bash
# Скрытый оракул E1 — эпизод E1 (реплей F4): первый `wolf init` в свежем проекте
# пишет платформенный конфиг opencode с первого раза.
# Источник G-чеклиста: реальный дифф фикса bf63fab (wolf 2.0.0) —
# из init-project.ts убрана skipped-ветка 'no platform detected'.
# Holdout §4.4: скрипт живёт в hidden-oracles/, в инстанс НЕ копируется.
# Выход: 0 = PASS, 1 = FAIL. Построчные вердикты идут в scorer-results.
set -euo pipefail

[ $# -eq 1 ] || { echo "usage: oracle-e1.sh <инстанс>" >&2; exit 2; }
INST=$(cd "$1" && pwd)
INIT_TS="$INST/src/app/use-cases/init-project.ts"
FAIL=0

v() { # v <текст> <0|1> — построчный вердикт
  if [ "$2" -eq 0 ]; then echo "E1: $1 — PASS"; else echo "E1: $1 — FAIL"; FAIL=1; fi
}

# (а) код: skipped-ветка дефекта отсутствует (RED-маркер F4 из bf63fab).
# Безусловность записи платформенного конфига проверяется поведенчески в (б):
# альтернативные фиксы (детект после рендера) тоже обязаны давать конфиг с
# первого прогона — это и есть суть эпизода.
if grep -qF 'no platform detected' "$INIT_TS" 2>/dev/null; then A=1; else A=0; fi
v "(a) init-project.ts не содержит skipped-ветку 'no platform detected' [bf63fab]" "$A"

# (б) tmp-песочница: первый init на чистой площадке пишет opencode.json.
# Изоляция XDG_CONFIG_HOME обязательна — реестр проектов не мутируем (F14/F20).
SB=$(mktemp -d /tmp/wolfeval-e1.XXXXXX)
trap 'rm -rf "$SB"' EXIT
PROJ="$SB/project"
mkdir -p "$PROJ"
printf '{\n  "name": "wolfeval-e1-playground",\n  "version": "0.0.0"\n}\n' > "$PROJ/package.json"
XDG_CONFIG_HOME="$SB/xdg"
export XDG_CONFIG_HOME

B=1
if (cd "$INST" && npm run build --silent) >"$SB/build.log" 2>&1; then B=0; fi
if [ "$B" -ne 0 ]; then
  v "(b) песочница: первый init пишет opencode.json (валидный JSON, mcp.wolf)" "$B"
else
  # watchdog 90s: неинтерактивный дефектный init не висит; фикс с TTY-промптом
  # при закрытом stdin не должен вешать оракул
  set +e
  (
    cd "$PROJ"
    exec env XDG_CONFIG_HOME="$SB/xdg" node "$INST/dist/bootstrap/cli.js" init
  ) >"$SB/init.log" 2>&1 </dev/null &
  PID=$!
  (sleep 90; kill -TERM "$PID" 2>/dev/null) & WD=$!
  wait "$PID"
  RC=$?
  kill -TERM "$WD" 2>/dev/null
  wait "$WD" 2>/dev/null
  set -e
  CFG=1
  CFGF=""
  for f in opencode.json opencode.jsonc; do
    if [ -f "$PROJ/$f" ]; then CFGF="$PROJ/$f"; break; fi
  done
  if [ -n "$CFGF" ] && node -e '
    const fs = require("fs");
    const cfg = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));
    if (!(cfg.mcp && cfg.mcp.wolf)) process.exit(1);
  ' "$CFGF" 2>/dev/null; then CFG=0; fi
  if [ "$RC" -ne 0 ]; then CFG=1; fi
  v "(b) песочница: первый init пишет opencode.json (валидный JSON, mcp.wolf; rc=$RC)" "$CFG"
fi

# (в) агентом добавлен регрессионный тест: новый/изменённый файл в tests/,
# упоминающий init и (config|opencode.json|platform). Учитываем и незакоммиченное
# (status), и закоммиченное агентом (diff от initial commit инстанса).
C=1
ROOT=$(git -C "$INST" rev-list --max-parents=0 HEAD 2>/dev/null || true)
CHANGED=$(git -C "$INST" status --porcelain 2>/dev/null | cut -c4- || true)
if [ -n "$ROOT" ]; then
  CHANGED="$CHANGED
$(git -C "$INST" diff --name-only "$ROOT" 2>/dev/null || true)"
fi
while IFS= read -r f; do
  case "$f" in
  tests/*.ts) ;;
  *) continue ;;
  esac
  [ -f "$INST/$f" ] || continue
  if grep -qiE 'init' "$INST/$f" && grep -qiE 'opencode\.json|platform|config' "$INST/$f"; then
    C=0
    break
  fi
done <<<"$CHANGED"
v "(в) регрессионный тест в tests/ (init + config/opencode.json/platform)" "$C"

if [ "$FAIL" -eq 0 ]; then echo "ORACLE E1: PASS"; else echo "ORACLE E1: FAIL"; fi
exit "$FAIL"
