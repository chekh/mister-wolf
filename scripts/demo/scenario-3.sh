#!/usr/bin/env bash
# Демо-сценарий 3: новый агент = одна команда (scaffold: playbook + рамка + связь).
set -u
source "$(dirname "$0")/lib.sh"
new_demo_project

step "3.1 wolf scaffold agent — одной командой"
node "$WOLF" scaffold agent demo-reviewer \
  --persona "Ревьюер изменений корзины: ищи невалидированные мутации состояния." \
  --model "zai-coding-plan/glm-5.2" >/dev/null 2>&1
check "создана рамка .opencode/agents/demo-reviewer.md"  "[ -f .opencode/agents/demo-reviewer.md ]"
check "рамка содержит маркер agent-id (для плагина)"     "grep -q 'demo-reviewer' .opencode/agents/demo-reviewer.md"
check "рамка declares mode: all (требование headless)"   "grep -q 'mode: all' .opencode/agents/demo-reviewer.md"
check "создан playbook-объект в памяти"                  "[ -n \"$(node "$WOLF" search 'playbook: demo-reviewer' --hide-superseded 2>/dev/null | head -1)\" ]"
check "создана связь рамка↔playbook (relations.jsonl)"   "grep -q 'demo-reviewer' .wolf/memory/relations.jsonl"

step "3.2 идемпотентность: повторный scaffold отклоняется"
node "$WOLF" scaffold agent demo-reviewer --persona "x" >/dev/null 2>&1
check "второй scaffold с тем же именем — ошибка"         "[ $? -ne 0 ]"

step "3.3 варианты: skill и command"
node "$WOLF" scaffold skill demo-helper >/dev/null 2>&1
node "$WOLF" scaffold command demo-cmd >/dev/null 2>&1
check "skill-рамка создана"                              "[ -f .opencode/skills/demo-helper/SKILL.md ]"
check "command-рамка создана"                            "[ -f .opencode/commands/demo-cmd.md ] || [ -f .opencode/command/demo-cmd.md ]"

summary
