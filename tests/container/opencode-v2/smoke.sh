#!/usr/bin/env bash
# Smoke-проверка совместимости Wolf-плагинов с OpenCode v1 и v2.
# Запускается ВНУТРИ контейнера (см. run.sh). /src — worktree, смонтированный ro.
# Модель указывает на недостижимый локальный baseURL: hooks срабатывают при
# построении запроса, внешний сетевой вызов не выполняется.
set -euo pipefail

SRC=/src
BASE=/work/smoke
rm -rf "$BASE"
mkdir -p "$BASE/bin"

# PATH-shim `wolf`: логирует вызовы (доказательство, что hooks дернули CLI).
cat > "$BASE/bin/wolf" <<'EOF'
#!/bin/sh
echo "wolf $*" >> /tmp/wolf-calls.log
exit 0
EOF
chmod +x "$BASE/bin/wolf"

make_project() { # $1=dir $2=runtime(v1|v2)
  local dir="$1" rt="$2"
  mkdir -p "$dir/.opencode/plugins" "$dir/.opencode/agents"
  if [ "$rt" = v1 ]; then
    cat > "$dir/opencode.json" <<'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "default_agent": "test-agent",
  "model": "local/coder",
  "provider": {
    "local": {
      "npm": "@ai-sdk/openai-compatible",
      "options": { "baseURL": "http://127.0.0.1:9/v1" },
      "models": { "coder": { "name": "Coder" } }
    }
  }
}
EOF
  else
    cat > "$dir/opencode.json" <<'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "default_agent": "test-agent",
  "model": "local/coder",
  "providers": {
    "local": {
      "name": "Local",
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": { "baseURL": "http://127.0.0.1:9/v1" },
      "models": {
        "coder": {
          "modelID": "x",
          "capabilities": { "tools": true, "input": ["text"], "output": ["text"] },
          "limit": { "context": 32768, "output": 8192 }
        }
      }
    }
  }
}
EOF
  fi
  cat > "$dir/.opencode/agents/test-agent.md" <<'EOF'
---
description: smoke test agent
mode: primary
---
agent-id: test-agent

Smoke test agent frame.
EOF
  cp "$SRC/templates/opencode/plugins/wolf-router.ts" "$dir/.opencode/plugins/"
  cp "$SRC/templates/opencode/plugins/wolf-session-start.js" "$dir/.opencode/plugins/"
}

fail=0
run_case() { # $1=runtime $2=bin
  local rt="$1"
  local bin="$2"
  local dir="$BASE/$rt"
  make_project "$dir" "$rt"
  rm -f /tmp/router.log /tmp/wolf-calls.log
  ( cd "$dir" && PATH="$BASE/bin:$PATH" WOLF_ROUTER_LOG=/tmp/router.log timeout 60 "$bin" run "hi" >"/tmp/run-$rt.log" 2>&1 ) || true
  echo "--- $rt ---"
  echo "router: $(cat /tmp/router.log 2>/dev/null | tr '\n' '|')"
  echo "calls:  $(cat /tmp/wolf-calls.log 2>/dev/null | tr '\n' '|')"
  if grep -q "injected=yes" /tmp/router.log 2>/dev/null; then echo "$rt ROUTER_HOOK=yes"; else echo "$rt ROUTER_HOOK=NO"; fail=1; fi
  if grep -q "recap" /tmp/wolf-calls.log 2>/dev/null; then echo "$rt SESSION_HOOK=yes"; else echo "$rt SESSION_HOOK=NO"; fail=1; fi
  if grep -q "search test-agent playbook" /tmp/wolf-calls.log 2>/dev/null; then echo "$rt ROUTER_CLI=yes"; else echo "$rt ROUTER_CLI=NO"; fail=1; fi
}

run_case v1 /opt/oc-v1/node_modules/.bin/opencode
run_case v2 /opt/oc-v2/node_modules/.bin/opencode

echo "--- version formats ---"
echo "v1 --version: $(/opt/oc-v1/node_modules/.bin/opencode --version)"
echo "v2 --version: $(/opt/oc-v2/node_modules/.bin/opencode --version)"

if [ "$fail" = 0 ]; then echo "SMOKE: PASS"; else echo "SMOKE: FAIL"; exit 1; fi
