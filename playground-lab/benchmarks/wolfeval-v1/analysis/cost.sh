#!/usr/bin/env bash
# cost.sh — WolfEval v1 scorer: стоимость (по-эпизодный costs.csv + CPSC).
#
# usage: cost.sh <sessions.jsonl> <runs.tsv> [audit-verdicts.jsonl] [costs.csv]
#
# Входы:
#   sessions.jsonl        — схема лаунчера wolf-session.sh, одна строка на запуск:
#                           {"ts","cwd","agent","model","exit","secs",
#                            "tokens":{"input","cache_read","output","weight"},
#                            "log"}; exit: 0 ok, 124 timeout, 1 error,
#                           2 silent truncation (F25).
#   runs.tsv              — манифест атрибуции (заполняет оператор при запусках):
#                           TSV с заголовком, колонки log, repeat, arm, episode,
#                           planned_kill. episode — нормализуется к нижнему
#                           регистру (e1…e6b). planned_kill: 1/0.
#   audit-verdicts.jsonl  — (опционально) вердикты campaign-audit, строки
#                           {"repeat","arm","verdict":"PASS|FAIL","audit_log":<путь>}.
#                           Заполняется при прогоне campaign-audit (слепой скоринг:
#                           этот скрипт аудит НЕ запускает, только читает вердикты).
#   costs.csv             — (опционально) путь файла для CSV; без него CSV идёт
#                           в stdout, строки CPSC печатаются в stdout ПОСЛЕ CSV.
#
# Правила:
#   - Джойн sessions.jsonl <-> runs.tsv по полю log (точное совпадение пути;
#     fallback — уникальный basename). Сессия без атрибуции — предупреждение
#     в stderr, в CSV и агрегаты не попадает.
#   - weight ПЕРЕСЧИТЫВАЕТСЯ по формуле лаунчера
#     weight = input + 0.1*cache_read + 5*output; расхождение с полем weight
#     в sessions.jsonl — предупреждение (используется пересчитанное значение).
#   - Эпизод = группа строк сессий с одинаковым (repeat, arm, episode):
#     E5 = 2 запуска (planned_kill-обрыв + восстановление) агрегируются в одну
#     строку эпизода — суммы input/cache_read/output/weight/secs, exit через
#     «;», planned_kill=1 если у любой из строк.
#   - CPSC<arm> = (Σ weight всех смэтченных сессий руки) / (число успешных
#     кампаний руки). Успешная кампания = verdict PASS И ≥1 смэтченная сессия
#     этого повтора (вердикт без сессий — предупреждение, в знаменатель НЕ
#     идёт: кампания без сессионных данных считается незапущенной).
#     Без audit-verdicts.jsonl знаменатель = все повторы руки с сессиями,
#     вывод помечается assume_all_success=true. 0 успешных кампаний ->
#     «CPSC <arm>: n/a» + предупреждение (НЕ крэш).
#   - invalid-кандидаты (F21/F22/F25, см. cfr.sh) НЕ исключаются из CPSC:
#     выбывание — решение триажа; CSV по-эпизодный, пересчёт после триажа
#     возможен.
#
# Выход: 0 — ок (предупреждения не меняют код); 1 — фатальная ошибка; 2 — usage.
set -euo pipefail

