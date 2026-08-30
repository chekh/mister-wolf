#!/usr/bin/env bash
# A/B-бенчмарк B3 «ретроспектива»: полнота пересказа сессии по фиксированным
# маркерам ['reserve','tool_error','delivery'] + weighted-цена пересказа.
# A: wolf session wrap-up (события сессии в .wolf/metrics/session-metrics.jsonl
# + событие в памяти; wrap-up — локальная команда, weighted=0). B: голый
# пересказ (dry: заглушка, weighted n/a; live: wolf run — реальный вызов).
# ВНИМАНИЕ: флаг --live делает РЕАЛЬНЫЙ opencode/LLM-вызов (минуты, деньги) —
# только ручной запуск; по умолчанию и под npm — dry без LLM.
# Покрытие маркеров печатается как число — качество НЕ ассертим (LLM/шаблон
# недетерминированы); PASS/FAIL только за механику.
set -u
source "$(dirname "$0")/lib.sh"
bench_flags "$@"

MARKERS="reserve tool_error delivery"
TMP_A="$(mktemp -d /tmp/wolf-bench.XXXXXX)"

step "B3.1 сессия с 10 фиксированными событиями в сигнальном логе"
make_bench_project "$TMP_A"
MET="$TMP_A/.wolf/metrics/session-metrics.jsonl"
mkdir -p "$TMP_A/.wolf/metrics"
sig() { # sig <сек> <event> <modelID> <agent> <task> <outcome> <extra-json>
  printf '{"ts":"2026-08-30T10:00:%sZ","event":"%s","session_id":"bench-session","gen_ai":{"modelID":%s,"agent":%s},"orchestration":{"task":%s,"actor":"user:cli"},"outcome":"%s"%s}\n' "$@"
}
{
  sig 00 run        '"m"' '"apprentice"' '"bench"' 'ok' ''
  sig 01 run        '"m"' '"apprentice"' '"bench"' 'ok' ''
  sig 02 tool_error null '"apprentice"' '"bench"' 'error' ',"tool_name":"node","error_class_id":"runtime_type_error","detail":{"message":"TypeError: reserve is not a function"}'
  sig 03 delivery   null null           null      'delivered' ',"detail":{"name":"rule-reserve","mechanism":"call","target":"reserve"}'
  sig 04 run        '"m"' '"apprentice"' '"bench"' 'ok' ''
  sig 05 tool_error null '"apprentice"' '"bench"' 'error' ',"tool_name":"node","error_class_id":"runtime_type_error","detail":{"message":"TypeError: reserve is not a function"}'
  sig 06 delivery   null null           null      'delivered' ',"detail":{"name":"rule-reserve","mechanism":"call","target":"reserve"}'
  sig 07 run        '"m"' '"apprentice"' '"bench"' 'ok' ''
  sig 08 tool_error null '"apprentice"' '"bench"' 'error' ',"tool_name":"node","error_class_id":"runtime_type_error","detail":{"message":"TypeError: reserve is not a function"}'
  sig 09 delivery   null null           null      'delivered' ',"detail":{"name":"rule-reserve","mechanism":"call","target":"reserve"}'
} > "$MET"
EVENTS=$(grep -c . "$MET")
check "сигнальный лог создан: 10 событий" "[ \"$EVENTS\" -eq 10 ]"
# событие сессии в памяти (реальный wolf add): wrap-up пересказывает event-log Wolf
( cd "$TMP_A" && node "$WOLF" add --type lesson --title "Сессия bench: починка reserve" \
  --body "За сессию: tool_error TypeError reserve is not a function при node src/checkout.js; delivery правила про reserve через wolf call; session bench-session." ) >/dev/null

step "B3.2 ветка A: wolf session wrap-up"
( cd "$TMP_A" && node "$WOLF" session wrap-up --title "Bench wrap-up" ) > "$TMP_A/wrapup.out"
WRAP_ID=$(grep -oE 'mem_[a-z0-9_]+' "$TMP_A/wrapup.out" | head -1)
check "wrap-up создал session-summary" "[ -n \"$WRAP_ID\" ]"
( cd "$TMP_A" && node "$WOLF" get "$WRAP_ID" ) | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).body||"")}catch{console.log("")}})' > "$TMP_A/wrapup-text.txt"
check "текст wrap-up непустой" "[ -s \"$TMP_A/wrapup-text.txt\" ]"

step "B3.3 ветка B: пересказ без Wolf"
A_WEIGHTED=0 # wrap-up — локальная команда, LLM не тратится (честный ноль)
B_WEIGHTED=null
if [ "$MODE" = "live" ]; then
  ( cd "$TMP_A" && node "$WOLF" run --agent "$BENCH_AGENT" --title bench-b3-b \
    "Перескажи сессию по логу $MET: главные ошибки и доставки." ) > "$TMP_A/b_retell.ndjson"
  B_WEIGHTED=$(parse_oc_metrics "$TMP_A/b_retell.ndjson" | cut -d' ' -f1)
  node -e 'const fs=require("fs");for(const l of fs.readFileSync(process.argv[1],"utf8").split("\n")){if(!l.trim())continue;try{const p=JSON.parse(l).part;if(p&&p.type==="text")console.log(p.text)}catch{}}' "$TMP_A/b_retell.ndjson" > "$TMP_A/b-text.txt"
else
  echo "пересказ отсутствует (голый агент без памяти Wolf)" > "$TMP_A/b-text.txt"
fi

step "B3.4 покрытие маркеров (качество НЕ ассертим — только механика)"
A_TEXT="$TMP_A/wrapup-text.txt"; B_TEXT="$TMP_A/b-text.txt"
cover() { # cover <file> — сколько маркеров из списка найдено в тексте
  local n=0
  for m in $MARKERS; do grep -q "$m" "$1" && n=$((n+1)); done
  echo "$n"
}
A_COVER=$(cover "$A_TEXT"); B_COVER=$(cover "$B_TEXT")
TOTAL=$(echo $MARKERS | wc -w | tr -d ' ')
echo "  A (wrap-up): покрыто $A_COVER/$TOTAL | B (голый): покрыто $B_COVER/$TOTAL"

echo
echo "| метрика | A (wolf) | B (без) |"
echo "|---|---|---|"
echo "| маркеры покрыто | $A_COVER/$TOTAL | $B_COVER/$TOTAL |"
echo "| weighted | $A_WEIGHTED (локальный wrap-up) | $B_WEIGHTED$([ "$MODE" = "dry" ] && echo ' (dry: LLM-вызов не делается)') |"

step "B3.5 отчёт"
REPORT=$(node -e 'console.log(JSON.stringify({bench:"b3-retrospective",mode:process.argv[1],markers:process.argv[2].split(" "),a_covered:+process.argv[3],b_covered:+process.argv[4],a_weighted:+process.argv[5],b_weighted:process.argv[6]==="null"?null:+process.argv[6],events:10,ts:new Date().toISOString()}))' \
  "$MODE" "$MARKERS" "$A_COVER" "$B_COVER" "$A_WEIGHTED" "$B_WEIGHTED")
check "отчёт .wolf/bench/b3-retrospective.json создан" "save_report b3-retrospective \"$REPORT\""

summary
