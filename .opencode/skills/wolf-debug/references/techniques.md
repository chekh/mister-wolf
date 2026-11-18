<!-- wolf:rendered base=techniques.md set=3.2.0 -->
# Addressed diagnostic techniques

Choose the technique that fits the assigned question. It does not widen
mandate or scope.

| Difficulty | Technique | Sufficient result |
| --- | --- | --- |
| The error surfaces deeper than the cause | Walk backward from the wrong value to where it was produced; at each boundary, compare input, transformation and output | First confirmed boundary where a known contract is violated |
| Several components | Put minimal diagnostics on suspected boundaries, passing a correlation ID and payload/secret-free metadata | Sender, transmission or receiver error discriminated |
| A test fails only in the suite | Reproduce the order, narrow the preceding set by bisection; check shared file, env, cache, timing, cleanup | A minimal pair/sequence and broken isolation |
| An asynchronous result is expected | Wait on an observable condition with a finite timeout and last-state diagnostics | Condition met, or a timeout with evidence; a longer sleep is not evidence of a fix |

In finding the polluting test the actual order matters; bisection does not
guarantee a result with several joint causes. A negative experiment is
useful. Do not run endless test runs; the executor returns a new
method to the requester. Remove temporary diagnostics once the evidence is
preserved.

A waiting example: the process must register an event with a known ID. Check
for this event's arrival before the deadline; record the absence and last
state. Do not count waiting itself as a successful verification. If the
system gives no observable condition, clarify the contract or assign bounded
diagnostics.
