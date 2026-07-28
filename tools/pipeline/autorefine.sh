#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# autorefine.sh — детерминированный цикл ревью плана
# ═══════════════════════════════════════════════════════════════
# Запуск:  ./tools/pipeline/autorefine.sh <plan.md> [max_rounds] [checker...]
# Пример:  ./tools/pipeline/autorefine.sh docs/plans/auth.md 3 \
#            check-coverage check-placeholders check-types
#
# Идемпотентность: состояние в .autorefine/, resume при перезапуске
# Сходимость: 0 criticals ИЛИ нет diff ИЛИ max_rounds
#
# Для скорости: export OPENCODE_SERVER=http://localhost:4096
# (тогда скрипт прицепится к работающему серверу вместо cold boot)
# ═══════════════════════════════════════════════════════════════

PLAN="${1:?Ошибка: укажите путь к плану, например docs/plans/auth.md}"
MAX_ROUNDS="${2:-3}"

if [ $# -gt 2 ]; then
  shift 2
  CHECKERS=("$@")
else
  CHECKERS=(check-coverage check-placeholders check-types)
fi

STATE=".autorefine"
ATTACH="${OPENCODE_SERVER:+--attach $OPENCODE_SERVER}"
RESOLVER="refine-resolver"
APPLIER="refine-applier"

# ── Функции ────────────────────────────────────────────────────

# Очистка вывода opencode run от ANSI-кодов и заголовков
clean_output() {
  sed $'s/\x1b\\[[0-9;]*m//g' | grep -v '^>' | sed '/^[[:space:]]*$/d' | sed '/^```/d'
}

# Извлечение JSON из вывода агента (с fallback на пустой массив)
parse_json() {
  local input
  input=$(cat | clean_output)
  # Стратегия 1: весь вывод — валидный JSON
  echo "$input" | jq . 2>/dev/null && return 0
  # Стратегия 2: извлечь JSON-массив из текста
  echo "$input" | awk '/^\[/{s=1} s{print} /^\]/{if(s)exit}' | jq . 2>/dev/null && return 0
  # Fallback
  echo "[]"
}

# Запуск одного агента
run_agent() {
  local agent="$1"; shift
  opencode run $ATTACH --agent "$agent" --auto "$@" 2>/dev/null
}

# ── Инициализация состояния ────────────────────────────────────

mkdir -p "$STATE"
ROUND=0

# Resume: если есть сохранённое состояние для того же плана
if [ -f "$STATE/round" ] && [ -f "$STATE/plan" ]; then
  SAVED_PLAN=$(cat "$STATE/plan")
  if [ "$SAVED_PLAN" = "$PLAN" ]; then
    ROUND=$(cat "$STATE/round")
    echo "↻ Resume: раунд $ROUND завершён, продолжаю с $((ROUND + 1))"
  else
    rm -rf "$STATE"
    mkdir -p "$STATE"
  fi
fi
echo "$PLAN" > "$STATE/plan"

# ── Заголовок ──────────────────────────────────────────────────

echo ""
echo "══════════════════════════════════════════════════"
echo "  autorefine"
echo "  план:      $PLAN"
echo "  чекеров:   ${#CHECKERS[@]} (${CHECKERS[*]})"
echo "  раундов:   max $MAX_ROUNDS"
[ -n "$ATTACH" ] && echo "  сервер:    $OPENCODE_SERVER"
echo "══════════════════════════════════════════════════"

# ── Главный цикл ───────────────────────────────────────────────

while [ "$ROUND" -lt "$MAX_ROUNDS" ]; do
  ROUND=$((ROUND + 1))
  echo "$ROUND" > "$STATE/round"
  echo ""
  echo "── Раунд $ROUND / $MAX_ROUNDS ──"

  # 1. Проверщики — параллельно, каждый в свою сессию
  echo "Запускаю проверщиков..."
  for ck in "${CHECKERS[@]}"; do
    (
      run_agent "$ck" \
        "Проверь план @$PLAN (раунд $ROUND). Верни ТОЛЬКО валидный JSON-массив находок: [{\"severity\":\"critical|warning|info\",\"location\":\"Task N\",\"issue\":\"...\",\"suggestion\":\"...\"}]. Без markdown, без пояснений." \
        | parse_json > "$STATE/findings-${ck}-r${ROUND}.json"
    ) &
  done
  wait

  # Отчёт по проверщикам
  TOTAL_FINDINGS=0
  for ck in "${CHECKERS[@]}"; do
    COUNT=$(jq 'length' "$STATE/findings-${ck}-r${ROUND}.json" 2>/dev/null || echo 0)
    TOTAL_FINDINGS=$((TOTAL_FINDINGS + COUNT))
    echo "  ▸ $ck: $COUNT находок"
  done

  # Если все проверщики вернули пустоту — сходится
  if [ "$TOTAL_FINDINGS" -eq 0 ]; then
    echo "✓ Все проверщики чисты — сходимость"
    break
  fi

  # 2. Сводчик — объединяет находки, разрешает конфликты
  echo "Сводчик..."
  {
    for ck in "${CHECKERS[@]}"; do
      echo "### Источник: $ck"
      cat "$STATE/findings-${ck}-r${ROUND}.json" 2>/dev/null
      echo ""
    done
  } > "$STATE/all-findings-r${ROUND}.md"

  run_agent "$RESOLVER" \
    "Разреши находки из @$STATE/all-findings-r${ROUND}.md. Дедуплицируй, разреши конфликты, приоритизируй. Верни ТОЛЬКО валидный JSON-массив действий: [{\"priority\":\"critical|warning|info\",\"target\":\"Task N\",\"action\":\"конкретное изменение\",\"rationale\":\"почему\",\"source\":\"имя проверщика\"}]. Без markdown." \
    | parse_json > "$STATE/actions-r${ROUND}.json"

  # 3. Проверка сходимости
  CRITICALS=$(jq '[.[] | select(.priority=="critical")] | length' "$STATE/actions-r${ROUND}.json" 2>/dev/null || echo 999)
  WARNINGS=$(jq '[.[] | select(.priority=="warning")] | length' "$STATE/actions-r${ROUND}.json" 2>/dev/null || echo 0)
  INFOS=$(jq '[.[] | select(.priority=="info")] | length' "$STATE/actions-r${ROUND}.json" 2>/dev/null || echo 0)
  echo "Итог раунда: $CRITICALS critical / $WARNINGS warning / $INFOS info"

  if [ "$CRITICALS" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
    echo "✓ Сходимость — 0 critical, 0 warning"
    break
  fi

  # 4. Исполнитель — применяет изменения
  echo "Исполнитель..."
  run_agent "$APPLIER" \
    "Примени действия из @$STATE/actions-r${ROUND}.json к плану @$PLAN. Critical и warning — обязательно. Info — если тривиально. НЕ меняй структуру плана, только содержимое. После изменений выполни: git add -A && git commit -m \"refine r${ROUND}: ${CRITICALS}c ${WARNINGS}w\""

  # 5. Чекпойнт для идемпотентности
  git add -A 2>/dev/null
  git commit -m "autorefine: round $ROUND done" --quiet 2>/dev/null || true

  # 6. Дифф-проверка — если исполнитель ничего не поменял
  if git diff --quiet HEAD~1 -- "$PLAN" 2>/dev/null; then
    echo "✓ Нет изменений в плане — сходимость"
    break
  fi

  echo "→ Раунд $ROUND завершён, changes:"
  git diff --stat HEAD~1 -- "$PLAN" 2>/dev/null | head -5
done

# ── Итоговый отчёт ─────────────────────────────────────────────

echo ""
echo "══════════════════════════════════════════════════"
echo "  Готово: $ROUND раунд(ов)"
echo "══════════════════════════════════════════════════"
echo ""
echo "Коммиты autorefine:"
git log --oneline --grep="autorefine\|refine r" -5 2>/dev/null || echo "  (нет)"
echo ""
echo "Состояние: $STATE/"
echo "Очистка: rm -rf $STATE"
