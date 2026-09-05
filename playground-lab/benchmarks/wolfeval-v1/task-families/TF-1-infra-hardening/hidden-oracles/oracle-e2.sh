#!/usr/bin/env bash
# Скрытый оракул E2 — эпизод E2 (реплей F15): writeConfig opencode-адаптера
# мерджит subagent_depth (=2) в генерируемый конфиг платформы.
# Источник G-чеклиста: реальный дифф фикса 8a077f7 (wolf 2.0.1) —
# const SUBAGENT_DEPTH = 2 + ветка «sd === undefined -> cfg.subagent_depth».
# Holdout §4.4: скрипт живёт в hidden-oracles/, в инстанс НЕ копируется.
# Выход: 0 = PASS, 1 = FAIL. Построчные вердикты идут в scorer-results.
set -euo pipefail

[ $# -eq 1 ] || { echo "usage: oracle-e2.sh <инстанс>" >&2; exit 2; }
INST=$(cd "$1" && pwd)
ADAPTER="$INST/src/adapters/platforms/opencode-adapter.ts"
FAIL=0

v() {
  if [ "$2" -eq 0 ]; then echo "E2: $1 — PASS"; else echo "E2: $1 — FAIL"; FAIL=1; fi
}

# (а) код: адаптер мерджит глубину субагентов (признак 8a077f7).
if grep -qE 'SUBAGENT_DEPTH|subagent_depth' "$ADAPTER" 2>/dev/null; then A=0; else A=1; fi
v "(a) opencode-adapter.ts содержит subagent_depth (мердж 2) [8a077f7]" "$A"

# (б) регрессионный тест: в реальном фиксе — tests/unit/adapters/platforms/
# opencode-adapter.test.ts + строка expect(cfg.subagent_depth).toBe(2) в
# tests/e2e/init-cli.e2e.ts; проверяем минимум — упоминание в tests/.
if grep -rl --include='*.ts' 'subagent_depth' "$INST/tests" 2>/dev/null | grep -q .; then B=0; else B=1; fi
v "(б) регрессионный тест на subagent_depth в tests/ [8a077f7]" "$B"

if [ "$FAIL" -eq 0 ]; then echo "ORACLE E2: PASS"; else echo "ORACLE E2: FAIL"; fi
exit "$FAIL"
