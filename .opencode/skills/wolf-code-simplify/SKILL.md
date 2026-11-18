---
name: wolf-code-simplify
description: 'Apply on an assigned simplification task or when concrete needless complexity needs a separate examination. Preserves behavior and contracts; not a mandatory stage after every edit.'
---
<!-- wolf:rendered base=SKILL.md set=3.2.0 -->

# Simplifying existing code

Eliminate the concrete complexity, preserving necessary behavior. The result must be easier to understand, use or change.

Work in the assigned scope. The reviewer evaluates and proposes; an authorized executor edits.

## 1. Name the problem

Identify what exactly gets in the way: rule repetition, needless indirection, a convoluted flow, redundant state or a complex consumer protocol.

A mere chance to shorten lines is not enough. If the problem is unclear, do not start a rewrite.

## 2. Establish the contract to preserve

Use the requirements, tests and consumers. Account for the relevant properties:

- results and errors;
- material side effects and their order;
- state and resource management;
- compatibility, concurrency and transaction guarantees;
- necessary performance characteristics.

The absence of a test does not mean the absence of an obligation. Substantial uncertainty needs an addressed verification or clarification before transformation.

Separate a discovered defect from the refactoring: fixing behavior requires corresponding scope and verification.

## 3. Choose the transformation

Apply a direct means against the established problem:

- a repeated rule → one place of its definition;
- needless state → computation from a reliable source;
- convoluted nesting → explicit branches or an early exit;
- a repeated protocol → an operation owning its guarantees;
- a useless layer → removal without shifting complexity to consumers;
- a hand-rolled mechanism → a suitable existing means;
- dead code → removal after sufficient consumer verification.

Preserve useful safety, compatibility and testability boundaries. Account for external, dynamic and configuration calls per project structure; the absence of a textual match may not suffice for removal.

Do not mix the transformation with unrelated moves, renames and formatting.

## 4. Verify preservation and benefit

Carry out applicable verifications and the project's mandatory gates. When I/O or state changes, verify corresponding guarantees, not only the return value.

Compare the result with the original problem:

- complexity has actually decreased;
- no new obligation has been added for consumers;
- behavior and guarantees are preserved;
- the code has not become denser at the cost of clarity.

If the benefit is doubtful, do not include the transformation in the result. If contract preservation is not confirmed, do not declare the work complete.

Stop after eliminating the assigned complexity. Return the transformation's essence and evidence as a RESULT per your role contract.

In review, distinguish a proven defect from an optional recommendation; apply project rules and severity in force.
