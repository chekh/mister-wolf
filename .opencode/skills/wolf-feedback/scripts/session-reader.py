#!/usr/bin/env python3
# wolf:rendered base=session-reader.py set=2.26.0
"""Bounded read-only reader for the inspected OpenCode session_v2/session_message schema."""
import argparse
import json
import re
import sqlite3
import sys
from pathlib import Path


def redact(text):
    text = re.sub(r"(?i)(bearer\s+)[\w.\-]+", r"\1<REDACTED>", text)
    return re.sub(r"(?i)((?:api[_-]?key|password|token|secret)\s*[=:]\s*)[^\s,;]+", r"\1<REDACTED>", text)


def summary(raw, maximum):
    if raw is None:
        return {}, ["message data unavailable"]
    if len(raw) > maximum:
        return {}, ["record exceeds max-record; content not parsed"]
    try:
        value = json.loads(raw)
    except (ValueError, RecursionError):
        return {}, ["message data is not a supported JSON object"]
    if not isinstance(value, dict):
        return {}, ["message data is not an object"]
    result = {}
    text = value.get("text", value.get("content"))
    if isinstance(text, str):
        result["excerpt"] = redact(text[:400])
    # Report observed fields only. Missing parts do not prove absent tool calls.
    calls = []
    for part in value.get("parts", []) if isinstance(value.get("parts"), list) else []:
        if not isinstance(part, dict):
            continue
        if part.get("type") == "text" and isinstance(part.get("text"), str):
            result.setdefault("excerpt", redact(part["text"][:400]))
        elif part.get("type") in ("tool", "tool-call", "tool-result"):
            state = part.get("state") if isinstance(part.get("state"), dict) else {}
            calls.append({key: val for key, val in {
                "type": part.get("type"), "call_id": part.get("callID", part.get("call_id")),
                "tool": part.get("tool"), "status": state.get("status", part.get("status")),
            }.items() if isinstance(val, (str, int, float))})
    if calls:
        result["tool_events"] = calls[:20]
    tokens = value.get("tokens")
    if isinstance(tokens, dict):
        result["reported_tokens"] = {k: tokens[k] for k in ("input", "output", "reasoning")
                                     if isinstance(tokens.get(k), (int, float)) and not isinstance(tokens[k], bool)}
        cache = tokens.get("cache")
        if isinstance(cache, dict):
            result["reported_cache"] = {k: cache[k] for k in ("read", "write")
                                         if isinstance(cache.get(k), (int, float))}
    return result, []


def read(args):
    path = Path(args.db).expanduser().resolve()
    if not path.is_file():
        raise ValueError("database does not exist")
    with sqlite3.connect(path.as_uri() + "?mode=ro", uri=True) as db:
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA query_only=ON")
        db.execute("BEGIN")
        tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        required = {
            "session_v2": {"id", "parent_id", "time_created"},
            "session_message": {"id", "session_id", "type", "time_created", "data"},
        }
        for table, fields in required.items():
            if table not in tables:
                raise ValueError("unsupported schema: missing " + table)
            columns = {r[1] for r in db.execute("PRAGMA table_info(" + table + ")")}
            if not fields <= columns:
                raise ValueError("unsupported schema: missing columns in " + table)
        row = db.execute("SELECT id,parent_id,time_created FROM session_v2 WHERE id=?", (args.session,)).fetchone()
        if row is None:
            raise ValueError("session not found; no latest-session fallback was selected")
        sessions = [dict(row)]
        seen = {args.session}
        gaps = ["No cross-session token totals are calculated.",
                "Only session_message.data is read; separate part tables and unavailable fields are not reconstructed.",
                "Excerpts are bounded and best-effort redacted; this is not a safe-export archive."]
        if args.children:
            frontier = [args.session]
            while frontier:
                parent = frontier.pop(0)
                children = db.execute("SELECT id,parent_id,time_created FROM session_v2 WHERE parent_id=? ORDER BY id LIMIT 33", (parent,)).fetchall()
                for child in children:
                    if child["id"] in seen:
                        continue
                    if len(sessions) >= 32:
                        gaps.append("child session coverage limited to 32 sessions")
                        frontier = []
                        break
                    seen.add(child["id"])
                    sessions.append(dict(child))
                    frontier.append(child["id"])
        parents = {s["id"]: s["parent_id"] for s in sessions}
        placeholders = ",".join("?" for _ in sessions)
        query = ("SELECT id,session_id,type,time_created,length(data) AS data_chars,"
                 "substr(data,1,?) AS data FROM session_message WHERE session_id IN (" + placeholders + ") "
                 "ORDER BY time_created,id LIMIT ? OFFSET ?")
        params = [args.max_record + 1] + [s["id"] for s in sessions] + [args.limit + 1, args.offset]
        rows = db.execute(query, params).fetchall()
        more = len(rows) > args.limit
        records = []
        for item in rows[:args.limit]:
            selected, record_gaps = summary(item["data"], args.max_record)
            records.append({
                "locator": {"database": str(path), "table": "session_message", "id": item["id"]},
                "session_id": item["session_id"], "parent_id": parents[item["session_id"]],
                "record_type": item["type"], "created_ms": item["time_created"],
                "author_interpretation": "parent_or_injected" if item["type"] == "user" and parents[item["session_id"]]
                else "user_or_injected" if item["type"] == "user" else "reported_record_type",
                "data_chars": item["data_chars"], "observed": selected, "gaps": record_gaps,
            })
        return {"session": args.session, "sessions": sessions, "records": records,
                "next_offset": args.offset + args.limit if more else None, "limits": gaps}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True)
    parser.add_argument("--session", required=True)
    parser.add_argument("--children", action="store_true")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--max-record", type=int, default=16384)
    args = parser.parse_args()
    if not 1 <= args.limit <= 100 or not 0 <= args.offset <= 1000000 or not 256 <= args.max_record <= 65536:
        parser.error("limit must be 1..100, offset 0..1000000, max-record 256..65536")
    try:
        result = read(args)
    except (ValueError, sqlite3.Error, OSError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        return 2
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
