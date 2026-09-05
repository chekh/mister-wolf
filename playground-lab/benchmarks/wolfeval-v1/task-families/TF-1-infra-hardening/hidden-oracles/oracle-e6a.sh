#!/usr/bin/env bash
# Скрытый оракул E6a — эпизод E6a (реплей F14): изоляция bench-харнесса от
# глобального состояния машины + очистка tmp.
# Источник G-чеклиста: реальный дифф фикса 1dd71e6 (wolf 2.0.1) — в
# scripts/bench/lib.sh: export XDG_CONFIG_HOME в mktemp + bench_tmp/bench_cleanup
# + trap bench_cleanup EXIT. Запуск самого bench НЕ нужен (дорого) — проверка
# кодовая: изоляция в либе, которую source'ат все bench-скрипты.
# Holdout §4.4: скрипт живёт в hidden-oracles/, в инстанс НЕ копируется.
# Выход: 0 = PASS, 1 = FAIL. Построчные вердикты идут в scorer-results.
set -euo pipefail

[ $# -eq 1 ] || { echo "usage: oracle-e6a.sh <инстанс>" >&2; exit 2; }
INST=$(cd "$1" && pwd)
LIB="$INST/scripts/bench/lib.sh"
FAIL=0

v() {
  if [ "$2" -eq 0 ]; then echo "E6a: $1 — PASS"; else echo "E6a: $1 — FAIL"; FAIL=1; fi
}

if [ ! -f "$LIB" ]; then
  echo "E6a: scripts/bench/lib.sh отсутствует в инстансе — FAIL"
  echo "ORACLE E6a: FAIL"
  exit 1
fi

# (а) XDG-изоляция: конфиг wolf в tmp (1dd71e6).
if grep -q 'XDG_CONFIG_HOME' "$LIB" 2>/dev/null; then A=0; else A=1; fi
v "(a) lib.sh изолирует XDG_CONFIG_HOME [1dd71e6]" "$A"

# (б) регистрация tmp-каталогов + trap-очистка на EXIT (1dd71e6).
B=1
if grep -qE 'bench_tmp|bench_cleanup' "$LIB" 2>/dev/null && grep -qE 'trap.*EXIT' "$LIB" 2>/dev/null; then
  B=0
fi
v "(б) lib.sh: bench_tmp/bench_cleanup + trap … EXIT [1dd71e6]" "$B"

if [ "$FAIL" -eq 0 ]; then echo "ORACLE E6a: PASS"; else echo "ORACLE E6a: FAIL"; fi
exit "$FAIL"
