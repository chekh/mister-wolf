"""Deterministic project gate for the isolated fixture."""
from pathlib import Path
import subprocess
import sys

result = subprocess.run(
    [sys.executable, str(Path(__file__).with_name('start.py'))],
    capture_output=True,
    text=True,
    check=True,
)
assert result.stdout.strip() == 'atlas: healthy'
print('project gate: PASS')