if [ $# -lt 2 ] || [ $# -gt 4 ]; then
  echo "usage: cost.sh <sessions.jsonl> <runs.tsv> [audit-verdicts.jsonl] [costs.csv]" >&2
  exit 2
fi
command -v python3 >/dev/null 2>&1 || { echo "cost.sh: python3 недоступен" >&2; exit 1; }

python3 - "$@" <<'PYEOF'
import json
import os
import sys

SELF = "cost.sh"


def warn(msg):
    print(f"{SELF}: {msg}", file=sys.stderr)


def die(msg):
    print(f"{SELF}: {msg}", file=sys.stderr)
    sys.exit(1)


def read_text(path, what):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except OSError as e:
        die(f"не читается {what}: {path}: {e}")


def load_jsonl(path, what):
    out = []
    for i, raw in enumerate(read_text(path, what).splitlines(), 1):
        s = raw.strip()
        if not s:
            continue
        try:
            ev = json.loads(s)
        except ValueError:
            warn(f"{what}:{i}: не-JSON строка, пропущена")
            continue
        if isinstance(ev, dict):
            out.append(ev)
    return out


def load_runs(path):
    lines = [l for l in read_text(path, "runs.tsv").splitlines() if l.strip()]
    idx = None
    if lines and lines[0].lstrip().lower().startswith("log"):
        hdr = [c.strip().lower() for c in lines[0].split("\t")]
        try:
            idx = {n: hdr.index(n) for n in ("log", "repeat", "arm", "episode", "planned_kill")}
            lines = lines[1:]
        except ValueError:
            warn("runs.tsv: в заголовке нет требуемых колонок — использую порядок по умолчанию")
    if idx is None:
        warn("runs.tsv: без заголовка — колонки по порядку log,repeat,arm,episode,planned_kill")
        idx = {"log": 0, "repeat": 1, "arm": 2, "episode": 3, "planned_kill": 4}
    rows = {}
    for l in lines:
        cols = l.split("\t")

        def g(name):
            j = idx[name]
            return cols[j].strip() if j < len(cols) else ""

        log = g("log")
        if not log:
            continue
        pk = g("planned_kill").lower() in ("1", "true", "yes", "y")
        rows[log] = {
            "repeat": g("repeat"),
            "arm": g("arm"),
            "episode": g("episode").lower(),
            "planned_kill": 1 if pk else 0,
        }
    return rows


def fnum(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def fmt(x):
    f = float(x)
    return str(int(f)) if f == int(f) else f"{f:.2f}"


sessions_path, runs_path = sys.argv[1], sys.argv[2]
verdicts_path = sys.argv[3] if len(sys.argv) > 3 else None
csv_path = sys.argv[4] if len(sys.argv) > 4 else None

runs = load_runs(runs_path)
sessions = load_jsonl(sessions_path, "sessions.jsonl")

by_base = {}
for k in runs:
    by_base.setdefault(os.path.basename(k), []).append(k)

groups = {}  # (repeat, arm, episode) -> [(session, planned_kill)]
order = []
matched_runs = set()
for ev in sessions:
    log = ev.get("log")
    key = None
    if isinstance(log, str) and log:
        if log in runs:
            key = log
        else:
            cands = by_base.get(os.path.basename(log), [])
            if len(cands) == 1:
                key = cands[0]
                warn(f"сессия смэтчена по basename: {log} -> {key}")
    if key is None:
        warn(f"сессия без матча в runs.tsv (в CSV/агрегаты не попала): {log!r}")
        continue
    r = runs[key]
    matched_runs.add(key)
    g = (r["repeat"], r["arm"], r["episode"])
    if g not in groups:
        groups[g] = []
        order.append(g)
    groups[g].append((ev, r["planned_kill"]))

for k in sorted(runs):
    if k not in matched_runs:
        r = runs[k]
        warn(f"строка runs.tsv без сессии в sessions.jsonl: {k} ({r['repeat']}/{r['arm']}/{r['episode']})")

# ---- по-эпизодный CSV ----
arm_weight = {}
arm_repeats = {}
csv_lines = ["ts,repeat,arm,episode,input,cache_read,output,weight,secs,exit,planned_kill"]
for g in order:
    rep, arm, ep = g
    evs = groups[g]
    ts = str(evs[0][0].get("ts", ""))
    inp = cache = outp = wsum = secs = 0.0
    exits = []
    pk = 0
    for ev, planned in evs:
        tk = ev.get("tokens")
        if not isinstance(tk, dict):
            warn(f"сессия без tokens, считаю нулями: {ev.get('log')!r}")
            tk = {}
        i = fnum(tk.get("input"))
        c = fnum(tk.get("cache_read"))
        o = fnum(tk.get("output"))
        w = i + 0.1 * c + 5.0 * o
        sw = fnum(tk.get("weight"), default=None) if tk.get("weight") is not None else None
        if sw is not None and abs(sw - w) > 0.01:
            warn(f"weight в sessions.jsonl ({fmt(sw)}) != пересчёт по формуле ({fmt(w)}): {ev.get('log')!r} — использую пересчёт")
        inp += i
        cache += c
        outp += o
        wsum += w
        secs += fnum(ev.get("secs"))
        exits.append(str(ev.get("exit")))
        if planned:
            pk = 1
    arm_weight[arm] = arm_weight.get(arm, 0.0) + wsum
    arm_repeats.setdefault(arm, set()).add(rep)
    csv_lines.append(
        ",".join([ts, rep, arm, ep, fmt(inp), fmt(cache), fmt(outp), fmt(wsum), fmt(secs), ";".join(exits), str(pk)])
    )

if csv_path:
    try:
        with open(csv_path, "w", encoding="utf-8") as f:
            f.write("\n".join(csv_lines) + "\n")
    except OSError as e:
        die(f"не пишется costs.csv: {csv_path}: {e}")
    print(f"costs.csv: {len(csv_lines) - 1} эпизодов -> {csv_path}")
else:
    print("\n".join(csv_lines))

# ---- CPSC по рукам ----
verdicts = {}
if verdicts_path:
    for i, ev in enumerate(load_jsonl(verdicts_path, "audit-verdicts.jsonl"), 1):
        rep, arm, v = ev.get("repeat"), ev.get("arm"), ev.get("verdict")
        if not (isinstance(rep, str) and isinstance(arm, str) and isinstance(v, str)):
            warn(f"audit-verdicts.jsonl:{i}: неполная строка, пропущена")
            continue
        v = v.upper()
        if v not in ("PASS", "FAIL"):
            warn(f"audit-verdicts.jsonl:{i}: verdict={v!r} не PASS/FAIL, пропущена")
            continue
        k = (rep, arm)
        if k in verdicts and verdicts[k] != v:
            warn(f"audit-verdicts.jsonl: конфликт вердиктов {rep}/{arm} — консервативно FAIL")
            verdicts[k] = "FAIL"
        else:
            verdicts[k] = v

succ = {}
for arm in sorted(arm_repeats):
    reps = arm_repeats[arm]
    if verdicts_path:
        n_succ = 0
        for (rep, a), v in sorted(verdicts.items()):
            if a != arm:
                continue
            if rep not in reps:
                warn(f"{rep}/{arm}: вердикт есть, смэтченных сессий нет — в знаменатель CPSC не идёт")
                continue
            if v == "PASS":
                n_succ += 1
        for rep in sorted(reps):
            if (rep, arm) not in verdicts:
                warn(f"{rep}/{arm}: сессии есть, вердикта нет — в CPSC считается неуспехом")
        total = arm_weight.get(arm, 0.0)
        if n_succ == 0:
            warn(f"CPSC {arm}: 0 успешных кампаний — деление на ноль, вывод n/a")
            print(f"CPSC {arm}: n/a (0 успешных кампаний)")
        else:
            print(f"CPSC {arm}: {fmt(total / n_succ)}")
    else:
        n = len(reps)
        print(f"CPSC {arm}: {fmt(arm_weight.get(arm, 0.0) / n)} (assume_all_success=true)")
PYEOF
