#!/usr/bin/env bash
# A/B-бенчмарк B2 «новый проект»: сколько шагов/weighted стоит агенту добраться до
# содержательного ответа о проекте (первое упоминание факта README).
# A: wolf init + wolf bootstrap + wolf brief (память проекта готова).
# B: холодный старт — память не инициализируется.
# Dry (по умолчанию): прогоны = fixture-NDJSON, bootstrap/brief исполняются
# по-настоящему. --live: реальный `wolf run` с вопросом о проекте.
set -u
source "$(dirname "$0")/lib.sh"
bench_flags "$@"

FACT="Node 22" # фиксированный факт README, ищется в выводе агента

step "B2.1 подготовка tmp-проекта"
bench_tmp TMP_A
make_bench_project "$TMP_A"
check "README содержит фиксированные факты" "grep -q 'Node 22' \"$TMP_A/README.md\" && grep -q 'npm test' \"$TMP_A/README.md\""

step "B2.2 ветка A: init + bootstrap + brief"
( cd "$TMP_A" && node "$WOLF" bootstrap ) > "$TMP_A/bootstrap.out"
check "wolf bootstrap прошёл (exit 0)" "[ $? -eq 0 ]"
( cd "$TMP_A" && node "$WOLF" brief ) > "$TMP_A/brief.out"
check "wolf brief непустой" "[ -s \"$TMP_A/brief.out\" ]"
echo "  brief: $(head -c 120 "$TMP_A/brief.out" | tr '\n' ' ')..."

step "B2.3 прогон «чем является этот проект?»"
if [ "$MODE" = "live" ]; then
  # ветка B — тот же вопрос без памяти Wolf
  bench_tmp TMP_B
  make_bench_project "$TMP_B"
  rm -rf "$TMP_B/.wolf"
  ( cd "$TMP_A" && node "$WOLF" run --agent "$BENCH_AGENT" --title bench-b2-a \
    "Чем является этот проект? Назови стек и как запустить тесты." ) > "$TMP_A/answer.ndjson"
  ( cd "$TMP_B" && node "$WOLF" run --agent "$BENCH_AGENT" --title bench-b2-b \
    "Чем является этот проект? Назови стек и как запустить тесты." ) > "$TMP_B/answer.ndjson"
  B_NDJSON="$TMP_B/answer.ndjson"
else # dry: fixture — у A факт всплывает после 2-го шага, у B только после 4-го
  { oc_step 600 2000 80; oc_step 300 1000 40; oc_text "Стек проекта: Node 22, тесты: npm test."; oc_step 200 500 20; } > "$TMP_A/answer.ndjson"
  B_NDJSON="$TMP_A/answer_b_dry.ndjson"
  { oc_step 600 2000 80; oc_step 300 1000 40; oc_step 800 500 60; oc_step 200 1000 30; oc_text "Стек проекта: Node 22."; } > "$B_NDJSON"
fi

step "B2.4 метрика «до содержательного ответа» — шаги/weighted до первой text-части с фактом"
A_MET=($(parse_oc_first_fact "$TMP_A/answer.ndjson" "$FACT"))
B_MET=($(parse_oc_first_fact "$B_NDJSON" "$FACT"))
A_STEPS=${A_MET[0]}; A_WEIGHTED=${A_MET[1]}
B_STEPS=${B_MET[0]}; B_WEIGHTED=${B_MET[1]}
echo "  факт [$FACT] найден: A=${A_MET[2]} B=${B_MET[2]}"
DRY_TAG=""; [ "$MODE" = "dry" ] && DRY_TAG=" (dry-fixture)"

echo
echo "| метрика | A (wolf) | B (без) |"
echo "|---|---|---|"
echo "| steps до факта | $A_STEPS$DRY_TAG | $B_STEPS$DRY_TAG |"
echo "| weighted до факта | $A_WEIGHTED$DRY_TAG | $B_WEIGHTED$DRY_TAG |"

step "B2.5 отчёт"
REPORT=$(node -e 'console.log(JSON.stringify({bench:"b2-bootstrap",mode:process.argv[1],method:"шаги/weighted до первой text-части, содержащей факт README",fact:process.argv[2],a:{steps_to_fact:+process.argv[3],weighted_to_fact:+process.argv[4],fact_found:+process.argv[5]},b:{steps_to_fact:+process.argv[6],weighted_to_fact:+process.argv[7],fact_found:+process.argv[8]},dry:process.argv[9]==="dry",ts:new Date().toISOString()}))' \
  "$MODE" "$FACT" "$A_STEPS" "$A_WEIGHTED" "${A_MET[2]}" "$B_STEPS" "$B_WEIGHTED" "${B_MET[2]}" "$MODE")
check "отчёт .wolf/bench/b2-bootstrap.json создан" "save_report b2-bootstrap \"$REPORT\""

summary
