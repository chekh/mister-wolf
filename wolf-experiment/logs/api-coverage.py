#!/usr/bin/env python3
"""api-coverage.py — % спецификации LONG-002 по приложениям A и B спеки.

Usage: python3 api-coverage.py <iter_dir>
Печатает: API: found/40 (missing: ...); TESTS: found/56 (missing: ...)
"""
import re
import subprocess
import sys
from pathlib import Path

d = Path(sys.argv[1])
spec = (d / "spec.md").read_text()

app_a = spec.split("Приложение A")[1].split("Приложение B")[0]
app_b = spec.split("Приложение B")[1].split("## Приёмка")[0]

api_items = re.findall(r"\((\d+)\)\s+(?:class\s+(\w+)|def\s+(\w+))", app_a)
test_items = re.findall(r"\b(test_[a-z0-9_]+)\b(?!\.py)", app_b)
tests_unique = sorted(set(test_items))


def grep(pattern: str, path: Path) -> bool:
    r = subprocess.run(["grep", "-rqE", pattern, str(path)], capture_output=True)
    return r.returncode == 0


api_found, api_missing = 0, []
for n, cls, fn in api_items:
    name = cls or fn
    if grep(rf"(class|def)\s+{name}\b", d / "nanohttp"):
        api_found += 1
    else:
        api_missing.append(f"{n}:{name}")

test_found, test_missing = 0, []
for t in tests_unique:
    if grep(rf"def\s+{t}\b", d / "tests"):
        test_found += 1
    else:
        test_missing.append(t)

print(f"API: {api_found}/{len(api_items)}"
      f" ({api_found / len(api_items) * 100:.0f}%)"
      f" missing: {' '.join(api_missing) if api_missing else '—'}")
print(f"TESTS: {test_found}/{len(tests_unique)}"
      f" ({test_found / len(tests_unique) * 100:.0f}%)"
      f" missing: {' '.join(test_missing[:8]) if test_missing else '—'}"
      f"{' …' if len(test_missing) > 8 else ''}")
