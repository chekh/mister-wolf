#!/usr/bin/env bash
# Скрытый оракул E3 — эпизод E3 (реплей F5+F6): честный лог init —
# имена скиллов в выводе, платформенные строки без misleading-содержимого.
# Источник G-чеклиста: реальный дифф фикса 190ff6a (wolf 2.1.0) —
# formatBaseSetLine (`[skill] имя → путь`) + formatPlatformLine (configFile+keys)
# + renderNextSteps (совет перезапуска только при mcpWritten).
# Holdout §4.4: скрипт живёт в hidden-oracles/, в инстанс НЕ копируется.
# Выход: 0 = PASS, 1 = FAIL. Построчные вердикты идут в scorer-results.
#
# Примечание: литерал 'platform configs' НЕ является RED-маркером — по диффу
# 190ff6a он остаётся в formatPlatformLine для веток none/npx; убранная
# misleading-строка — безусловный 'Restart your agent platform'.
set -euo pipefail

[ $# -eq 1 ] || { echo "usage: oracle-e3.sh <инстанс>" >&2; exit 2; }
INST=$(cd "$1" && pwd)
MEMINIT="$INST/src/adapters/cli/commands/memory-init.ts"
FAIL=0

v() {
  if [ "$2" -eq 0 ]; then echo "E3: $1 — PASS"; else echo "E3: $1 — FAIL"; FAIL=1; fi
}

# (а) форматтеры фикса F5/F6 определены (190ff6a).
if grep -q 'formatBaseSetLine' "$MEMINIT" 2>/dev/null && grep -q 'formatPlatformLine' "$MEMINIT" 2>/dev/null; then
  A=0
else
  A=1
fi
v "(a) memory-init.ts содержит formatBaseSetLine + formatPlatformLine [190ff6a]" "$A"

# (б) признак имён скиллов/путей: шаблон строки лога '[skill] имя → путь'.
if grep -qF '[skill]' "$MEMINIT" 2>/dev/null; then B=0; else B=1; fi
v "(б) имена скиллов в логе init — шаблон '[skill] … → …' [190ff6a]" "$B"

# (в) misleading-строки дефекта отсутствуют: безусловный совет перезапуска
# (в фиксе заменён на условный renderNextSteps по mcpWritten).
if grep -qF 'Restart your agent platform' "$MEMINIT" 2>/dev/null; then C=1; else C=0; fi
v "(в) безусловный 'Restart your agent platform' отсутствует [190ff6a]" "$C"

if [ "$FAIL" -eq 0 ]; then echo "ORACLE E3: PASS"; else echo "ORACLE E3: FAIL"; fi
exit "$FAIL"
