---
name: test-driven-development
description: "Apply before implementing new behavior or fixing a defect; in contract-preserving refactoring and when verifying changes written before tests."
---
<!-- wolf:rendered base=SKILL.md set=3.2.0 -->

# Test discipline of execution

## Mandatory input

The executor gets ACs, an allowlist and project commands. The lead assigns the discipline and accepts the evidence; the executor does the assigned work: writes and runs the domain test on its own in its TASK. New behavior requires an observable RED run before implementation; existing behavior allows a green baseline test at once. Choose the verification kind by contract: do not make documentation imitate a code unit test.

Distinguish mandatory requirements from conditional ones; carry out a conditional one when its grounds are present.


## Input

The executor gets the assigned ACs, test-plan scenarios, an allowlist, and project profile commands. Read the necessary existing code. Do not change ACs or add product features for testing convenience without approval.

## New behavior and defect fixes

1. Write a minimal test of the observable contract with an independent expected result. For a defect, reproduce the original symptom.
2. Run RED. Verify the cause is the missing/wrong behavior, not a typo, broken setup, or unavailable dependency. A missing public interface is acceptable at first; once it exists, the test must verify the behavior.
3. Write the minimal implementation; run GREEN and related regressions. Do not weaken an assertion for a green result; fix the test's own failure with a rationale.
4. Refactor in the task, keeping the green tests passing. Record RED/GREEN evidence and regression scope.

## Existing behavior and refactoring

Characterization tests may pass right away: they capture the baseline. Then verify the change preserves the contract. Do not require artificially breaking working code for each such test. Confirm an important regression test's sensitivity on the original version or by an isolated temporary defect reintroduction; do not roll back others' changes.

## If code is already written

Do not delete the result automatically. Preserve it, marking the process deviation; for new behavior, code-first is a documented deviation the lead must take through test quality review (at minimum DONE_WITH_CONCERNS), not a silent norm. Add independent tests per requirements. For a defect fix, show the baseline failure and the pass on current code. If impossible, state the confidence limit and return to the requester. Do not invent RED history.

## A proportionate way to verify

Choose the test by assigned behavior and test-plan risk. Techniques and levels are per wolf-testplan; do not run all test types just for TDD discipline. If the expected contract is unknown, ask the requester before inventing it in an assertion. Mandatory RED/GREEN and project regressions remain per applicability.

## Test quality

Test the public behavior, boundaries, errors and invariants; do not require a separate test per internal function. Use mocks for external boundaries, keeping an integration test where the interaction carries risk. Fixtures must be isolated, seed/time controllable, cleanup safe. Do not test only your own mock's configuration.

For documentation, configurations and generation, choose a validator, snapshot, smoke, or reproducible manual verification. Skipping a relevant automated verification must have grounds in the project policy, not a mandatory owner question for every little thing.

## Readiness

ACs are covered, the original defect was reproduced, new tests are sensitive to wrong behavior, related regressions have passed or a constraint is stated explicitly. A RESULT does not replace independent review and acceptance. Commit rights follow the TASK and the Git policy in force.

## Transition gate

RED/GREEN refer to one verifiable property and known versions. Do not weaken a requirement for GREEN or invent a past failure. Preserve code-first safely, state the deviation and verify sensitivity on the baseline; the requester addresses the concerns. After verification, request the needed independent review.

## Do not skip the process

| Thought | Action |
| --- | --- |
| "The change is too small to test" | Diff size does not determine behavior risk. |
| "The test failed because of setup — that is RED" | A failure against the verifiable contract is needed. |
| "I will delete finished code for process's sake" | Preserve the result and honestly verify the baseline; do not destroy the work. |

## Addressed techniques

For an independent expected result, sensitivity and reasonable mocks, read references/test-quality.md when needed. Do not run all techniques just for TDD; one test must catch a specific behavior defect.
