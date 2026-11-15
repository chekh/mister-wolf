---
name: wolf-code-craft
description: 'Apply when writing or changing code: fully implement the assigned behavior with clear means, without needless complexity. Use as evaluation criteria in review, within the mandate.'
---

# Implementation quality

First meet the requirements and preserve necessary guarantees. Among suitable solutions choose the clearest consistent one. Shorten code and dependencies when this does not worsen these conditions.

Work per the TASK, accepted design and verification skill in force. The skill does not widen the role's mandate.

## Before editing

Read the affected code and needed consumer contracts. Find existing project means and conventions.

Determine where the change must reach: calls, types, configuration, exports, tests, documentation — by actual relation to the task. Return a needed edit outside the permitted scope to the lead.

Clarify substantial ambiguity in requirements. Do not silently cut functionality for a convenient implementation.

## Choose the direct path

Use the first sufficient way:

1. An existing project solution, or fixing the common source of the error.
2. A standard library or platform solution, given the project's rules.
3. A suitable installed dependency.
4. Direct implementation of the missing behavior.

Evaluate a new dependency by benefit and maintenance cost; follow project procedure to add it. Do not write a complex counterpart of a library just because a package is missing.

Limit the search for a ready means to a reasonable task scope.

## Build an understandable implementation

- Use domain names, familiar language means and explicit control flow.
- Keep related actions together; do not split code for function or file size.
- Extract a function when it names a material operation, hides complexity or concentrates a common rule.
- Do not create a layer that only renames a call without a useful contract or boundary.
- Remove needless data transformations, intermediate state and nesting.
- Do not add modes, settings or extension points without current grounds.
- Comment the non-obvious cause, constraint or invariant; follow project documentation requirements.

Several explicit lines beat an expression needing deciphering. Line count and a minimal diff are not goals in themselves.

## Structure and completeness

In scope, local structure may be improved if keeping it requires duplication, workarounds or breaks guarantees. Hand rework of shared contracts and architecture to the responsible level.

When fixing a defect, eliminate the confirmed cause and consider other affected calls. Do not multiply the workaround across consumers.

Preserve necessary validation, access rights, error handling, resource management, compatibility and state guarantees. Do not turn a failure into a successful response or empty result without grounds in the contract.

Do not add defensive branches for states excluded by a reliable contract. Verify untrusted inputs and external data at corresponding boundaries.

Do not merge similar code that expresses independently changing rules.

## Verification and completion

Apply test-driven-development when a test can describe behavior before the change.

Apply the testing skill in force and mandatory project verifications. Verify behavior, substantial boundaries and regression, rather than reproducing the implementation in tests.

If assigned verifications do not cover substantial behavior changes, add an addressed verification within the mandate or state the gap to the requester.

Review the diff: requirements reached consumers, no accidental changes, and new constructions have a clear reason. Eliminate needless complexity found within the current mandate; a separate wolf-code-simplify pass is not required.

Return the result and evidence in the role's standard format.

## Use in review

A preference for a different form of code is not a defect on its own. For a remark, state the violated requirement, the accepted rule or the concrete consequence.

A recommendation without a proven blocking violation does not block acceptance. Follow the severity scale in force; do not introduce your own.
