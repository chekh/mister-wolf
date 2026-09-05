#!/usr/bin/env bash
# build-instance.sh — сборка инстанса WolfEval TF-1 (fixture wolf-pre-2.0.0).
#
# Срез репо mister-wolf на коммите 9637506 (до вливания фиксов F4/F8 — bf63fab),
# фильтр волчьих артефактов по конвенции scripts/playground-reset.sh,
# обезглавленная git-история (один initial commit), npm ci, gate verify-fixtures.
# Рецепт и обоснование среза: wolf-pre-2.0.0.md рядом со скриптом.
#
# Usage:
#   build-instance.sh <target-dir> --arm BASE|WOLF [--wolf-tag v2.5.0] [--repo <path>]
#
# --repo — чекаут mister-wolf с тегами v2.x (репо-источник среза);
#          по умолчанию вычисляется от расположения этого скрипта:
#          6 уровней вверх (fixtures → playground-lab).
# --arm WOLF — та же сборка + инструкция `wolf init` пинованного тега;
#          живой init при сборке НЕ исполняется (Фаза B/WB1; пин бинаря —
#          F12-контроль, см. wolf-pre-2.0.0.md).
#
# Gate: verify-fixtures.sh <target> — все 6 дефектов обязаны быть RED,
# иначе сборка падает (F24-класс: сломанная фикстура не выпускается).

set -euo pipefail

SOURCE_COMMIT="963750676909622d3d38b23b05d737be6ce80fef" # wolf-pre-2.0.0 (bf63fab~1)
INIT_MSG="init: срез wolf-pre-2.0.0 без истории"
# фильтр волчьих артефактов — конвенция scripts/playground-reset.sh
PRUNE_PATHS=(.opencode AGENTS.md opencode.json .opencode.json .wolf docs/site/public playground-lab .external-research)

TARGET=""
ARM=""
WOLF_TAG="v2.5.0"
REPO=""

die() { echo "ERROR: $*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --arm) ARM="${2:?--arm требует значение (BASE|WOLF)}"; shift 2 ;;
    --arm=*) ARM="${1#--arm=}" ;;
    --wolf-tag) WOLF_TAG="${2:?--wolf-tag требует значение}"; shift 2 ;;
    --wolf-tag=*) WOLF_TAG="${1#--wolf-tag=}" ;;
    --repo) REPO="${2:?--repo требует значение}"; shift 2 ;;
    --repo=*) REPO="${1#--repo=}" ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) [[ -z "$TARGET" && "$1" != -* ]] && TARGET="$1" || die "неизвестный аргумент: $1 (usage: build-instance.sh <target-dir> --arm BASE|WOLF)"; shift ;;
  esac
done

[[ -n "$TARGET" ]] || die "usage: build-instance.sh <target-dir> --arm BASE|WOLF [--wolf-tag vX.Y.Z] [--repo <path>]"
[[ "$ARM" == "BASE" || "$ARM" == "WOLF" ]] || die "--arm обязан быть BASE или WOLF (получено: '${ARM:-пусто}')"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# fixtures/ →(1) TF-1-infra-hardening →(2) task-families →(3) wolfeval-v1 →(4) benchmarks →(5) playground-lab →(6) корень репо
REPO="${REPO:-$(cd "$SCRIPT_DIR/../../../../../../" && pwd)}"

# репо-источник обязан быть именно mister-wolf (не просто «внутри какого-то git-репо»:
# каталог .worktrees лежит в родительском репо и проходит наивную проверку is-inside-work-tree)
[[ -f "$REPO/package.json" && "$(grep -m1 '"name"' "$REPO/package.json")" == *'"mister-wolf"'* ]] \
  || die "репо-источник не mister-wolf: $REPO (укажите --repo <path>)"
git -C "$REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "репо-источник не найден: $REPO"
git -C "$REPO" cat-file -e "${SOURCE_COMMIT}^{commit}" 2>/dev/null || die "коммит среза ${SOURCE_COMMIT} отсутствует в $REPO (нужен чекаут с историей main)"

# target: не внутри репо-источника, не системный каталог; если существует — только пустой
case "$(cd "$TARGET" 2>/dev/null && pwd)" in
  "$REPO"|"$REPO"/*) die "target внутри репо-источника — инстанс-расходник живёт вне git (tmp)" ;;
esac
if [[ -e "$TARGET" && -n "$(ls -A "$TARGET" 2>/dev/null)" ]]; then
  die "target существует и не пуст: $TARGET (очистите или выберите новый путь)"
fi

echo "==> срез wolf-pre-2.0.0 (${SOURCE_COMMIT:0:7}) → $TARGET"
mkdir -p "$TARGET"
git -C "$REPO" archive "$SOURCE_COMMIT" | tar -x -C "$TARGET"
# контроль распаковки: pipeline может «преуспеть» вхолостую — срез обязан дать package.json
[[ -f "$TARGET/package.json" ]] || die "срез не распаковался (нет package.json в $TARGET) — проверьте --repo $REPO"

echo "==> фильтр волчьих артефактов (конвенция playground-reset): ${PRUNE_PATHS[*]}"
rm -rf "${PRUNE_PATHS[@]/#/$TARGET/}"

# контроль pristine ДО коммита
for p in "${PRUNE_PATHS[@]}"; do
  [[ -e "$TARGET/$p" ]] && die "pristine нарушен — остался $p"
done

echo "==> обезглавливание истории"
rm -rf "$TARGET/.git"
git -C "$TARGET" init -q -b main
git -C "$TARGET" add -A
git -C "$TARGET" -c user.name=wolfeval -c user.email=wolfeval@fixture.local commit -q -m "$INIT_MSG"

echo "==> npm ci (может занять минуты)"
(cd "$TARGET" && npm ci --no-audit --no-fund)

if [[ "$ARM" == "WOLF" ]]; then
  cat <<EOF
==> WOLF-ветка: живой wolf init при сборке НЕ исполняется (Фаза B).
    Перед WB1: F12-контроль (readlink -f "\$(which wolf)" = environment-lock),
    затем в инстансе: wolf init  # пинованный релиз $WOLF_TAG
EOF
fi

echo "==> gate: verify-fixtures (все 6 дефектов обязаны быть RED)"
bash "$SCRIPT_DIR/verify-fixtures.sh" "$TARGET"

echo "OK: инстанс собран ($ARM) — $TARGET"
