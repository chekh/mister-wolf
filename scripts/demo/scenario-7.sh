#!/usr/bin/env bash
# Демо-сценарий 7: гигиена и диагностика — doctor, целостность памяти validate, срез recap.
set -u
source "$(dirname "$0")/lib.sh"
new_demo_project

step "7.1 wolf doctor — диагностика реестра проектов"
DOCTOR=$(node "$WOLF" doctor 2>/dev/null)
check "doctor проверяет реестр проектов"                     "echo \"$DOCTOR\" | grep -q 'wolf doctor'"
check "doctor определяет версию схемы реестра"              "echo \"$DOCTOR\" | grep -q 'schema v2'"

step "7.2 wolf validate — целостность памяти"
VALID=$(node "$WOLF" validate 2>/dev/null)
check "validate: result OK"                                  "echo \"$VALID\" | grep -q 'result: OK'"
check "сигнальный лог проверен (bad=0)"                      "echo \"$VALID\" | grep -q 'bad 0'"

step "7.3 wolf recap — срез состояния памяти"
RECAP=$(node "$WOLF" recap 2>/dev/null)
check "recap генерирует срез проекта"                        "[ -n \"$RECAP\" ]"

summary
