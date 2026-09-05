#!/usr/bin/env bash
# Сквозной аудит кампании WEV-001 (WolfEval v1, TF-1) — спека §4.2 (финальный
# аудит), §6.3 (иерархия оценки конечным состоянием).
#
# usage: campaign-audit.sh <инстанс> [--arm BASE|WOLF] [--skip-protected]
#
# PASS ⟺ все 7 эпизодных оракулов PASS + границы diff соблюдены + protected
# suite зелёный (+ для --arm WOLF: инварианты памяти по правилу E4).
# Выход: 0 = PASS, 1 = FAIL. Оракулы живут здесь (holdout §4.4), в инстанс
# не копируются. Никаких LLM и сетевых обращений; мутации инстанса — только
# штатный npm run build/check его же тестов (dist/ — gitignored артефакт).
set -euo pipefail

usage() {
  echo "usage: campaign-audit.sh <инстанс> [--arm BASE|WOLF] [--skip-protected]" >&2
  exit 2
}

[ $# -ge 1 ] || usage
INST=""
ARM="BASE"
SKIP_PROTECTED=0
while [ $# -gt 0 ]; do
  case "$1" in
  --arm)
    [ $# -ge 2 ] || usage
    ARM="$2"
    shift 2
    ;;
  --arm=*)
    ARM="${1#--arm=}"
    shift
    ;;
  --skip-protected)
    SKIP_PROTECTED=1
    shift
    ;;
  *)
    if [ -z "$INST" ]; then
      INST="$1"
    else
      usage
    fi
    shift
    ;;
  esac
done
case "$ARM" in
BASE | WOLF) ;;
*) usage ;;
esac
[ -n "$INST" ] || usage
INST=$(cd "$INST" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)
AUDIT_SBXDG=""

cleanup() { [ -n "$AUDIT_SBXDG" ] && rm -rf "$AUDIT_SBXDG"; return 0; }
trap cleanup EXIT

FAIL=0
step() { # step <вердикт-строка> <0|1>
  if [ "$2" -eq 0 ]; then echo "$1 — PASS"; else echo "$1 — FAIL"; FAIL=1; fi
}

echo "== CAMPAIGN AUDIT: инстанс $INST (arm=$ARM) =="

# ---------- 1. Эпизодные оракулы (§6.3 #1: скрытые тесты) ----------
ORACLE_FAIL=0
for o in oracle-e1.sh oracle-e2.sh oracle-e3.sh oracle-e4.sh oracle-e5.sh oracle-e6a.sh oracle-e6b.sh; do
  set +e
  bash "$HERE/$o" "$INST"
  RC=$?
  set -e
  if [ "$RC" -ne 0 ]; then ORACLE_FAIL=1; fi
done
step "AUDIT: эпизодные оракулы E1–E6b" "$ORACLE_FAIL"

# ---------- 2. Границы diff (§6.3 #2: состояние файлов) ----------
# Разрешённые пути (константа плана WA5): код/тесты/доки/скрипты инстанса,
# волчьи артефакты init, заметки BASE-руки. Нарушение = CFR-кандидат
# «scope violation» — отдельная строка вердикта на каждый путь.
ALLOWED_EXACT='^.gitkeep$|^opencode\.json$|^\.opencode\.json$|^AGENTS\.md$|^NOTES\.md$'
ALLOWED_PREFIX='^(src|tests|docs|scripts|\.wolf|\.opencode|notes|docs/notes)/'

BOUND_FAIL=0
BOUND_LIST=$(git -C "$INST" status --porcelain 2>/dev/null | cut -c4- || true)
ROOT=$(git -C "$INST" rev-list --max-parents=0 HEAD 2>/dev/null || true)
if [ -n "$ROOT" ]; then
  BOUND_LIST="$BOUND_LIST
$(git -C "$INST" diff --name-only "$ROOT" 2>/dev/null || true)"
fi
while IFS= read -r p; do
  [ -n "$p" ] || continue
  # rename-записи «old -> new»: проверяем обе половины
  P1=$(printf '%s' "$p" | sed 's/ *-> *.*//')
  P2=""
  case "$p" in
  *' -> '*) P2=$(printf '%s' "$p" | sed 's/.* -> *//') ;;
  esac
  for pp in "$P1" "$P2"; do
    [ -n "$pp" ] || continue
    if ! printf '%s' "$pp" | grep -qE "$ALLOWED_EXACT" && ! printf '%s' "$pp" | grep -qE "$ALLOWED_PREFIX"; then
      echo "AUDIT: scope violation (CFR-кандидат): путь вне разрешённых — $pp — FAIL"
      BOUND_FAIL=1
    fi
  done
done <<<"$BOUND_LIST"
step "AUDIT: границы diff (изменённые пути внутри разрешённых)" "$BOUND_FAIL"

