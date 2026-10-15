#!/usr/bin/env bash
# Демо-сценарий 6: предложения агентов — сохранение предложения (wolf propose add),
# просмотр (wolf propose list), доставка адресату (wolf propose deliver) и защита ADR-5.
set -u
source "$(dirname "$0")/lib.sh"
new_demo_project

step "6.1 wolf propose add — сохранение предложения (facet=proposal, pending)"
PROP_OUT=$(env WOLF_ACTOR="agent:apprentice" node "$WOLF" propose add \
  --addressee "agent:steward" \
  --basis "Повторяющийся сбой в сборке" \
  --change "Добавить pre-check для артефактов" \
  --benefit "Снижение ошибок на 40%" \
  --bounds "Только в dev-режиме" \
  "Предложение: включить автоматическую валидацию артефактов" 2>&1)
PROP_ID=$(echo "$PROP_OUT" | grep -oE 'mem_[a-z0-9_]+' | head -1)
check "proposal сохранён (id получен)"                       "[ -n \"$PROP_ID\" ]"
check "автор предложения из env (WOLF_ACTOR)"                "node \"$WOLF\" get \"$PROP_ID\" 2>/dev/null | grep -q 'agent:apprentice'"

step "6.2 wolf propose list --pending — предложение в очереди"
PENDING=$(node "$WOLF" propose list --pending 2>/dev/null)
check "предложение присутствует в pending-списке"            "echo \"$PENDING\" | grep -q \"$PROP_ID\""

step "6.3 wolf propose deliver — явная доставка адресату"
DELIVER_OUT=$(node "$WOLF" propose deliver "$PROP_ID" 2>&1)
check "предложение доставлено адресату"                      "echo \"$DELIVER_OUT\" | grep -q 'delivered'"

step "6.4 wolf propose list --delivered — статус доставлен"
DELIV_LIST=$(node "$WOLF" propose list --delivered 2>/dev/null)
check "предложение появилось в списке delivered"             "echo \"$DELIV_LIST\" | grep -q \"$PROP_ID\""

step "6.5 защита ADR-5: попытка передать --created-by отклоняется"
node "$WOLF" propose add --addressee "agent:steward" --basis "b" --change "c" --benefit "b" --bounds "b" --created-by "fake" >/dev/null 2>&1
check "отказ при передаче явного флага --created-by"         "[ $? -ne 0 ]"

summary
