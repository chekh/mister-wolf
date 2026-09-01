#!/usr/bin/env bash
# A/B-бенчмарк B1 «повторяющаяся отладка»: известная поломка (inventory.reserve
# не существует) решается дважды — A с активным правилом в памяти Wolf (доставка
# через `wolf call --for reserve`), B с пустой памятью.
# Dry (по умолчанию): LLM-прогоны = fixture-NDJSON, механика Wolf исполняется
# по-настоящему. --live: реальные вызовы `wolf run` (opencode), ~минуты.
set -u
source "$(dirname "$0")/lib.sh"
bench_flags "$@"

step "B1.1 подготовка веток: A (wolf) и B (без памяти)"
bench_tmp TMP_A
bench_tmp TMP_B
make_bench_project "$TMP_A"
make_bench_project "$TMP_B"
check "поломка воспроизводится в A (reserve is not a function)" "( cd \"$TMP_A\" && node src/checkout.js 2>&1 | grep -q 'reserve is not a function' )"
check "поломка воспроизводится в B" "( cd \"$TMP_B\" && node src/checkout.js 2>&1 | grep -q 'reserve is not a function' )"

step "B1.2 ветка A: правило в памяти с trigger_keywords"
( cd "$TMP_A" && node "$WOLF" add --type rule --title "Починка reserve" \
  --body "при ошибке reserve is not a function: добавить reserve() в src/inventory.js — смотри картину целиком" \
  --set "trigger_keywords=[reserve,checkout]" --scope project ) >/dev/null
check "правило записано" "( cd \"$TMP_A\" && node \"$WOLF\" list 2>/dev/null | grep -q 'Починка reserve' )"

step "B1.3 прогон 1 «отладка» (A и B)"
if [ "$MODE" = "live" ]; then
  ( cd "$TMP_A" && node "$WOLF" run --agent "$BENCH_AGENT" --title bench-b1-a1 \
    "Запусти node src/checkout.js, найди причину ошибки и почини: добавь недостающую функцию в src/inventory.js." ) > "$TMP_A/run1.ndjson"
  ( cd "$TMP_B" && node "$WOLF" run --agent "$BENCH_AGENT" --title bench-b1-b1 \
    "Запусти node src/checkout.js, найди причину ошибки и почини: добавь недостающую функцию в src/inventory.js." ) > "$TMP_B/run1.ndjson"
else # dry: fixture-NDJSON — первый прогон одинаково дорогой в обеих ветках
  { oc_step 1000 2000 100; oc_step 500 1000 50; oc_step 300 0 40; } > "$TMP_A/run1.ndjson"
  cp "$TMP_A/run1.ndjson" "$TMP_B/run1.ndjson"
fi

step "B1.4 прогон 2 «та же ошибка в новом файле» (A: доставка правила, B: с нуля)"
printf 'const inv=require("./inventory");\nconst cart=inv.items();\ninv.reserve(cart,"apple");\nconsole.log("reserved-v2");\n' > "$TMP_A/src/checkout-v2.js"
cp "$TMP_A/src/checkout-v2.js" "$TMP_B/src/checkout-v2.js"
if [ "$MODE" = "live" ]; then
  ( cd "$TMP_A" && node "$WOLF" call --for reserve ) >/dev/null # доставка правила = срабатывание
  ( cd "$TMP_A" && node "$WOLF" run --agent "$BENCH_AGENT" --title bench-b1-a2 \
    "Запусти node src/checkout-v2.js и почини ошибку максимально дёшево." ) > "$TMP_A/run2.ndjson"
  ( cd "$TMP_B" && node "$WOLF" run --agent "$BENCH_AGENT" --title bench-b1-b2 \
    "Запусти node src/checkout-v2.js, найди причину ошибки и почини." ) > "$TMP_B/run2.ndjson"
else
  { oc_step 200 1000 30; oc_step 100 500 20; } > "$TMP_A/run2.ndjson" # повтор с правилом — дешевле
  { oc_step 1000 2000 100; oc_step 500 1000 50; oc_step 300 0 40; oc_step 800 500 60; } > "$TMP_B/run2.ndjson" # повтор с нуля
  ( cd "$TMP_A" && node "$WOLF" call --for reserve ) >/dev/null # механика доставки исполняется по-настоящему
fi
check "delivery-событие в сигнальном логе A" "grep -q '\"event\":\"delivery\"' \"$TMP_A/.wolf/metrics/session-metrics.jsonl\""

step "B1.5 метрики (weighted = input + 0.1×cache.read + 5×output; шаги = step-finish)"
MET_A1=($(parse_oc_metrics "$TMP_A/run1.ndjson")); MET_A2=($(parse_oc_metrics "$TMP_A/run2.ndjson"))
MET_B1=($(parse_oc_metrics "$TMP_B/run1.ndjson")); MET_B2=($(parse_oc_metrics "$TMP_B/run2.ndjson"))
A_WEIGHTED=$((MET_A1[0] + MET_A2[0])); A_STEPS=$((MET_A1[1] + MET_A2[1]))
B_WEIGHTED=$((MET_B1[0] + MET_B2[0])); B_STEPS=$((MET_B1[1] + MET_B2[1]))
DELIVERY=$(grep -c '"event":"delivery"' "$TMP_A/.wolf/metrics/session-metrics.jsonl" || true)
DRY_TAG=""; [ "$MODE" = "dry" ] && DRY_TAG=" (dry-fixture)"
echo "  A: weighted=$A_WEIGHTED steps=$A_STEPS delivery=$DELIVERY | B: weighted=$B_WEIGHTED steps=$B_STEPS"

echo
echo "| метрика | A (wolf) | B (без) |"
echo "|---|---|---|"
echo "| weighted | $A_WEIGHTED$DRY_TAG | $B_WEIGHTED$DRY_TAG |"
echo "| steps | $A_STEPS$DRY_TAG | $B_STEPS$DRY_TAG |"
echo "| delivery | $DELIVERY | 0 |"

step "B1.6 самопроверка парсера и отчёт"
if [ "$MODE" = "dry" ]; then
  check "parse_oc_metrics сходится с fixture (A weighted=3750)" "[ \"$A_WEIGHTED\" -eq 3750 ]"
  check "parse_oc_metrics сходится с fixture (B steps=7)" "[ \"$B_STEPS\" -eq 7 ]"
fi
REPORT=$(node -e 'console.log(JSON.stringify({bench:"b1-repeat-debug",mode:process.argv[1],a:{weighted:+process.argv[2],steps:+process.argv[3],delivery:+process.argv[4]},b:{weighted:+process.argv[5],steps:+process.argv[6]},dry:process.argv[7]==="dry",ts:new Date().toISOString()}))' \
  "$MODE" "$A_WEIGHTED" "$A_STEPS" "$DELIVERY" "$B_WEIGHTED" "$B_STEPS" "$MODE")
check "отчёт .wolf/bench/b1-repeat-debug.json создан" "save_report b1-repeat-debug \"$REPORT\""
check "NDJSON-прогоны обеих веток непустые" "[ -s \"$TMP_A/run2.ndjson\" ] && [ -s \"$TMP_B/run2.ndjson\" ]"

summary
