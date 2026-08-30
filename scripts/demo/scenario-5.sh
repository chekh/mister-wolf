#!/usr/bin/env bash
# Демо-сценарий 5: скрипт становится ресурсом — tool-цикл Библиотекаря.
set -u
source "$(dirname "$0")/lib.sh"
new_demo_project

printf 'const fs=require("fs");\nconst cart=JSON.parse(fs.readFileSync(process.argv[2]));\nconsole.log(cart.reduce((s,i)=>s+i.qty,0));\n' > count_items.js

step "5.1 wolf tool register — скрипт канонизируется в .wolf/tools/ + объект памяти"
node "$WOLF" tool register count_items.js --name cart-count --language js \
  --contract-in "cart.json" --contract-out "число позиций" >/dev/null 2>&1
check "скрипт уложен в .wolf/tools/"                     "[ -f .wolf/tools/cart-count.js ]"
check "tool-объект создан (status candidate)"            "node \"$WOLF\" tool list 2>/dev/null | grep 'cart-count' | grep -q 'candidate'"

step "5.2 search-before-write: дубликат без --force отклоняется"
node "$WOLF" tool register count_items.js --name cart-count2 --language js \
  --contract-in "cart.json" --contract-out "число" >/dev/null 2>&1
check "register похожего отклонён (exit≠0)"             "[ $? -ne 0 ]"
check "дубль не попал в реестр"                          "! node "$WOLF" tool list 2>/dev/null | grep -q cart-count2"

step "5.3 wolf tool use — учёт использования"
node "$WOLF" tool use cart-count >/dev/null 2>&1
node "$WOLF" tool use cart-count >/dev/null 2>&1
check "usage_count=2 после двух вызовов"                 "[ \"$(node "$WOLF" tool list 2>/dev/null | grep 'cart-count' | awk '{print $3}' | tr -d ' ')\" = \"2\" ]"

step "5.4 wolf tool expose — канон → генерируемая экспозиция SKILL.md"
node "$WOLF" tool expose cart-count >/dev/null 2>&1
check "SKILL.md сгенерирован"                            "[ -f .opencode/skills/cart-count/SKILL.md ]"
check "маркер генерации from tool:<id>"                  "grep -q 'generated from tool:' .opencode/skills/cart-count/SKILL.md"

step "5.5 жизненный цикл: deprecate → revive"
node "$WOLF" tool deprecate cart-count --reason "не используется" >/dev/null 2>&1
check "deprecated после deprecate"                       "node "$WOLF" tool list 2>/dev/null | grep 'cart-count' | grep -q 'deprecated'"
node "$WOLF" tool revive cart-count >/dev/null 2>&1
check "reactivated после revive"                         "! node "$WOLF" tool list 2>/dev/null | grep 'cart-count' | grep -q 'deprecated'"

summary
