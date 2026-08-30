#!/usr/bin/env bash
# Общая библиотека A/B-бенчмарков Wolf (self-checking).
# Dry-режим — по умолчанию: LLM-прогоны подменяются fixture-NDJSON, механика Wolf
# (init/add/call/bootstrap/wrap-up, логи, отчёты) исполняется по-настоящему.
# Реальные opencode/LLM-вызовы — ТОЛЬКО по флагу --live и ТОЛЬКО вне npm-скриптов.

PASS=0; FAIL=0
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WOLF="$ROOT/dist/bootstrap/cli.js"
NODE_BIN="$(command -v node)"
MODE="dry"
BENCH_AGENT="apprentice" # агент-рамка из .opencode/agents (используется живым scenario-8)

bench_flags() { # bench_flags "$@" — разбор --dry|--live + защита живых вызовов
  for arg in "$@"; do
    case "$arg" in
      --dry) MODE="dry" ;;
      --live) MODE="live" ;;
      *) echo "неизвестный флаг: $arg (ожидается --dry|--live)" >&2; exit 2 ;;
    esac
  done
  if [ "$MODE" = "live" ] && [ -n "${npm_lifecycle_event:-}" ]; then
    echo "ОТКАЗ: --live запрещён под npm-скриптом (npm_lifecycle_event=$npm_lifecycle_event)" >&2
    exit 2
  fi
  if [ ! -f "$WOLF" ]; then echo "нет $WOLF — сначала npm run build" >&2; exit 2; fi
}

check() { # check <название> <условие-команда>
  if eval "$2"; then echo "  PASS  $1"; PASS=$((PASS+1)); else echo "  FAIL  $1"; FAIL=$((FAIL+1)); fi
}
step() { echo; echo "── $1"; }
summary() {
  echo; echo "════════════════════════════════════"
  echo "Итог: PASS=$PASS FAIL=$FAIL [mode=$MODE]"
  if [ "$FAIL" -eq 0 ]; then echo "ВСЁ РАБОТАЕТ"; else echo "ЕСТЬ СБОИ"; fi
  exit "$FAIL" # код выхода = число неудачных проверок
}

# parse_oc_metrics <ndjson-file> → "weighted steps"
# Формула как в src/adapters/cli/opencode-run-metrics.ts:
# weighted = Σ по step-finish: input + 0.1×cache.read + 5×output; битые строки пропускаются.
parse_oc_metrics() {
  node -e '
    const fs = require("fs");
    let weighted = 0, steps = 0;
    for (const line of fs.readFileSync(process.argv[1], "utf8").split("\n")) {
      if (!line.trim()) continue;
      let ev; try { ev = JSON.parse(line); } catch { continue; }
      const p = ev && ev.part;
      if (!p || p.type !== "step-finish") continue;
      steps++;
      const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
      weighted += n(p.tokens && p.tokens.input) + 0.1 * n(p.tokens && p.tokens.cache && p.tokens.cache.read) + 5 * n(p.tokens && p.tokens.output);
    }
    console.log(weighted + " " + steps);
  ' "$1"
}

# parse_oc_first_fact <ndjson-file> <fact> → "steps weighted found"
# Метод b2: шаги/weighted ДО ПЕРВОЙ text-части, содержащей факт (упрощение:
# считаем step-finish, предшествующие тексту с фактом).
parse_oc_first_fact() {
  node -e '
    const fs = require("fs");
    const fact = process.argv[2];
    let weighted = 0, steps = 0, found = 0;
    for (const line of fs.readFileSync(process.argv[1], "utf8").split("\n")) {
      if (!line.trim()) continue;
      let ev; try { ev = JSON.parse(line); } catch { continue; }
      const p = ev && ev.part;
      if (!p) continue;
      if (p.type === "text" && String(p.text || "").includes(fact)) { found = 1; break; }
      if (p.type === "step-finish") {
        steps++;
        const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
        weighted += n(p.tokens && p.tokens.input) + 0.1 * n(p.tokens && p.tokens.cache && p.tokens.cache.read) + 5 * n(p.tokens && p.tokens.output);
      }
    }
    console.log(steps + " " + weighted + " " + found);
  ' "$1" "$2"
}

# fixture-строки opencode NDJSON (dry): step-finish с известными токенами и text-части
oc_step() { # oc_step <input> <cache_read> <output>
  printf '{"type":"message","sessionID":"bench-fixture","part":{"type":"step-finish","tokens":{"input":%s,"output":%s,"cache":{"read":%s}}}}\n' "$1" "$3" "$2"
}
oc_text() { # oc_text <text>
  printf '{"type":"message","sessionID":"bench-fixture","part":{"type":"text","text":"%s"}}\n' "$1"
}

# make_bench_project <dir> — tmp-проект с известной поломкой:
# inventory.js экспортирует items/add, checkout.js зовёт несуществующий reserve(...)
# → `node src/checkout.js` детерминированно падает (TypeError: inv.reserve is not a function)
make_bench_project() {
  local dir="$1"
  mkdir -p "$dir/src"
  printf '{ "name": "bench-cart", "version": "0.1.0", "scripts": { "test": "echo ok" } }\n' > "$dir/package.json"
  printf '# Bench cart\nStack: Node 22 (module: ES2022).\nTests: npm test.\n' > "$dir/README.md"
  printf 'function items(){return []}\nfunction add(c,i){c.push(i);return c}\nmodule.exports={items,add};\n' > "$dir/src/inventory.js"
  printf 'const inv=require("./inventory");\nconst cart=inv.items();\ninv.add(cart,"apple");\ninv.reserve(cart,"apple");\nconsole.log("reserved");\n' > "$dir/src/checkout.js"
  ( cd "$dir" && node "$WOLF" init >/dev/null 2>&1 )
}

# save_report <name> <json> — JSON-отчёт в .wolf/bench КОРНЯ репо wolf
save_report() {
  mkdir -p "$ROOT/.wolf/bench"
  printf '%s\n' "$2" > "$ROOT/.wolf/bench/$1.json"
  [ -s "$ROOT/.wolf/bench/$1.json" ]
}
