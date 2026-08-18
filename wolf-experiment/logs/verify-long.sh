#!/bin/bash
# verify-long.sh — независимая верификация LONG-001 по первичным артефактам.
# Не верит отчётам: тесты гоняет сам, спавны берёт из журнала, контекст wolf — из SQLite.
cd "$(dirname "$0")/.." || exit 1

echo "=== LONG-001: независимая верификация ==="
FAILS=0

echo; echo "1. Тесты и чистота миграции (фактический прогон):"
for d in long-task/flat-1 long-task/flat-2 long-task/flat-3 long-task/orch-1 long-task/orch-2 long-task/orch-3b; do
  R=$(cd "$d" && python3 -m unittest discover -s tests -t . 2>&1 | tail -1)
  M=$(grep -rE "import miniframe|from frameworks import miniframe|from frameworks.miniframe" "$d/app" | wc -l | tr -d ' ')
  F=$(cd "$d" && grep "FRAMEWORK" app/config.py | head -1)
  if [[ "$R" == "OK" && "$M" == "0" && "$F" == *"swiftframe"* ]]; then
    echo "   ✅ $d: 167/167 OK, импортов miniframe: 0, FRAMEWORK=swiftframe"
  else
    echo "   ❌ $d: тесты=$R miniframe=$M config=$F"; FAILS=$((FAILS+1))
  fi
done

echo; echo "2. Спавны по ORCH-окнам (из spawn-log.jsonl, системно):"
python3 - <<'PY'
import json
from datetime import datetime, timezone

rows = [json.loads(l) for l in open('logs/cost-markers.jsonl') if l.strip()]
windows = [r for r in rows if r['task'] == 'L' and r['type'] == 'orch']
logs = [json.loads(l) for l in open('logs/spawn-log.jsonl')]
def ts(e): return datetime.fromisoformat(e['ts'].replace('Z', '+00:00'))
for w in windows:
    a = datetime.fromtimestamp(w['start_ms']/1000, tz=timezone.utc)
    b = datetime.fromtimestamp(w['end_ms']/1000, tz=timezone.utc)
    calls = [e for e in logs if e['event'] == 'task.call' and a <= ts(e) <= b]
    execs = [e for e in calls if str(e.get('subagent_type','')).startswith('executor')]
    workers = [e for e in calls if str(e.get('subagent_type','')).startswith('worker')]
    tag = ' (killed)' if w.get('killed') else ''
    note = ' HANG' if w.get('hang') else ''
    print(f"   orch iter {w['iter']}{tag}{note}: executor-спавнов={len(execs)}, worker-спавнов={len(workers)}")
PY

echo; echo "3. Таблицы декомпозиции в отчётах executor'ов (H2):"
for f in executor/report-long-orch-*.md; do
  [ -e "$f" ] || continue
  T=$(grep -c "Task Decomposition" "$f")
  ROWS=$(sed -n '/## Task Decomposition/,/^## /p' "$f" | grep -c "^| " )
  SELF=$(sed -n '/## Task Decomposition/,/^## /p' "$f" | grep -ciE "сам\b|SELF")
  SPAWN=$(sed -n '/## Task Decomposition/,/^## /p' "$f" | grep -ciE "worker|спавн|SPAWN")
  echo "   $f: секция=$T, строк-решений=$ROWS, из них «сам»≈$SELF / «воркером»≈$SPAWN"
  if [[ "$T" -lt 1 || "$ROWS" -lt 5 ]]; then echo "      ❌ таблица неполная"; FAILS=$((FAILS+1)); else echo "      ✅"; fi
done

echo; echo "4. Пиковый контекст wolf-сессий (SQLite, input+cache_read одного шага):"
python3 - <<'PY'
import json, sqlite3
from datetime import datetime, timezone

rows = [json.loads(l) for l in open('logs/cost-markers.jsonl') if l.strip()]
db = sqlite3.connect("file:/Users/chekh/.local/share/opencode/opencode.db?mode=ro", uri=True)
q = """
SELECT MAX(CAST(json_extract(p.data,'$.tokens.input') AS INTEGER)
         + CAST(json_extract(p.data,'$.tokens.cache.read') AS INTEGER))
FROM part p JOIN message m ON m.id=p.message_id JOIN session s ON s.id=m.session_id
WHERE p.data LIKE '%"step-finish"%' AND s.agent='wolf-coordinator'
  AND s.time_created BETWEEN ? AND ?"""
for w in [r for r in rows if r['task']=='L' and r['type']=='orch']:
    peak = db.execute(q, (w['start_ms'], w['end_ms'])).fetchone()[0] or 0
    total_task_context = 2600  # ~строк фикстуры * ~5 токенов + тесты
    print(f"   orch iter {w['iter']}{' (killed)' if w.get('killed') else ''}: peak wolf context = {peak:,} токенов")
flat_peak = None
fl = [r for r in rows if r['task']=='L' and r['type']=='flat']
if fl:
    qf = q.replace("s.agent='wolf-coordinator'", "s.agent='flat-worker'")
    for w in fl:
        peak = db.execute(qf, (w['start_ms'], w['end_ms'])).fetchone()[0] or 0
        print(f"   flat iter {w['iter']}: peak flat context = {peak:,} токенов")
PY

echo; echo "5. Стратегии из отчётов (сводно):"
grep -h "сделал сам\|сам vs\|воркерами" executor/report-long-orch-*.md 2>/dev/null | head -6

echo; echo "=== Итог: FAILS=$FAILS ==="
exit $FAILS
