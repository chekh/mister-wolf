#!/usr/bin/env bash
# verify-fixtures.sh — F24-класс pre-run контроль живости фикстуры TF-1
# (wolf-pre-2.0.0). Спека §11.3: сломанная/зафикшенная фикстура не допускается
# к прогону. Детерминированные grep-проверки кода, БЕЗ LLM и БЕЗ запусков CLI
# (verify не мутирует инстанс). Признаки — из диффов реальных фиксов
# 2.0.0–2.1.0 (таблица в wolf-pre-2.0.0.md).
#
# Usage: verify-fixtures.sh <инстанс>
#
# Семантика: RED = дефект жив (фикстура исправна); GREEN = дефект закрыт
# (фикстура сломана/чинилась). Exit 0 = все 6 пунктов RED (можно гнать
# кампанию). Exit 1 = хоть один GREEN (СТОП, диагностика F24). Exit 2 =
# структура инстанса не соответствует срезу (нет ожидаемых файлов).

set -euo pipefail

INST="${1:-}"
[[ -n "$INST" && -d "$INST" ]] || { echo "ERROR: укажите каталог инстанса (usage: verify-fixtures.sh <инстанс>)" >&2; exit 2; }

# структура среза: файлы, в которых живут признаки
STRUCT_FILES=(
  src/app/use-cases/init-project.ts
  src/adapters/platforms/opencode-adapter.ts
  src/adapters/cli/commands/memory-init.ts
  src/adapters/cli/cli-entry.ts
  scripts/bench/lib.sh
)
for f in "${STRUCT_FILES[@]}"; do
  [[ -f "$INST/$f" ]] || { echo "STRUCT: отсутствует $f — инстанс не срез wolf-pre-2.0.0" >&2; exit 2; }
done
[[ -f "$INST/.git/HEAD" ]] || { echo "STRUCT: нет .git — не инстанс (обезглавленное репо ожидается)" >&2; exit 2; }

# check <marker> <файл>: 0 — маркер есть, 1 — нет
has() { grep -qF -- "$1" "$INST/$2"; }

# report <F-id> <red?> <примечание>
RED_COUNT=0
GREEN_IDS=()
report() {
  if [[ "$2" == "yes" ]]; then
    echo "$1: RED — $3"
    RED_COUNT=$((RED_COUNT + 1))
  else
    echo "$1: GREEN — $3"
    GREEN_IDS+=("$1")
  fi
}

# --- F4: init-детекция платформ до рендера → первый init не пишет opencode.json.
# RED (дефект): skipped-ветка 'no platform detected' жива. Фикс bf63fab (2.0.0):
# конфиг пишется безусловно по факту рендера — строки больше нет.
if has "no platform detected" src/app/use-cases/init-project.ts; then
  report F4 yes "init-project.ts: skipped-ветка 'no platform detected' (детекция до рендера; первый init без платформенного конфига) [fix: bf63fab]"
else
  report F4 no "init-project.ts: безусловная запись платформенного конфига (фикс применён)"
fi

# --- F8: init делает полный scan документов.
# RED: вызов scanProject из init жив. Фикс bf63fab (2.0.0): init без скана.
if has "scanProject" src/app/use-cases/init-project.ts; then
  report F8 yes "init-project.ts: init вызывает scanProject (авто-scan при init) [fix: bf63fab]"
else
  report F8 no "init-project.ts: init без скана (фикс применён)"
fi

# --- F15: subagent_depth не мерджится в opencode.json.
# RED: ключа нет в адаптере. Фикс 8a077f7 (2.0.1): SUBAGENT_DEPTH=2 в writeConfig.
if has "subagent_depth" src/adapters/platforms/opencode-adapter.ts; then
  report F15 no "opencode-adapter.ts: subagent_depth мерджится (фикс применён)"
else
  report F15 yes "opencode-adapter.ts: subagent_depth отсутствует в рендере конфига [fix: 8a077f7]"
fi

# --- F5+F6: лог init без имён скиллов + misleading-сообщения платформ.
# RED: форматтеры фикса отсутствуют. Фикс 190ff6a (2.1.0): formatBaseSetLine
# ('[skill] имя → путь') + formatPlatformLine (configFile + keys).
if has "formatBaseSetLine" src/adapters/cli/commands/memory-init.ts; then
  report F5+F6 no "memory-init.ts: formatBaseSetLine/formatPlatformLine есть — лог init честный (фикс применён)"
else
  report F5+F6 yes "memory-init.ts: форматтеры лога init отсутствуют (без имён скиллов, misleading-строки) [fix: 190ff6a]"
fi

# --- F13: CLI из удалённого cwd — сырой стек ENOENT uv_cwd.
# RED: guard отсутствует. Фикс 3bdc117 (2.0.1): safeCwd() в cli-entry.
if has "safeCwd" src/adapters/cli/cli-entry.ts; then
  report F13 no "cli-entry.ts: safeCwd guard есть (фикс применён)"
else
  report F13 yes "cli-entry.ts: safeCwd отсутствует — сырой ENOENT uv_cwd из удалённого cwd [fix: 3bdc117]"
fi

# --- F14+F16: bench/vitest-сетапы без WOLF_HOME/XDG-изоляции (следы в глобальном реестре).
# RED: оба живы — lib.sh без XDG И (tests/setup.ts нет ИЛИ без XDG).
# Фиксы: 1dd71e6 (2.0.1, bench) + 190ff6a (2.1.0, vitest setup).
BENCH_OK=0; VITEST_OK=0
has "XDG_CONFIG_HOME" scripts/bench/lib.sh && BENCH_OK=1
if [[ -f "$INST/tests/setup.ts" ]] && has "XDG_CONFIG_HOME" tests/setup.ts; then VITEST_OK=1; fi
if [[ $BENCH_OK -eq 0 && $VITEST_OK -eq 0 ]]; then
  report F14+F16 yes "lib.sh без XDG-изоляции; tests/setup.ts с XDG отсутствует — следы в глобальном реестре за прогон [fix: 1dd71e6 + 190ff6a]"
else
  report F14+F16 no "изоляция применена (bench=${BENCH_OK}, vitest=${VITEST_OK})"
fi

echo "---"
if [[ ${#GREEN_IDS[@]} -eq 0 ]]; then
  echo "FIXTURE ALIVE: 6/6 RED — все дефекты воспроизводятся, фикстура годна (F24-контроль пройден)"
  exit 0
else
  echo "FIXTURE BROKEN: GREEN-пункты: ${GREEN_IDS[*]} — дефект(ы) закрыты или фикстура мутировала; прогон запрещён (F24)"
  exit 1
fi
