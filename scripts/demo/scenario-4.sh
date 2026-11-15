#!/usr/bin/env bash
# Демо-сценарий 4: жалоба владельца — hot-signal контура (объект + relation + событие в Ф20-логе).
set -u
source "$(dirname "$0")/lib.sh"
new_demo_project

node "$WOLF" scaffold agent demo-agent --persona "Демо-агент." >/dev/null 2>&1

step "4.1 wolf complain — жалоба записывается с привязкой к адресату"
node "$WOLF" complain --about "demo-agent" \
  --rule "агент слишком многословен" \
  --evidence "ответы превышают лимит строк" \
  --proposal "ввести краткий формат ответа" >/dev/null 2>&1
check "создан объект жалобы (type complaint, status open)" "grep -rq 'многословен' .wolf/memory/shared 2>/dev/null"
check "создан relation -complain-> demo-agent"           "grep -q 'complain' .wolf/memory/relations.jsonl"

step "4.2 жалоба попала в сигнальный лог Ф20 (writer-матрица)"
check "событие complaint в session-metrics.jsonl"        "grep -q '\"event\": \"complaint\"\|\"event\":\"complaint\"' .wolf/metrics/session-metrics.jsonl"

step "4.3 жалоба видна в списке жалоб"
COMPLAINTS=$(node "$WOLF" list --type complaint 2>/dev/null)
check "list находит созданную жалобу"                        "echo \"$COMPLAINTS\" | grep -q 'слишком многословен'"

summary
