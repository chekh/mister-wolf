#!/usr/bin/env bash
# Скрытый оракул E6b — эпизод E6b (реплей F16): XDG-изоляция vitest-сетапа —
# npm run check не оставляет мёртвых записей в глобальном реестре wolf.
# Источник G-чеклиста: реальный дифф фикса 190ff6a (wolf 2.1.0) —
# tests/setup.ts (XDG_CONFIG_HOME в mkdtempSync ДО импортов тестируемого кода)
# + setupFiles в vitest.config.ts (и в tests/e2e/vitest.config.ts).
#
# Симметрия решения с E6a (переисользование паттерна «изоляция окружения»)
# здесь НЕ проверяется — её считает secondary-скорер (§6.2, symmetry E6a/E6b).
#
# Holdout §4.4: скрипт живёт в hidden-oracles/, в инстанс НЕ копируется.
# Выход: 0 = PASS, 1 = FAIL. Построчные вердикты идут в scorer-results.
set -euo pipefail

[ $# -eq 1 ] || { echo "usage: oracle-e6b.sh <инстанс>" >&2; exit 2; }
INST=$(cd "$1" && pwd)
SETUP="$INST/tests/setup.ts"
VCFG="$INST/vitest.config.ts"
FAIL=0

v() {
  if [ "$2" -eq 0 ]; then echo "E6b: $1 — PASS"; else echo "E6b: $1 — FAIL"; FAIL=1; fi
}

# (а) tests-сетап с XDG-изоляцией (190ff6a): файл существует и выставляет
# XDG_CONFIG_HOME в tmp до импортов тестируемого кода.
A=1
if [ -f "$SETUP" ] && grep -q 'XDG_CONFIG_HOME' "$SETUP" 2>/dev/null; then A=0; fi
v "(a) tests/setup.ts с XDG_CONFIG_HOME-изоляцией [190ff6a]" "$A"

# (б) корневой vitest.config.ts подключает сетап (без wiring изоляция не
# работает); e2e-конфиг — та же изоляция в реальном фиксе, здесь вторым
# пунктом (покрытие e2e-прогонов).
B=1
if [ -f "$VCFG" ] && grep -q 'setupFiles' "$VCFG" 2>/dev/null && grep -q 'tests/setup' "$VCFG" 2>/dev/null; then
  B=0
fi
v "(б) vitest.config.ts подключает tests/setup.ts (setupFiles) [190ff6a]" "$B"

C=1
if [ -f "$INST/tests/e2e/vitest.config.ts" ] && grep -q 'setupFiles' "$INST/tests/e2e/vitest.config.ts" 2>/dev/null; then
  C=0
fi
v "(в) tests/e2e/vitest.config.ts тоже изолирован (setupFiles) [190ff6a]" "$C"

if [ "$FAIL" -eq 0 ]; then echo "ORACLE E6b: PASS"; else echo "ORACLE E6b: FAIL"; fi
exit "$FAIL"
