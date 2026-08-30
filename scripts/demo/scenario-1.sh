#!/usr/bin/env bash
# Демо-сценарий 1: подключение Wolf к новому проекту (self-checking).
# Запуск: bash scripts/demo/scenario-1.sh
# Каждая контрольная точка печатает PASS/FAIL. Итог — в конце.

set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WOLF="$ROOT/dist/bootstrap/cli.js"
DEMO="$(mktemp -d /tmp/wolf-demo-sc1.XXXXXX)"
PASS=0; FAIL=0

check() { # check <название> <условие-команда>
  if eval "$2"; then echo "  PASS  $1"; PASS=$((PASS+1)); else echo "  FAIL  $1"; FAIL=$((FAIL+1)); fi
}
step() { echo; echo "── $1"; }

cd "$DEMO"
cat > package.json << 'EOF'
{ "name": "shopcart", "version": "0.1.0", "scripts": { "test": "echo ok" } }
EOF
cat > README.md << 'EOF'
# ShopCart — сервис корзины покупок
Стек: Node 22, Fastify, SQLite. Тесты: npm test.
EOF
mkdir -p src docs
cat > src/cart.js << 'EOF'
function addItem(cart, item) { cart.push(item); return cart; }
module.exports = { addItem };
EOF
cat > docs/API.md << 'EOF'
# API
POST /cart/add
EOF

echo "Сценарий 1: подключение Wolf к новому проекту"
echo "проект: $DEMO (README, src/cart.js, docs/API.md — никакого Wolf)"

step "1.1 wolf init — каркас хранилища"
node "$WOLF" init >/dev/null 2>&1
check "создан .wolf/config.yaml"        "[ -f .wolf/config.yaml ]"
check "создан FTS-индекс"               "[ -f .wolf/cache/index.sqlite ]"

step "1.2 изоляция seed (известная особенность init в dev-репо)"
rm -rf .wolf/memory/shared .wolf/memory/threads .wolf/orchestration .wolf/metrics .wolf/artifacts
mkdir -p .wolf/memory/shared .wolf/memory/threads .wolf/memory/briefs .wolf/metrics
node "$WOLF" rebuild-index >/dev/null 2>&1
check "память пуста перед bootstrap"    "[ -z \"$(find .wolf/memory/shared -type f 2>/dev/null | head -1)\" ]"

step "1.3 wolf bootstrap — адаптивное наполнение из фактов проекта"
node "$WOLF" bootstrap >/dev/null 2>&1
check "создано ≥1 правило-черновик (факты проекта)" \
  "[ \"$(find .wolf/memory/shared/rules -name '*stek*' -o -name '*proverka*' 2>/dev/null | wc -l | tr -d ' ')\" -ge 1 ]"
check "README зарегистрирован по ссылке (document-ref)" \
  "[ -f .wolf/memory/shared/documents/doc_README_md.md ]"
check "создан work-thread bootstrap"    "[ -n \"$(find .wolf/memory/threads -name 'WORK-THREAD.md' 2>/dev/null | head -1)\" ]"
check "журнал событий ведётся (появился при первой записи)" "[ -f .wolf/memory/events.jsonl ]"

step "1.4 wolf brief — первый полезный вывод"
BRIEF=$(node "$WOLF" brief 2>/dev/null)
H1=$(echo "$BRIEF" | grep -c 'Project Snapshot' | tr -d ' ')
H2=$(echo "$BRIEF" | grep -c 'document-ref' | tr -d ' ')
H3=$(echo "$BRIEF" | grep -ci 'proposed' | tr -d ' ')
check "brief содержит снимок проекта"   "[ \"$H1\" -ge 1 ]"
check "brief видит зарегистрированные документы" "[ \"$H2\" -ge 1 ]"
check "brief НЕ показывает черновики (пост-аудит §2.5)" "[ \"$H3\" -eq 0 ]"

echo
echo "════════════════════════════════════"
echo "Итог: PASS=$PASS FAIL=$FAIL"
echo "проект демо сохранён: $DEMO (можно осмотреть .wolf/ вручную)"
[ "$FAIL" -eq 0 ] && echo "ВСЁ РАБОТАЕТ" || echo "ЕСТЬ СБОИ"
