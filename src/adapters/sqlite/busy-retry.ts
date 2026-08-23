const DELAYS_MS = [50, 100, 200, 400];

function sleepSync(ms: number): void {
  const end = Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  // Atomics.wait returns 'timed-out' on timeout, 'ok' if notified — either way we're done
}

export function runWithBusyRetry<T>(fn: () => T, attempts: number = 5): T {
  for (let i = 0; i < attempts; i++) {
    try {
      return fn();
    } catch (err: any) {
      if (err?.message?.includes('SQLITE_BUSY') && i < DELAYS_MS.length) {
        sleepSync(DELAYS_MS[i]);
        continue;
      }
      throw err;
    }
  }
  // last attempt (attempts=5 but DELAYS_MS has 4 delays, so 5th call has no delay)
  return fn();
}
