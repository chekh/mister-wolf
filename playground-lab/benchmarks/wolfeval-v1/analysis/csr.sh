#!/usr/bin/env bash
# csr.sh — WolfEval v1 scorer: Campaign Success Rate по audit-verdicts.jsonl.
#
# usage: csr.sh <audit-verdicts.jsonl>
#
# Вход: audit-verdicts.jsonl — строки {"repeat","arm","verdict":"PASS|FAIL",
# "audit_log":<путь>}, заполняется оператором при прогоне campaign-audit.sh
# (слепой скоринг: этот скрипт аудит НЕ запускает, только потребляет вердикты).
#
# Выход:
#   csr.jsonl (в ТЕКУЩЕМ каталоге) — по одной строке на (repeat, arm):
#     {"repeat":"r1","arm":"WOLF","success":1}
#   stdout — сводка: «CSR <arm>: k/n» на каждую руку.
#
# Правила:
#   - Вердикт FAIL/PASS берётся дословно из файла; несколько строк на один
#     (repeat, arm) — конфликт: предупреждение в stderr, консервативно FAIL.
#   - Неполные строки (нет repeat/arm/verdict) и verdict не из {PASS,FAIL} —
#     предупреждение, строка пропускается.
#   - csr видит ТОЛЬКО вердикты: повторы, отсутствующие в файле, этим скриптом
#     не обнаруживаются (нет списка ожидаемых прогонов) — такие предупреждения
#     дают cost.sh/cfr.sh, у которых на входе runs.tsv/sessions.jsonl.
#
# Выход: 0 — ок; 1 — фатальная ошибка; 2 — usage.
set -euo pipefail

[ $# -eq 1 ] || { echo "usage: csr.sh <audit-verdicts.jsonl>" >&2; exit 2; }
command -v python3 >/dev/null 2>&1 || { echo "csr.sh: python3 недоступен" >&2; exit 1; }

python3 - "$1" <<'PYEOF'
import json
import sys

SELF = "csr.sh"


def warn(msg):
    print(f"{SELF}: {msg}", file=sys.stderr)


def die(msg):
    print(f"{SELF}: {msg}", file=sys.stderr)
    sys.exit(1)


try:
    raw_lines = open(sys.argv[1], encoding="utf-8").read().splitlines()
except OSError as e:
    die(f"не читается audit-verdicts.jsonl: {sys.argv[1]}: {e}")

verdicts = {}
n_lines = 0
for i, raw in enumerate(raw_lines, 1):
    s = raw.strip()
    if not s:
        continue
    try:
        ev = json.loads(s)
    except ValueError:
        warn(f"audit-verdicts.jsonl:{i}: не-JSON строка, пропущена")
        continue
    if not isinstance(ev, dict):
        warn(f"audit-verdicts.jsonl:{i}: не объект, пропущена")
        continue
    rep, arm, v = ev.get("repeat"), ev.get("arm"), ev.get("verdict")
    if not (isinstance(rep, str) and isinstance(arm, str) and isinstance(v, str)):
        warn(f"audit-verdicts.jsonl:{i}: неполная строка, пропущена")
        continue
    v = v.upper()
    if v not in ("PASS", "FAIL"):
        warn(f"audit-verdicts.jsonl:{i}: verdict={v!r} не PASS/FAIL, пропущена")
        continue
    n_lines += 1
    k = (rep, arm)
    if k in verdicts and verdicts[k] != v:
        warn(f"audit-verdicts.jsonl: конфликт вердиктов {rep}/{arm} — консервативно FAIL")
        verdicts[k] = "FAIL"
    else:
        verdicts[k] = v

if n_lines == 0:
    warn("валидных строк вердиктов нет — csr.jsonl пустой")

rows = []
for (rep, arm) in sorted(verdicts):
    rows.append({"repeat": rep, "arm": arm, "success": 1 if verdicts[(rep, arm)] == "PASS" else 0})

try:
    with open("csr.jsonl", "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
except OSError as e:
    die(f"не пишется csr.jsonl: {e}")

arms = sorted({arm for _, arm in verdicts})
for arm in arms:
    sel = [r for r in rows if r["arm"] == arm]
    k = sum(r["success"] for r in sel)
    print(f"CSR {arm}: {k}/{len(sel)}")
print(f"csr.jsonl: {len(rows)} строк -> csr.jsonl")
PYEOF
