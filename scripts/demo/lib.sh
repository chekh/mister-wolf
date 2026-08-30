#!/usr/bin/env bash
# Общая библиотека демо-сценариев Wolf (self-checking).

PASS=0; FAIL=0
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WOLF="$ROOT/dist/bootstrap/cli.js"
NODE_BIN="$(command -v node)"

check() { # check <название> <условие-команда>
  if eval "$2"; then echo "  PASS  $1"; PASS=$((PASS+1)); else echo "  FAIL  $1"; FAIL=$((FAIL+1)); fi
}
step() { echo; echo "── $1"; }
summary() {
  echo; echo "════════════════════════════════════"
  echo "Итог: PASS=$PASS FAIL=$FAIL"
  [ -n "${DEMO:-}" ] && echo "проект демо сохранён: $DEMO (можно осмотреть .wolf/ вручную)"
  if [ "$FAIL" -eq 0 ]; then echo "ВСЁ РАБОТАЕТ"; else echo "ЕСТЬ СБОИ"; fi
}

# new_demo_project — чистый tmp-проект с пустой изолированной памятью
new_demo_project() {
  DEMO="$(mktemp -d /tmp/wolf-demo.XXXXXX)"
  cd "$DEMO" || exit 1
  echo '{ "name": "demo", "version": "0.1.0", "scripts": { "test": "echo ok" } }' > package.json
  printf '# Demo project\nСтек: Node. Тесты: npm test.\n' > README.md
  mkdir -p src
  printf 'function addItem(c,i){c.push(i);return c}\nmodule.exports={addItem};\n' > src/cart.js
  node "$WOLF" init >/dev/null 2>&1
  # изоляция seed: init в dev-репо копирует живую память пакета — убираем (известная особенность)
  rm -rf .wolf/memory/shared .wolf/memory/threads .wolf/orchestration .wolf/metrics .wolf/artifacts
  mkdir -p .wolf/memory/shared .wolf/memory/threads .wolf/memory/briefs .wolf/metrics
  node "$WOLF" rebuild-index >/dev/null 2>&1
}
