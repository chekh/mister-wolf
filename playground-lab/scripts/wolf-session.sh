#!/usr/bin/env bash
# playground-lab/scripts/wolf-session.sh — лаунчер headless-сессий opencode.
#
# Назначение: детерминированный запуск `opencode run` для экспериментов
# playground-lab с hang-guard (kill процесса-дерева по дедлайну), полным
# логом сессии и метриками токенов из SQLite opencode. Каждая сессия
# дописывается одной JSON-строкой в <out>/sessions.jsonl независимо от
# исхода (ok / timeout / error). Exit-код скрипта отражает сессию:
#   0 — ok, 124 — timeout, 1 — error.
#
# Использование:
#   wolf-session.sh --cwd <dir> [--agent <имя>] [--model <id>]
#                   --prompt-file <файл> [--timeout <сек, дефолт 480>]
#                   --out <dir> [--no-global]
#   --model по умолчанию: zai-coding-plan/glm-5.2
#   --agent по умолчанию: не передаётся (default-агент opencode)
#
# Что НЕ отсекается (изоляция неполная):
#   - Без --no-global глобальный конфиг ~/.config/opencode/opencode.json
#     грузится ВСЕГДА, включая MCP-серверы (в т.ч. mr-wolf) и внешние плагины.
#   - --no-global подменяет конфиг-файл и каталог конфига пустыми
#     (OPENCODE_CONFIG / OPENCODE_CONFIG_DIR на tmp), но НЕ отсекает:
#     credentials (~/.local/share/opencode/auth.json), глобальные
#     AGENTS.md-инструкции, встроенных агентов/модели и общую SQLite-БД сессий.
#   - stdin процесса сессии закрыт (</dev/null); stdout+stderr — в лог.
#
# Метрики: sessionID берётся из stdout JSONL (--format json, поле
# "sessionID":"ses_…"); токены — готовый агрегат из SQLite opencode,
# таблица session (tokens_input/tokens_cache_read/tokens_output).
# weight = input + 0.1*cache_read + 5*output.
set -uo pipefail

MODEL_DEFAULT="zai-coding-plan/glm-5.2"
DB_DEFAULT="$HOME/.local/share/opencode/opencode.db"

CWD="" AGENT="" MODEL="" PROMPT_FILE="" TIMEOUT=480 OUT="" NO_GLOBAL=0
while [ $# -gt 0 ]; do
  case "$1" in
    --cwd) CWD="${2:?--cwd требует значение}"; shift 2 ;;
    --agent) AGENT="${2:?--agent требует значение}"; shift 2 ;;
    --model) MODEL="${2:?--model требует значение}"; shift 2 ;;
    --prompt-file) PROMPT_FILE="${2:?--prompt-file требует значение}"; shift 2 ;;
    --timeout) TIMEOUT="${2:?--timeout требует значение}"; shift 2 ;;
    --out) OUT="${2:?--out требует значение}"; shift 2 ;;
    --no-global) NO_GLOBAL=1; shift ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "wolf-session.sh: неизвестный аргумент: $1" >&2; exit 1 ;;
  esac
done

[ -n "$CWD" ] && [ -d "$CWD" ] || { echo "wolf-session.sh: --cwd обязателен и должен существовать" >&2; exit 1; }
[ -n "$PROMPT_FILE" ] && [ -f "$PROMPT_FILE" ] || { echo "wolf-session.sh: --prompt-file обязателен и должен существовать" >&2; exit 1; }
[ -n "$OUT" ] || { echo "wolf-session.sh: --out обязателен" >&2; exit 1; }
MODEL="${MODEL:-$MODEL_DEFAULT}"
CWD=$(cd "$CWD" && pwd) || exit 1
mkdir -p "$OUT" || exit 1
OUT=$(cd "$OUT" && pwd) || exit 1

PROMPT=$(cat "$PROMPT_FILE") || exit 1
[ -n "$PROMPT" ] || { echo "wolf-session.sh: промпт-файл пуст: $PROMPT_FILE" >&2; exit 1; }

TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
LOG="$OUT/session-$(date +%Y%m%d-%H%M%S).log"
START=$(date +%s)
START_MS=$((START * 1000 - 2000)) # запас 2с для fallback-запроса к БД

# Изоляция от глобального конфига (только с --no-global): подменяем конфиг
# и каталог конфига пустыми. ponytail: полный песочнический namespace не нужен.
TMP_CONF=""
if [ "$NO_GLOBAL" -eq 1 ]; then
  TMP_CONF=$(mktemp -d) || exit 1
  printf '{}' > "$TMP_CONF/opencode.json"
  export OPENCODE_CONFIG="$TMP_CONF/opencode.json" OPENCODE_CONFIG_DIR="$TMP_CONF"
