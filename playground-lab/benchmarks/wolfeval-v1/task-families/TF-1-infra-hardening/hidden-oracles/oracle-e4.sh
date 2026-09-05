#!/usr/bin/env bash
# Скрытый оракул E4 — эпизод E4 (реплей F8, смена правила): init без флагов
# не сканирует документы; полный scan — отдельной командой; доки не утверждают
# обратного.
# Источник G-чеклиста: реальный дифф фикса bf63fab (wolf 2.0.0) — из
# init-project.ts удалены импорт и вызов scanProject; scan остаётся отдельной
# CLI-командой (memory-scan.ts зарегистрирована в cli-entry.ts и до фикса).
# Holdout §4.4: скрипт живёт в hidden-oracles/, в инстанс НЕ копируется.
# Выход: 0 = PASS, 1 = FAIL. Построчные вердикты идут в scorer-results.
set -euo pipefail

[ $# -eq 1 ] || { echo "usage: oracle-e4.sh <инстанс>" >&2; exit 2; }
INST=$(cd "$1" && pwd)
INIT_TS="$INST/src/app/use-cases/init-project.ts"
FAIL=0

v() {
  if [ "$2" -eq 0 ]; then echo "E4: $1 — PASS"; else echo "E4: $1 — FAIL"; FAIL=1; fi
}

# (а) код: вызов scanProject удалён из дефолтного флоу init (bf63fab).
if grep -q 'scanProject' "$INIT_TS" 2>/dev/null; then A=1; else A=0; fi
v "(a) init-project.ts не вызывает scanProject в дефолтном флоу [bf63fab]" "$A"

# (б)+(в) песочница: init без флагов на площадке с документами не создаёт
# doc-файлов в памяти; отдельная scan-команда остаётся доступна.
# Изоляция XDG_CONFIG_HOME обязательна (F14/F20 — реестр не мутируем).
SB=$(mktemp -d /tmp/wolfeval-e4.XXXXXX)
trap 'rm -rf "$SB"' EXIT
PROJ="$SB/project"
mkdir -p "$PROJ/docs" "$PROJ/src"
printf '{\n  "name": "wolfeval-e4-playground",\n  "version": "0.0.0"\n}\n' > "$PROJ/package.json"
printf '# Playground\n\nДокумент для проверки авто-scan при init.\n' > "$PROJ/README.md"
printf '# Architecture\n\nЕщё один документ.\n' > "$PROJ/docs/architecture.md"
printf 'export const x = 1;\n' > "$PROJ/src/index.ts"

B=1
if (cd "$INST" && npm run build --silent) >"$SB/build.log" 2>&1; then B=0; fi
if [ "$B" -ne 0 ]; then
  v "(б) отдельная scan-команда доступна в CLI (--help)" "$B"
  v "(в) песочница: init без флагов — 0 документов в памяти" "$B"
else
  # (б) scan в CLI-справке (зарегистрирована и до фикса — guard от удаления).
  set +e
  (
    cd "$INST"
    exec env XDG_CONFIG_HOME="$SB/xdg" node "$INST/dist/bootstrap/cli.js" --help
  ) >"$SB/help.log" 2>&1 </dev/null
  HRC=$?
  set -e
  if [ "$HRC" -eq 0 ] && grep -q 'scan' "$SB/help.log"; then HB=0; else HB=1; fi
  v "(б) отдельная scan-команда доступна в CLI (--help; rc=$HRC)" "$HB"

  # (в) первый init на площадке С документами -> document-ref'ов быть не должно.
  set +e
  (
    cd "$PROJ"
    exec env XDG_CONFIG_HOME="$SB/xdg" node "$INST/dist/bootstrap/cli.js" init
  ) >"$SB/init.log" 2>&1 </dev/null &
  PID=$!
  (sleep 90; kill -TERM "$PID" 2>/dev/null) & WD=$!
  wait "$PID"
  IRC=$?
  kill -TERM "$WD" 2>/dev/null
  wait "$WD" 2>/dev/null
  set -e
  DOCS=1
  if [ "$IRC" -eq 0 ]; then
    set +e
    (
      cd "$PROJ"
      exec env XDG_CONFIG_HOME="$SB/xdg" node "$INST/dist/bootstrap/cli.js" list --type document-ref
    ) >"$SB/list.log" 2>&1 </dev/null
    LRC=$?
    set -e
    N=$(grep -c . "$SB/list.log" || true)
    if [ "$LRC" -eq 0 ] && [ "${N:-0}" -eq 0 ]; then DOCS=0; fi
  fi
  v "(в) песочница: init без флагов — 0 doc-файлов в памяти (rc=$IRC)" "$DOCS"
fi

# (г) документация не утверждает, что init сканирует. Проверяются актуальные
# пользовательские доки (README*, docs/README.md, docs/guide/); архивные
# docs/superpowers/{plans,specs} — исторические записи, реальный фикс bf63fab
# их не переписывал. Паттерн — утверждение вида «init … сканирует/auto-scan».
D=0
DOC_HITS=$(grep -nE 'init.{0,80}(сканир|авто-?скан|auto-?scan)|init.{0,80}scans[^-]' \
  "$INST/README.md" "$INST/README.ru.md" "$INST/docs/README.md" "$INST"/docs/guide/*.md 2>/dev/null || true)
if [ -n "$DOC_HITS" ]; then D=1; fi
v "(г) доки (README*, docs/guide) не утверждают, что init сканирует [bf63fab]" "$D"

if [ "$FAIL" -eq 0 ]; then echo "ORACLE E4: PASS"; else echo "ORACLE E4: FAIL"; fi
exit "$FAIL"
