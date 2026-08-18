#!/usr/bin/env python3
"""cost-aggregate.py — агрегация COST-001: токены по прогонам из SQLite opencode.

Читает logs/cost-markers.jsonl ({task,type,iter,start_ms,end_ms}),
суммирует токены сессий в окне каждого прогона, считает overhead
(FLAT vs ORCH) в двух срезах и скорость выгорания лимита.
"""
import json
import sqlite3
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = Path.home() / ".local/share/opencode/opencode.db"

WOLF_TREE = ("wolf-%", "executor-%", "worker-%")
AGENTS = ("flat-worker", "wolf-coordinator", "executor-lead", "worker-implementer",
          "worker-reviewer", "worker-researcher")


def window(db: sqlite3.Connection, start: int, end: int):
    in_clause = ",".join("?" * len(AGENTS))
    q = (
        """
    SELECT s.agent,
           COUNT(DISTINCT s.id),
           SUM(CAST(json_extract(p.data,'$.tokens.input') AS INTEGER)),
           SUM(CAST(json_extract(p.data,'$.tokens.output') AS INTEGER)),
           SUM(CAST(json_extract(p.data,'$.tokens.cache.read') AS INTEGER))
    FROM part p
    JOIN message m ON m.id = p.message_id
    JOIN session s ON s.id = m.session_id
    WHERE p.data LIKE '%"step-finish"%'
      AND s.time_created BETWEEN ? AND ?
      AND s.agent IN ("""
        + in_clause
        + ")\n    GROUP BY s.agent"
    )
    return db.execute(q, (start - 2000, end, *AGENTS)).fetchall()


def main() -> int:
    rows = [json.loads(l) for l in (ROOT / "logs/cost-markers.jsonl").read_text().splitlines() if l.strip()]
    db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    runs = {}
    print("| прогон | тип | длит., мин | сессий | агенты | in | out | cache_read | in+out | полный |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    for m in rows:
        agg = window(db, m["start_ms"], m["end_ms"])
        flat = [a for a in agg if a[0] == "flat-worker"]
        is_flat = m["type"] == "flat"
        # в FLAT-окне не должно быть wolf-сессий (контроль чистоты)
        wolf_leak = [a for a in agg if a[0].startswith(WOLF_TREE)] if is_flat else []
        t_in = sum(a[2] or 0 for a in agg)
        t_out = sum(a[3] or 0 for a in agg)
        t_cache = sum(a[4] or 0 for a in agg)
        dur = (m["end_ms"] - m["start_ms"]) / 60000
        key = (m["task"], m["type"])
        runs.setdefault(key, []).append(
            dict(in_=t_in, out=t_out, cache=t_cache, new=t_in + t_out, full=t_in + t_out + t_cache,
                 dur=dur, sessions=sum(a[1] for a in agg), leak=bool(wolf_leak))
        )
        agents = ", ".join(f"{a[0]}×{a[1]}" for a in sorted(agg))
        leak_mark = " ⚠️УТЕЧКА" if wolf_leak else ""
        print(f"| {m['task']}-{m['iter']} | {m['type']}{leak_mark} | {dur:.1f} | {sum(a[1] for a in agg)} "
              f"| {agents} | {t_in:,} | {t_out:,} | {t_cache:,} | {t_in+t_out:,} | {t_in+t_out+t_cache:,} |")

    print("\n### Сводка по задачам (среднее по итерациям)\n")
    print("| задача | flat new | orch new | overhead_new | flat full | orch full | overhead_full | flat сесс. | orch сесс. | flat мин | orch мин |")
    print("|---|---|---|---|---|---|---|---|---|---|---|")
    verdicts = []
    for task in sorted({k[0] for k in runs}):
        f = runs.get((task, "flat"), [])
        o = runs.get((task, "orch"), [])
        if not f or not o:
            continue
        f_new = statistics.mean(r["new"] for r in f)
        o_new = statistics.mean(r["new"] for r in o)
        f_full = statistics.mean(r["full"] for r in f)
        o_full = statistics.mean(r["full"] for r in o)
        oh_new = (o_new - f_new) / f_new * 100
        oh_full = (o_full - f_full) / f_full * 100
        f_sess = statistics.mean(r["sessions"] for r in f)
        o_sess = statistics.mean(r["sessions"] for r in o)
        f_min = statistics.mean(r["dur"] for r in f)
        o_min = statistics.mean(r["dur"] for r in o)
        print(f"| {task} | {f_new:,.0f} | {o_new:,.0f} | {oh_new:+.0f}% | {f_full:,.0f} | {o_full:,.0f} "
              f"| {oh_full:+.0f}% | {f_sess:.1f} | {o_sess:.1f} | {f_min:.1f} | {o_min:.1f} |")
        verdicts.append((task, oh_new, oh_full))
    print("\n### Вердикты (порог: <20% — по умолчанию; 20–50% — селективно; >50% — только длинные циклы)")
    for task, oh_new, oh_full in verdicts:
        band = "по умолчанию" if oh_new < 20 else ("селективно" if oh_new <= 50 else "только длинные циклы")
        print(f"- {task}: overhead_new {oh_new:+.0f}%, overhead_full {oh_full:+.0f}% → иерархия: {band}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
