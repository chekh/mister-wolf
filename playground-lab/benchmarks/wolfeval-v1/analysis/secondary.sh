#!/usr/bin/env bash
# secondary.sh — WolfEval v1 scorer: вторичные метрики по эпизодам (спека §6.2).
#
# usage: secondary.sh <sessions.jsonl> <runs.tsv> [логи…]
#
# Детерминированный (bash+python3, НЕ LLM). Аудит не запускается.
#
# Входы (схемы — analysis/README.md):
#   sessions.jsonl — строки лаунчера wolf-session.sh.
#   runs.tsv       — манифест атрибуции: log, repeat, arm, episode, planned_kill.
#   [логи…]        — дополнительные пути логов сессий (JSONL opencode);
#                    атрибуция — только если путь есть в runs.tsv.
#
# Выход: secondary.jsonl (в ТЕКУЩЕМ каталоге) — по строке на эпизод
# (repeat, arm, episode; E5-пара агрегируется в один эпизод):
#   {"repeat","arm","episode",
#    "first_pass":0|1,        # 1 ⟺ ровно один запуск эпизода, exit=0, токены
#                             #   не нулевые и нет invalid-признаков (F21/F22/F25);
#                             #   второй запуск E5 (planned_kill+восстановление)
#                             #   и invalid-прогоны → first_pass=0
#    "wall_clock":сек,        # сумма secs запусков эпизода
#    "input","cache_read","output",  # суммы токенов по компонентам
#    "iterations":n,          # число tool-вызовов в логе(ах) эпизода
#    "memory_contact":n,      # WOLF: tool-вызовы с именем mr[-_]wolf*;
#                             #   BASE: tool-вызовы read/edit/write/grep/glob/cat,
#                             #   в строке которых есть NOTES.md или /notes/
#    "duplicate_work":n|null, # только эпизоды-потребители: e2/e3 — счёт
#                             #   read-обращений (read/grep/glob/cat) к зоне
#                             #   производителя E1 (src/app/use-cases/
#                             #   init-project.ts, src/adapters/); e6b — к зоне
#                             #   E6a (scripts/bench/lib.sh). Выше счёт = больше
#                             #   повторного исследования. Иначе null.
#    "stale_usage":0|1|null,  # только E4+ (e4,e5,e6a,e6b): флаг «ассистентский
#                             #   text лога утверждает старое правило init…scan»
#                             #   (regex как в campaign-audit; консервативно:
#                             #   отрицания вроде «init не сканирует» тоже
#                             #   флагуются — триаж за человеком). Иначе null.
#    "symmetry_e6":0|1|null}  # только e6a/e6b: 1 ⟺ в логах ОБЕИХ эпизодов
#                             #   кампании (repeat,arm) есть упоминание
#                             #   XDG/изоляции (regex XDG|изол, без учёта
#                             #   регистра). Метод — по логам, не по коду
#                             #   инстанса (у скорера нет инстанса); помечен
#                             #   как консервативный в README.
# stdout: число эпизодов + строки «SYM E6 <repeat>/<arm>: 1|0|n/a».
#
# Выход: 0 — ок; 1 — фатальная ошибка; 2 — usage.
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: secondary.sh <sessions.jsonl> <runs.tsv> [логи…]" >&2
  exit 2
fi
command -v python3 >/dev/null 2>&1 || { echo "secondary.sh: python3 недоступен" >&2; exit 1; }

python3 - "$@" <<'PYEOF'
import json
import os
import re
import sys

