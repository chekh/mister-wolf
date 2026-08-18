"""Quick verification of rate_limiter.py"""
import sys
sys.path.insert(0, "cost/T2/orch-2")
from rate_limiter import RateLimiter, RateLimitError

rl = RateLimiter(2, 10.0, clock=lambda: 100.0)
rl.acquire("a")
rl.acquire("a")
try:
    rl.acquire("a")
    print("FAIL: no exception")
except RateLimitError:
    print("OK: RateLimitError raised")
