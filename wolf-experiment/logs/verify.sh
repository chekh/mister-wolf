#!/bin/bash
# verify.sh — системная проверка трёхуровневой схемы wolf-experiment.
# Источник правды: logs/spawn-log.jsonl (системный журнал плагина) + артефакты.
# Запуск: .wolf-experiment/verify.sh или ./verify.sh из logs/
cd "$(dirname "$0")/.." || exit 1

echo "=== Проверка трёхуровневой схемы агентов (wolf-experiment) ==="

python3 - <<'PY'
import json, re, os

logs = [json.loads(l) for l in open('logs/spawn-log.jsonl')]
calls   = [e for e in logs if e['event'] == 'task.call']
results = [e for e in logs if e['event'] == 'task.result']
blocked = [e for e in logs if e['event'] == 'task.blocked']

# Реконструкция дерева: child-сессии извлекаем из snippet task.result
child_of = {}
for r in results:
    m = re.search(r'<task id="(ses_[^"]+)"', r.get('snippet') or '')
    if m:
        child_of[m.group(1)] = (r['sessionID'], r.get('subagent_type'))

wolf_sessions     = {c['sessionID'] for c in calls if str(c.get('subagent_type','')).startswith('executor')}
executor_sessions = {sid for sid,(p,t) in child_of.items() if t and t.startswith('executor')}
worker_sessions   = {sid for sid,(p,t) in child_of.items() if t and t.startswith('worker')}

ok = lambda b: '✅ PASS' if b else '❌ FAIL'

# 1. Нет успешных спавнов с уровня воркеров (3-й уровень невозможен)
lvl3 = {r['sessionID'] for r in results} & worker_sessions
print('1. Глубина (нет task.result из worker-сессий):', ok(not lvl3),
      f'| worker-сессий: {len(worker_sessions)}, executor-сессий: {len(executor_sessions)}')

# 2. Попытки спавна из воркеров (ожидаемо только probe-тест, блокируются)
probe_calls = [c for c in calls if c['sessionID'] in worker_sessions]
print('2. Попытки спавна из worker-сессий:', len(probe_calls),
      '(негативный тест depth: ожидаемо >0 только от worker-probe, все блокируются)')

# 3. Executor координирует воркеров (>= 2 в имплементирующей сессии)
per_exec = {}
for c in calls:
    if c['sessionID'] in executor_sessions and str(c.get('subagent_type','')).startswith('worker'):
        per_exec[c['sessionID']] = per_exec.get(c['sessionID'], 0) + 1
best = max(per_exec.values(), default=0)
print('3. Executor спавнил воркеров:', ok(best >= 2),
      f'| по сессиям executor: {[f"...{k[-6:]}:{v}" for k, v in per_exec.items()]}')

# 4. Лимит воркеров на сессию executor
limit = int(os.environ.get('WOLF_WORKER_LIMIT', '3'))
print(f'4. Лимит воркеров (<= {limit} на сессию executor):',
      ok(all(v <= limit for v in per_exec.values())), f'| заблокировано попыток: {len(blocked)}')

# 5. Wolf спавнит только executor-*/council-*/planner-*
bad_wolf = [c for c in calls if c['sessionID'] in wolf_sessions
            and not str(c.get('subagent_type','')).startswith(('executor', 'council', 'planner'))]
print('5. Wolf спавняет только executor-*/council-*/planner-*:', ok(not bad_wolf))
PY

echo "6. Дисциплина Wolf (в coordinator/ только брифы):"
if ls coordinator/ 2>/dev/null | grep -qv '^task-brief\|^decision\|^plan'; then
  echo "   ❌ FAIL: лишние файлы:"; ls coordinator/ | grep -v '^task-brief\|^decision\|^plan'
else
  echo "   ✅ PASS (только task-brief-* / decision-* / plan-*)"
fi

echo "7. Структура Report:"
for f in executor/report-*.md; do
  [ -e "$f" ] || continue
  W=$(grep -c '## Workers Used' "$f"); V=$(grep -c '## Validation Results' "$f")
  if [ "$W" -ge 1 ] && [ "$V" -ge 1 ]; then echo "   ✅ PASS ($f)"; else echo "   ❌ FAIL ($f)"; fi
done

echo "8. Тесты воркеров:"
FAIL=0
for t in workers/test_*.py; do
  [ -e "$t" ] || continue
  if python3 "$t" >/dev/null 2>&1; then echo "   ✅ PASS ($t)"; else echo "   ❌ FAIL ($t)"; FAIL=1; fi
done

echo "=== Проверка завершена ==="
exit $FAIL