SELF = "secondary.sh"
MRWOLF_RE = re.compile(r"mr[-_]?wolf", re.I)
NOTES_RE = re.compile(r"NOTES\.md|(^|/)notes/", re.I)
STALE_RE = re.compile(r"init.{0,120}(авто-?скан|сканир|auto-?scan|scan at init|scans)", re.I | re.S)
XDG_RE = re.compile(r"XDG|изол", re.I)
READ_TOOLS = {"read", "grep", "glob", "cat"}
MEMORY_BASE_TOOLS = {"read", "edit", "write", "grep", "glob", "cat"}
CONSUMER_ZONES = {
    "e2": ("src/app/use-cases/init-project.ts", "src/adapters/"),
    "e3": ("src/app/use-cases/init-project.ts", "src/adapters/"),
    "e6b": ("scripts/bench/lib.sh",),
}
STALE_EPISODES = ("e4", "e5", "e6a", "e6b")


def warn(msg):
    print(f"{SELF}: {msg}", file=sys.stderr)


def die(msg):
    print(f"{SELF}: {msg}", file=sys.stderr)
    sys.exit(1)


def read_text(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return None


def load_jsonl(path, what):
    text = read_text(path)
    if text is None:
        die(f"не читается {what}: {path}")
    out = []
    for i, raw in enumerate(text.splitlines(), 1):
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
    text = read_text(path)
    if text is None:
        die(f"не читается runs.tsv: {path}")
    lines = [l for l in text.splitlines() if l.strip()]
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


def parse_log(path):
    texts, tools = [], []
    text = read_text(path)
    if text is None:
        return texts, tools
    for raw in text.splitlines():
        s = raw.strip()
        if not s.startswith("{"):
            continue
        try:
            ev = json.loads(s)
        except ValueError:
            continue
        if not isinstance(ev, dict):
            continue
        part = ev.get("part") if isinstance(ev.get("part"), dict) else {}
        tt = str(ev.get("type") or "")
        pt = str(part.get("type") or "")
        if "tool" in tt.lower().replace("-", "_") or "tool" in pt.lower().replace("-", "_"):
            name = str(part.get("tool") or ev.get("tool") or "")
            if not name:
                state = part.get("state") if isinstance(part.get("state"), dict) else {}
                name = str(state.get("tool") or "")
            tools.append((name, s))
        if pt == "text" and isinstance(part.get("text"), str) and part["text"].strip():
            texts.append(part["text"])
        elif tt == "message":
            info = ev.get("info") if isinstance(ev.get("info"), dict) else {}
            if info.get("role") == "assistant" and isinstance(info.get("content"), list):
                for c in info["content"]:
                    if isinstance(c, dict) and c.get("type") == "text" and str(c.get("text", "")).strip():
                        texts.append(str(c["text"]))
    return texts, tools


def fnum(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def icode(ev):
    try:
        return int(ev.get("exit"))
    except (TypeError, ValueError):
        return None


def invalid_reasons(ev, planned_kill):
    reasons = []
    ex = icode(ev)
    if ex == 124 and not planned_kill:
        reasons.append("F21")
    if ex == 2:
        reasons.append("F25")
    tk = ev.get("tokens")
    if isinstance(tk, dict) and tk:
        try:
            vals = [float(tk.get(k) or 0) for k in ("input", "cache_read", "output")]
            if not any(vals):
                reasons.append("F22")
        except (TypeError, ValueError):
            pass
    return reasons


sessions_path, runs_path = sys.argv[1], sys.argv[2]
extra_logs = sys.argv[3:]

runs = load_runs(runs_path)
sessions = load_jsonl(sessions_path, "sessions.jsonl")

by_base = {}
for k in runs:
    by_base.setdefault(os.path.basename(k), []).append(k)

ep_rows = {}  # (repeat, arm, episode) -> [(ts, session, planned_kill)]
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
        warn(f"сессия без матча в runs.tsv (не атрибутирована): {log!r}")
        continue
    r = runs[key]
    g = (r["repeat"], r["arm"], r["episode"])
    ep_rows.setdefault(g, []).append((str(ev.get("ts") or ""), ev, r["planned_kill"]))

# symmetry_e6: по кампаниям (repeat, arm), у которых есть строки e6a/e6b
sym = {}
for g in ep_rows:
    rep, arm, ep = g
    if ep in ("e6a", "e6b"):
        sym.setdefault((rep, arm), {})[ep] = g
sym_value = {}
for k, sides in sorted(sym.items()):
    if "e6a" not in sides or "e6b" not in sides:
        for ep in sides:
            sym_value[(sides[ep][0], sides[ep][1], ep)] = None
        continue
    mentioned = {}
    for ep, g in sides.items():
        mentioned[ep] = False
        for _, ev, _ in sorted(ep_rows[g], key=lambda t: t[0]):
            lp = ev.get("log")
            if not lp:
                continue
            texts, tools = parse_log(lp)
            for t in texts:
                if XDG_RE.search(t):
                    mentioned[ep] = True
            for _, raw in tools:
                if XDG_RE.search(raw):
                    mentioned[ep] = True
    val = 1 if (mentioned.get("e6a") and mentioned.get("e6b")) else 0
    for ep, g in sides.items():
        sym_value[g] = val

out = []
for g in sorted(ep_rows):
    rep, arm, ep = g
    rows = sorted(ep_rows[g], key=lambda t: t[0])
    n_runs = len(rows)
    inp = cache = outp = secs = 0.0
    iterations = 0
    memory_contact = 0
    duplicate_work = None
    stale_usage = None
    texts_all = []
    tools_all = []
    any_invalid = False
    for ts, ev, pk in rows:
        tk = ev.get("tokens") if isinstance(ev.get("tokens"), dict) else {}
        inp += fnum(tk.get("input"))
        cache += fnum(tk.get("cache_read"))
        outp += fnum(tk.get("output"))
        secs += fnum(ev.get("secs"))
        if invalid_reasons(ev, pk):
            any_invalid = True
        lp = ev.get("log")
        if not lp:
            continue
        texts, tools = parse_log(lp)
        texts_all.extend(texts)
        tools_all.extend(tools)
    iterations = len(tools_all)
    for name, raw in tools_all:
        if arm == "WOLF" and MRWOLF_RE.search(name or ""):
            memory_contact += 1
        elif arm == "BASE" and name.lower() in MEMORY_BASE_TOOLS and NOTES_RE.search(raw):
            memory_contact += 1
    if ep in CONSUMER_ZONES:
        zones = CONSUMER_ZONES[ep]
        duplicate_work = sum(
            1 for name, raw in tools_all if name.lower() in READ_TOOLS and any(z in raw for z in zones)
        )
    if ep in STALE_EPISODES:
        stale_usage = 1 if any(STALE_RE.search(t) for t in texts_all) else 0
    first_pass = 1 if (n_runs == 1 and icode(rows[0][1]) == 0 and not any_invalid) else 0
    out.append(
        {
            "repeat": rep,
            "arm": arm,
            "episode": ep,
            "first_pass": first_pass,
            "wall_clock": int(secs) if secs == int(secs) else round(secs, 2),
            "input": int(inp) if inp == int(inp) else round(inp, 2),
            "cache_read": int(cache) if cache == int(cache) else round(cache, 2),
            "output": int(outp) if outp == int(outp) else round(outp, 2),
            "iterations": iterations,
            "memory_contact": memory_contact,
            "duplicate_work": duplicate_work,
            "stale_usage": stale_usage,
            "symmetry_e6": sym_value.get(g),
        }
    )

try:
    with open("secondary.jsonl", "w", encoding="utf-8") as f:
        for r in out:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
except OSError as e:
    die(f"не пишется secondary.jsonl: {e}")

print(f"secondary.jsonl: {len(out)} эпизодов")
for k in sorted(sym):
    rep, arm = k
    sides = sym[k]
    if "e6a" in sides and "e6b" in sides:
        v = sym_value.get(sides["e6a"])
        print(f"SYM E6 {rep}/{arm}: {v}")
    else:
        missing = "e6b" if "e6a" in sides else "e6a"
        print(f"SYM E6 {rep}/{arm}: n/a (нет строк эпизода {missing})")
PYEOF
