---
name: wolf-testplan
description: "Apply before executing a FULL plan, when preparing verifications of new behavior, when acceptance criteria or risks change; in LITE/FIX — when the verifiable result needs to be defined."
---
<!-- wolf:rendered base=SKILL.md set=3.1.1 -->

# Requirements → verification plan

## Mandatory input

Read the AC in force, the approved design or authorized brief. The lead owns the overall test plan; the assigned investigation is the lead's or an executor's. In FULL, keep the test-plan.md structure: scenarios per REQ, test runs. State links to NFR and the plan without reinventing ACs. Empty template scenarios are not coverage. This skill composes the verification plan; it does not confirm verifications pass.

Separate mandatory requirements from conditional ones; carry out a conditional one when its grounds exist.


## Input and output

Input: approved requirements/design or a LITE/FIX brief; the baseline, existing tests, the project profile. Output: test-plan.md, the map REQ/NFR → scenarios → tasks/files. A test-plan is not an implemented or passed test.

## Process

1. From each AC derive a verifiable claim; take the expected result from the requirement, an invariant or an external oracle, not from the proposed code.
2. Describe Given/When/Then or an equivalent: preconditions, action, expectation, oracle grounds, data, the unit/integration/e2e/manual level, existing/planned test path.
3. Check positive, negative and boundary cases, compatibility, recovery from partial failure. For concurrency, check races/retries/ordering; for memory — supersede, an unavailable index, currency, isolation, wherever the contract requires it.
4. Record risks outside the AC as derived verification from an existing REQ/NFR or invariant. A test requiring new behavior → propose a CR; do not change the AC yourself.
5. For NFR, set load, environment, threshold, measurement method, acceptable variability. Do not declare the number of REQ with a test to be evidence of behavioral completeness.
6. Define setup/cleanup, fixture isolation; no real secrets or external side effects without authorization. For flakiness, use reproducible seeds and controlled time; do not hide instability with retries.
7. Write the targeted/full commands from the project profile and required evidence. For manual verification, define a reproducible procedure and result.
8. Cross-check against the plan. Return an unverifiable AC or design deficiency to its author; submit for coverage and risk review.

## Choosing sufficient verifications

Distinguish mandatory project gates, checks of affected behavior and exploratory probes of a specific risk; for a significant scenario, state the error it detects and why the level suffices. Use existing coverage; the same business scenario at different levels is acceptable when they catch different interaction failures. Do not duplicate tests for the count.

Choose boundaries/equivalence classes for ranges, decision tables for rule combinations, state transitions for sequences, properties for invariants and transformations. These are available techniques, not mandatory sections. Unit suits pure logic, integration — boundaries, e2e — substantial end-to-end behavior. Cheapness does not justify a mock over a risky integration. An inapplicable verification type needs no separate line; exempting a mandatory requirement stays negotiable per policy.

## Readiness

All REQ/NFR are covered or have agreed exemption grounds; the oracle and environment are known; dependent tasks include test work. The executor starts a new behavior/fix with a defect-sensitive verification per test-driven-development.

## Transition gate

Before execution, expected results are known independently of implementation, as are input data, environment, commands or manual procedures and task links. Return a requirement gap to wolf-brainstorm, a design gap to wolf-design; agree a new AC through a CR. Hand verification implementation to the executor role with test-driven-development.

## Do not skip the process

| Thought | Action |
| --- | --- |
| "There is a line for every REQ, so everything is covered" | Check errors, boundaries and risks, not the number of lines. |
| "I will take the expectation from the code" | The grounds are the requirement or an independent oracle. |
| "Manual verification needs no description" | State the steps, data, result and constraints. |

Test-quality techniques — test-driven-development/references/test-quality.md; event-based
waiting and cause isolation — wolf-debug/references/techniques.md; load as needed.
