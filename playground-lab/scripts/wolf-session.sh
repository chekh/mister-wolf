#!/usr/bin/env bash
# playground-lab/scripts/wolf-session.sh — лаунчер headless-сессий opencode.
#
# Назначение: детерминированный запуск `opencode run` для экспериментов
# playground-lab с hang-guard (kill процесса-дерева по дедлайну), полным
# логом сессии и метриками токенов из SQLite opencode. Каждая сессия
# дописывается одной JSON-строкой в <out>/sessions.jsonl независимо от
# исхода (ok / timeout / error). Exit-код скрипта отражает сессию:
#   0 — ok, 124 — timeout, 1 — error,
#   2 — silent truncation (RC=0, но лог структурно бит — F25).
#
# Использование:
#   wolf-session.sh --cwd <dir> [--agent <имя>] [--model <id>]
#                   --prompt-file <файл> [--timeout <сек, дефолт 480>]
#   --out <dir> [--no-global]
#   wolf-session.sh --selftest — валидатор на синтетических фикстурах
#     (playground-lab/benchmarks/wolfeval-v1/task-families/TF-1-infra-hardening/
#      fixtures/log-fixtures/; ожидание по префиксу имени: truncated*→2, valid*→0)
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

# Структурная валидация лога сессии (F25: silent truncation — RC=0 при
# оборванном логе). $1 = файл лога; echo 0 (валиден) | 2 (битый).
# Правило (зафиксировано): лог валиден ⟺ (а) есть ≥1 событие step-finish
# и ПОСЛЕДНЕЕ из них имеет reason="stop", и (б) существует непустой
# ассистентский text ПОСЛЕ последнего step-finish с reason≠"stop"
# (в реальном формате opencode 1.18.x финальный text-part идёт непо-
# средственно ПЕРЕД завершающим step-finish(stop) — поэтому «после
# последнего не-stop step-finish», а не «после последнего step-finish»;
# также принимается формат {"type":"message","info":{"role":"assistant",
# "content":[{"type":"text","text":…}]}}). Не-JSON строки (заголовок,
# артефакты stderr) пропускаются, парсер не роняется.
validate_log_structure() {
  command -v python3 >/dev/null 2>&1 || {
    echo "wolf-session.sh: python3 недоступен — валидация пропущена" >&2; echo 0; return; }
  python3 - "$1" <<'PYEOF'
import json, sys
last_sf = (0, None)  # (lineno, reason) последнего step-finish
last_nonstop = 0     # lineno последнего step-finish с reason != "stop"
last_text = 0        # lineno последнего непустого ассистентского text
with open(sys.argv[1], encoding='utf-8', errors='replace') as f:
    for i, raw in enumerate(f, 1):
        line = raw.strip()
        if not line.startswith('{'):
            continue
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        if not isinstance(ev, dict):
            continue
        part = ev.get('part') if isinstance(ev.get('part'), dict) else {}
        t = ev.get('type')
        if t in ('step-finish', 'step_finish') or part.get('type') == 'step-finish':
            reason = ev['reason'] if isinstance(ev.get('reason'), str) else part.get('reason')
            last_sf = (i, reason)
            if reason != 'stop':
                last_nonstop = i
        if part.get('type') == 'text' and isinstance(part.get('text'), str) and part['text'].strip():
            last_text = i
        elif t == 'message':
            info = ev.get('info') if isinstance(ev.get('info'), dict) else {}
            if info.get('role') == 'assistant' and isinstance(info.get('content'), list) \
                    and any(isinstance(c, dict) and c.get('type') == 'text'
                            and str(c.get('text', '')).strip() for c in info['content']):
                last_text = i
ok = last_sf[0] > 0 and last_sf[1] == 'stop' and last_text > last_nonstop
print(0 if ok else 2)
PYEOF
}

# Прогон валидатора на синтетических фикстурах без запуска сессий.
run_selftest() {
  local dir f expect got fails=0 n=0
  dir=$(cd "$(dirname "$0")" && pwd)/../benchmarks/wolfeval-v1/task-families/TF-1-infra-hardening/fixtures/log-fixtures
  [ -d "$dir" ] || { echo "selftest: нет каталога фикстур: $dir" >&2; exit 1; }
  for f in "$dir"/*.jsonl; do
    [ -f "$f" ] || { echo "selftest: фикстуры не найдены: $dir" >&2; exit 1; }
    case "$(basename "$f")" in
      truncated*) expect=2 ;;
      valid*)     expect=0 ;;
      *) echo "$(basename "$f") → неизвестно → skip (нужен префикс truncated*/valid*)"; continue ;;
    esac
    got=$(validate_log_structure "$f")
    n=$((n + 1))
    if [ "$got" = "$expect" ]; then echo "$(basename "$f") → expect=$expect got=$got PASS"
    else echo "$(basename "$f") → expect=$expect got=$got FAIL"; fails=$((fails + 1)); fi
  done
  [ "$n" -gt 0 ] || { echo "selftest: фикстуры не найдены: $dir" >&2; exit 1; }
  [ "$fails" -eq 0 ] || { echo "selftest: FAIL ($fails из $n)"; exit 1; }
  echo "selftest: OK ($n/$n)"
}

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
    --selftest) run_selftest; exit $? ;;
    -h|--help) sed -n '2,36p' "$0"; exit 0 ;;
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
  # F26: маркер песочницы — wolf-CLI (в т.ч. дочерние) резолвит глобальный конфиг только сюда.
  export WOLF_SANDBOX="$TMP_CONF"
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

# F25: RC=0 не гарантирует завершённость сессии — проверяем структуру лога.
# Таймаут-ветку не трогаем; коды 0/124/1 сохраняют смысл, добавляется 2.
if [ "$RC" -eq 0 ] && [ "$TIMEOUT_HIT" -eq 0 ]; then
  if [ "$(validate_log_structure "$LOG")" != "0" ]; then
    EXIT_CODE=2
    echo "wolf-session.sh: silent truncation — лог структурно бит (последний step-finish не stop / нет финального text): $LOG" >&2
  fi
fi

json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
LOG_REL=${LOG#"$OUT"/}

printf '{"ts":"%s","cwd":"%s","agent":"%s","model":"%s","exit":%s,"secs":%s,"tokens":{"input":%s,"cache_read":%s,"output":%s,"weight":%s},"log":"%s"}\n' \
  "$TS" "$(json_escape "$CWD")" "$(json_escape "${AGENT:-default}")" "$(json_escape "$MODEL")" \
  "$EXIT_CODE" "$SECS" "$TI" "$TCR" "$TO" "$WEIGHT" "$(json_escape "${LOG_REL:-$LOG}")" >> "$OUT/sessions.jsonl"

[ "$TIMEOUT_HIT" -eq 1 ] && exit 124
[ "$EXIT_CODE" -eq 2 ] && exit 2
[ "$RC" -eq 0 ] && exit 0
exit 1