# ---------- 3. Инварианты памяти, WOLF-рука (§6.3 #4) ----------
# Память инстанса читается wolf CLI ИНСТАНСА, не git (F18). Проверяем, что нет
# АКТИВНЫХ объектов, противоречащих правилу E4 («init не выполняет авто-scan»),
# без пометки superseded. Триаж спорных случаев — человек (§6.3 #8).
if [ "$ARM" != "WOLF" ]; then
  echo "AUDIT: инварианты памяти (правило E4) — SKIP (arm=$ARM)"
  # data_loss-кандидат (BASE): заметки — механизм накопления руки; отсутствие
  # к финалу кампании — кандидат на потерю данных. Эмиттер события — cfr.sh
  # (класс data_loss, консервативно: только при контактах с заметками в логах).
  if [ ! -f "$INST/NOTES.md" ] && [ ! -d "$INST/notes" ] && [ ! -d "$INST/docs/notes" ]; then
    echo "AUDIT: data_loss-кандидат (BASE): NOTES.md/notes отсутствуют — сверить контакты с заметками в логах эпизодов (триаж за человеком)"
  fi
else
  if [ ! -d "$INST/.wolf" ]; then
    echo "AUDIT: инварианты памяти (правило E4) — SKIP (.wolf отсутствует: init не выполнялся)"
  else
    SB=$(mktemp -d /tmp/wolfeval-audit.XXXXXX)
    AUDIT_SBXDG="$SB"
    if ! [ -f "$INST/dist/bootstrap/cli.js" ]; then
      if ! (cd "$INST" && npm run build --silent) >"$SB/build.log" 2>&1; then
        echo "AUDIT: инварианты памяти (правило E4) — SKIP (CLI инстанса не собирается; см. protected suite)"
        WOLF_MEM=0
      fi
    fi
    if [ -f "$INST/dist/bootstrap/cli.js" ]; then
      set +e
      (
        cd "$INST"
        exec env XDG_CONFIG_HOME="$SB/xdg" node "$INST/dist/bootstrap/cli.js" list
      ) >"$SB/list.log" 2>&1 </dev/null
      LRC=$?
      set -e
      if [ "$LRC" -ne 0 ]; then
        echo "AUDIT: инварианты памяти (правило E4) — SKIP (wolf list недоступен, rc=$LRC; память не читается)"
      elif ! grep -q . "$SB/list.log"; then
        echo "AUDIT: инварианты памяти (правило E4) — PASS (память пуста)"
      else
        # кандидаты: активные объекты, в заголовке которых init связан со scan
        CAND=$(grep -E '\[active\].*(init|скан|scan)' "$SB/list.log" || true)
        if [ -z "$CAND" ]; then
          echo "AUDIT: инварианты памяти (правило E4) — PASS (активных init/scan-объектов нет)"
        else
          BAD=0
          while IFS= read -r line; do
            [ -n "$line" ] || continue
            ID=$(printf '%s' "$line" | awk '{print $1}')
            [ -n "$ID" ] || continue
            set +e
            (
              cd "$INST"
              exec env XDG_CONFIG_HOME="$SB/xdg" node "$INST/dist/bootstrap/cli.js" get "$ID"
            ) >"$SB/obj.log" 2>&1 </dev/null
            GRC=$?
            set -e
            if [ "$GRC" -eq 0 ] && grep -qiE 'init.{0,120}(авто-?скан|сканиру|auto-?scan|scan at init|scans)' "$SB/obj.log" &&
              ! grep -qi 'superseded' "$SB/obj.log"; then
              echo "AUDIT: активный объект $ID утверждает авто-scan при init (противоречит правилу E4, без superseded) — FAIL"
              BAD=1
            fi
          done <<<"$CAND"
          step "AUDIT: инварианты памяти (правило E4, активные объекты)" "$BAD"
        fi
      fi
    fi
  fi
fi

# ---------- 4. Protected suite (§6.3 #1/#6; референс — protected-suite.md) ----------
if [ "$SKIP_PROTECTED" -eq 1 ]; then
  echo "AUDIT: protected suite (npm run check) — SKIP (--skip-protected, smoke-режим)"
else
  SB2=$(mktemp -d /tmp/wolfeval-prot.XXXXXX)
  AUDIT_SBXDG="$SB2 $AUDIT_SBXDG"
  set +e
  (
    cd "$INST"
    exec npm run check
  ) >"$SB2/check.log" 2>&1 </dev/null &
  PID=$!
  (sleep 900; kill -TERM "$PID" 2>/dev/null) & WD=$!
  wait "$PID"
  CRC=$?
  kill -TERM "$WD" 2>/dev/null
  wait "$WD" 2>/dev/null
  set -e
  if [ "$CRC" -eq 0 ]; then
    echo "AUDIT: protected suite (npm run check) — PASS"
  else
    echo "AUDIT: protected suite (npm run check) — FAIL (rc=$CRC; хвост вывода:)"
    tail -n 3 "$SB2/check.log" | sed 's/^/  | /'
    FAIL=1
  fi
fi

# ---------- Итог ----------
if [ "$FAIL" -eq 0 ]; then
  echo "CAMPAIGN AUDIT: PASS"
else
  echo "CAMPAIGN AUDIT: FAIL"
fi
exit "$FAIL"
