#!/usr/bin/env bash
# Демо-сценарий 7: гигиена контура — learn status, целостность памяти, decay по пробегу.
set -u
source "$(dirname "$0")/lib.sh"
new_demo_project

# фон: немного событий, чтобы контуру было что показывать
node "$WOLF" scaffold agent demo-agent --persona "x" >/dev/null 2>&1
env PATH="/usr/bin:/bin" "$NODE_BIN" "$WOLF" run --agent demo-agent --title "t1" "test" >/dev/null 2>&1
true

step "7.1 wolf learn status — здоровье контура (Layer 1-2 метрики)"
STATUS=$(node "$WOLF" learn status 2>/dev/null)
check "показывает число событий лога"                    "echo \"$STATUS\" | grep -q 'events:'"
check "показывает порог паттернов"                       "echo \"$STATUS\" | grep -q 'threshold:'"
check "показывает drift-индикаторы (Layer 2)"            "echo \"$STATUS\" | grep -q 'layer2:\|drift\|decayShare'"

step "7.2 wolf validate — целостность памяти (STOP-тесты)"
VALID=$(node "$WOLF" validate 2>/dev/null)
check "validate: result OK"                              "echo \"$VALID\" | grep -q 'result: OK'"
check "сигнальный лог проверен (bad=0)"                  "echo \"$VALID\" | grep -q 'bad 0'"

step "7.3 wolf learn decay — старение по пробегу (TTL в сессиях)"
DECAY=$(node "$WOLF" learn decay 2>/dev/null)
check "decay работает: очередь пересмотра выводится"     "echo \"$DECAY\" | grep -q 'очередь'"
check "drift-индикаторы присутствуют"                    "echo \"$DECAY\" | grep -q 'drift:'"
echo "  (TTL 30/90/180 сессий: на демо-объёме очередь пуста — это честный результат)"

summary
