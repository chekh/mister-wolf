#!/usr/bin/env bash
# Демо-сценарий 8: маршрутизация агента — модель берётся из routing-объекта памяти,
# сессия фиксируется через wolf session wrap-up в объектах памяти проекта.
set -u
source "$(dirname "$0")/lib.sh"
new_demo_project

step "8.1 создание и резолв актуальной модели через правило маршрутизации"
ROUTING_OUT=$(node "$WOLF" add --type rule --title "LLM routing policy" \
  --body "wolf-router routing: целевая модель по умолчанию zai-coding-plan/glm-5.2 (providerID=zai-coding-plan, modelID=glm-5.2)" 2>&1)
ROUTING_ID=$(echo "$ROUTING_OUT" | grep -oE 'mem_[a-z0-9_]+' | head -1)

MODEL=$(node "$WOLF" get "$ROUTING_ID" --latest 2>/dev/null | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const o=JSON.parse(s);
  const m=/([\w.\-]+\/[\w.\-]+)\s*\(providerID/.exec(o.body||'');
  console.log(m?m[1]:'');
})")
check "модель резолвится из памяти (не пусто)"               "[ -n \"$MODEL\" ]"
echo "  routing → $MODEL"

step "8.2 фиксация итогов сессии (wolf session wrap-up)"
node "$WOLF" session wrap-up --title "demo-scenario8" --tags "demo,routing" >/dev/null 2>&1
check "сессия успешно зафиксирована"                         "[ $? -eq 0 ]"

step "8.3 память проекта: объект сводки сессии сохранён с тегами"
WRAPUP_FILE=$(ls .wolf/memory/shared/notes/*demo_scenario8* 2>/dev/null | head -1)
check "создан объект сводки сессии"                          "[ -n \"$WRAPUP_FILE\" ]"
check "сводка содержит заголовок demo-scenario8"             "grep -q 'title: demo-scenario8' \"$WRAPUP_FILE\""

summary
