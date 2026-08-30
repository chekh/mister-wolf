#!/usr/bin/env bash
# Демо-сценарий 6: самообучение — 3 ошибки → паттерн → draft → Sandbox Replay → активация.
# Гейт: живого LLM нет (спека: детерминированные шаги); сбои порождаются реальным ENOENT.
set -u
source "$(dirname "$0")/lib.sh"
new_demo_project

fail_run() { # wolf run в окружении без opencode → ENOENT → writer пишет tool_error
  env PATH="/usr/bin:/bin" "$NODE_BIN" "$WOLF" run --agent apprentice --title "$1" "test" >/dev/null 2>&1
  return 0
}

step "6.1 три сбоя одного класса попадают в сигнальный лог (writer: wolf run)"
fail_run "task-1"; fail_run "task-2"; fail_run "task-3"
check "3 tool_error-события в session-metrics.jsonl"     "[ \"$(grep -c 'tool_error' .wolf/metrics/session-metrics.jsonl | tr -d ' ')\" -ge 3 ]"

step "6.2 wolf learn digest — контур фиксирует паттерн (порог N≥3)"
DIGEST=$(node "$WOLF" learn digest 2>/dev/null)
check "паттерн opencode:tool_not_found зафиксирован"     "echo \"$DIGEST\" | grep -q 'opencode:tool_not_found'"

step "6.3 wolf learn propose — черновик правила (пост-аудит, механический генератор)"
node "$WOLF" learn propose "opencode:tool_not_found" >/dev/null 2>&1
DRAFT=$(node "$WOLF" learn digest 2>/dev/null | grep -oE 'mem_[a-z0-9_]*draft[a-z0-9_]*' | head -1)
check "draft создан (id в digest)"                       "[ -n \"$DRAFT\" ]"
check "автор draft = Стюард (steward:*)"                 "node \"$WOLF\" get \"$DRAFT\" 2>/dev/null | grep -q 'steward:'"

step "6.4 wolf learn validate — Sandbox Replay Holdout"
fail_run "task-4"   # новое событие после draft → holdout содержит случай
VALID=$(node "$WOLF" learn validate "$DRAFT" 2>/dev/null)
check "вердикт pass (prevented ≥1)"                      "echo \"$VALID\" | grep -q 'pass'"

step "6.5 wolf learn activate — правило входит в силу (доставка только теперь)"
node "$WOLF" learn activate "$DRAFT" >/dev/null 2>&1
check "draft активирован (active)"                       "node \"$WOLF\" get \"$DRAFT\" 2>/dev/null | grep -q '\"status\": \"active\"'"
check "delivery_event записан в Ф20-лог"                 "grep -q 'delivery' .wolf/metrics/session-metrics.jsonl"

step "6.6 дедуп: второй propose на тот же паттерн отклонён"
node "$WOLF" learn propose "opencode:tool_not_found" >/dev/null 2>&1
check "повторный propose — отказ"                        "[ $? -ne 0 ]"

summary
