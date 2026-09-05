#!/usr/bin/env bash
# Скрытый оракул E5 — эпизод E5 (реплей F13): guard удалённого cwd в CLI —
# ENOENT uv_cwd переводится в однострочную UserFacingError вместо сырого стека.
# Источник G-чеклиста: реальный дифф фикса 3bdc117 (wolf 2.0.1) —
# safeCwd() в cli-entry.ts (обёртка process.cwd() в runCli) + unit-тест обеих
# веток tests/unit/adapters/cli-entry.test.ts.
# Holdout §4.4: скрипт живёт в hidden-oracles/, в инстанс НЕ копируется.
# Выход: 0 = PASS, 1 = FAIL. Построчные вердикты идут в scorer-results.
set -euo pipefail

[ $# -eq 1 ] || { echo "usage: oracle-e5.sh <инстанс>" >&2; exit 2; }
INST=$(cd "$1" && pwd)
ENTRY="$INST/src/adapters/cli/cli-entry.ts"
TEST="$INST/tests/unit/adapters/cli-entry.test.ts"
FAIL=0

v() {
  if [ "$2" -eq 0 ]; then echo "E5: $1 — PASS"; else echo "E5: $1 — FAIL"; FAIL=1; fi
}

# (а) код: safeCwd-guard на входе CLI (3bdc117).
if grep -q 'safeCwd' "$ENTRY" 2>/dev/null; then A=0; else A=1; fi
v "(a) cli-entry.ts содержит safeCwd-guard [3bdc117]" "$A"

# (б) unit-тест обеих веток — файл из диффа 3bdc117: нормальный cwd + ENOENT.
B=1
if [ -f "$TEST" ] && grep -q 'safeCwd' "$TEST" 2>/dev/null && grep -qE 'ENOENT|uv_cwd' "$TEST" 2>/dev/null; then
  B=0
fi
v "(б) unit-тест обеих веток safeCwd (tests/unit/adapters/cli-entry.test.ts) [3bdc117]" "$B"

if [ "$FAIL" -eq 0 ]; then echo "ORACLE E5: PASS"; else echo "ORACLE E5: FAIL"; fi
exit "$FAIL"