fi

ARGS=(run --format json -m "$MODEL")
[ -n "$AGENT" ] && ARGS+=(--agent "$AGENT")
ARGS+=("$PROMPT") # ponytail: промпт аргументом — ARG_MAX ~256KB, файлы лаборатории меньше

echo "[$TS] wolf-session: cwd=$CWD agent=${AGENT:-default} model=$MODEL timeout=${TIMEOUT}s" > "$LOG"

# Запуск: cwd задаётся рабочим каталогом процесса; stdin закрыт.
# ponytail: kill дерева — один уровень (pkill -P); глубже 2 уровней opencode не плодит.
( cd "$CWD" && exec opencode "${ARGS[@]}" ) >> "$LOG" 2>&1 </dev/null &
PID=$!

TIMEOUT_HIT=0
DEADLINE=$((START + TIMEOUT))
while kill -0 "$PID" 2>/dev/null; do
  NOW=$(date +%s)
  if [ "$NOW" -ge "$DEADLINE" ]; then
    TIMEOUT_HIT=1
    pkill -TERM -P "$PID" 2>/dev/null
    kill -TERM "$PID" 2>/dev/null
    sleep 2
    pkill -KILL -P "$PID" 2>/dev/null
    kill -KILL "$PID" 2>/dev/null
    break
  fi
  sleep 2
done
wait "$PID" 2>/dev/null
RC=$?
[ -n "$TMP_CONF" ] && rm -rf "$TMP_CONF"
END=$(date +%s)
SECS=$((END - START))

# --- sessionID из stdout JSONL; fallback — свежая сессия в БД по cwd+времени ---
SESSION_ID=$(grep -o '"sessionID":"ses_[A-Za-z0-9]*"' "$LOG" 2>/dev/null | head -1 | sed 's/.*"sessionID":"//;s/"$//')

DB_PATH="$DB_DEFAULT"
[ -f "$DB_PATH" ] || DB_PATH=$(opencode db path 2>/dev/null | tail -1)

TI=0 TCR=0 TO=0
if [ -n "$DB_PATH" ] && [ -f "$DB_PATH" ]; then
  ROW=""
  if [ -n "$SESSION_ID" ]; then
    ROW=$(sqlite3 "$DB_PATH" "SELECT tokens_input, tokens_cache_read, tokens_output FROM session WHERE id='$SESSION_ID';" 2>/dev/null)
  fi
  if [ -z "$ROW" ]; then
    SESSION_ID_FALLBACK=$(sqlite3 "$DB_PATH" \
      "SELECT id FROM session WHERE directory='${CWD//\'/\'\'}' AND time_created >= $START_MS ORDER BY time_created DESC LIMIT 1;" 2>/dev/null)
    if [ -n "$SESSION_ID_FALLBACK" ]; then
      [ -z "$SESSION_ID" ] && SESSION_ID="$SESSION_ID_FALLBACK"
      ROW=$(sqlite3 "$DB_PATH" "SELECT tokens_input, tokens_cache_read, tokens_output FROM session WHERE id='$SESSION_ID_FALLBACK';" 2>/dev/null)
    fi
  fi
  if [ -n "$ROW" ]; then
    TI=${ROW%%|*}
    REST=${ROW#*|}
    TCR=${REST%%|*}
    TO=${REST##*|}
  fi
fi

WEIGHT=$(awk "BEGIN{printf \"%.1f\", $TI + 0.1*$TCR + 5*$TO}")
if [ "$TI" -eq 0 ] && [ "$TCR" -eq 0 ] && [ "$TO" -eq 0 ]; then
  echo "wolf-session.sh: токен-статистика недоступна (session=${SESSION_ID:-нет}; сессия не дошла до БД или убита до записи) — строка дописана с нулями" >&2
fi

EXIT_CODE=$RC
[ "$TIMEOUT_HIT" -eq 1 ] && EXIT_CODE=124

json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
LOG_REL=${LOG#"$OUT"/}

printf '{"ts":"%s","cwd":"%s","agent":"%s","model":"%s","exit":%s,"secs":%s,"tokens":{"input":%s,"cache_read":%s,"output":%s,"weight":%s},"log":"%s"}\n' \
  "$TS" "$(json_escape "$CWD")" "$(json_escape "${AGENT:-default}")" "$(json_escape "$MODEL")" \
  "$EXIT_CODE" "$SECS" "$TI" "$TCR" "$TO" "$WEIGHT" "$(json_escape "${LOG_REL:-$LOG}")" >> "$OUT/sessions.jsonl"

[ "$TIMEOUT_HIT" -eq 1 ] && exit 124
[ "$RC" -eq 0 ] && exit 0
exit 1
