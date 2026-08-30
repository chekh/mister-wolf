#!/usr/bin/env bash
# Демо-сценарий 8: wolf run — модель берётся из routing-объекта памяти, расход пишется в run-log.
# ВНИМАНИЕ: делает ОДИН реальный LLM-вызов через opencode (локальный план, cost=0). ~30-60 сек.
set -u
source "$(dirname "$0")/lib.sh"
# этот сценарий живёт в РЕАЛЬНОМ репо Wolf (нужны routing-объект и рамка apprentice)
cd "$ROOT"

step "8.1 routing-объект: резолв актуальной модели через supersede-цепочку"
ROUTING_ID="mem_20260829_llm_routing_v1_wolf_router_auto_zai_codi_966883"
MODEL=$(node "$WOLF" get "$ROUTING_ID" --latest 2>/dev/null | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const o=JSON.parse(s);
  const m=/([\w.\-]+\/[\w.\-]+)\s*\(providerID/.exec(o.body||'');
  console.log(m?m[1]:'');
})")
check "модель резолвится из памяти (не пусто)"           "[ -n \"$MODEL\" ]"
echo "  routing → $MODEL"

step "8.2 wolf run — запуск с моделью из памяти"
BEFORE=$(wc -l < .wolf/run-log.jsonl 2>/dev/null || echo 0)
node "$WOLF" run --agent apprentice --title "demo-scenario8" "Ответь ровно одним словом: ping" >/dev/null 2>&1
check "запуск прошёл (exit 0)"                           "[ $? -eq 0 ]"

step "8.3 run-log: запись с моделью, задачей и weighted-ценой"
LINE=$(tail -1 .wolf/run-log.jsonl 2>/dev/null)
check "последняя запись run-log — наша (demo-scenario8)" "echo \"$LINE\" | grep -q 'demo-scenario8'"
check "модель в логе = модель из routing-объекта"        "echo \"$LINE\" | grep -q \"$MODEL\""
WHIT=$(echo "$LINE" | grep -cE '"weighted":[0-9]+' | tr -d ' ')
check "weighted-цена записана"                           "[ \"$WHIT\" -ge 1 ]"
echo "  $LINE" | head -c 200; echo

summary
