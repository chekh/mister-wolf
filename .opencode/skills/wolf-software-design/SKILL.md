---
name: wolf-software-design
description: 'Apply inside wolf-design or for an assigned architecture question: choose software module boundaries, contracts, dependencies and state ownership. Does not trigger redesigning during ordinary implementation.'
---
<!-- wolf:rendered base=SKILL.md set=3.1.1 -->

# Designing the software solution

Choose the construction that meets requirements with the least total
complexity for implementation, consumers, verification and operation.

Use the requirements in force, ADRs, the project profile and TASK frame.
The skill does not widen role rights and does not replace the wolf-design
route. An assigned wolf-researcher returns options and a recommendation, not
architecture approval; the responsible party decides under project rules
in force.

## From task to construction

Start from the existing solution and affected consumers. Determine what
behavior is required, which guarantees are substantial and what must change.

Check whether the current module, a ready-made project solution or platform
suffices. For a substantial fork, compare the simplest sufficient
option with a reasonable alternative. An obvious edit needs no contest of
solutions.

Resolve a choice-changing unknown with an addressed question, a source or a
permitted bounded verification. Do not design a chain on a substantial
assumption; a read-only role does not create experiment code.

## Boundaries and responsibility

Keep together the behavior that uses common knowledge and changes for one
reason. Separate independent reasons for change and different guarantees.

For mutable state define the owner, permitted transitions and where
invariants are enforced. Do not spread one rule across several consumers.

Choose a module with a clear interface that hides useful complexity. The
interface is everything the consumer needs: data, errors, action order,
effects and constraints, not only signatures.

Removal check: remove the module — does complexity disappear or spread
across consumers? In the second case it does useful work.

## Concrete techniques

- Separate decision computation from I/O when it simplifies verification and
  does not break a coherent action.
- Pass time, randomness and external dependencies where behavior must be
  controllable. A function parameter is often enough.
- Verify meaningful behavior through a stable public contract. Do not expose
  internals just for a test; addressed internal tests of a complex algorithm
  are allowed.
- Hide a repeating protocol behind one operation when consumers would
  otherwise have to observe the same complex action order.
- Express external dependencies as consumer needs, not a copy of the
  provider's interface.

Examples:

- A deadline calculation needs the current moment: pass now; ClockFactory is
  unnecessary.
- Several consumers repeat lock, modify and release: consider one operation
  that owns this protocol.
- Two checks look alike now but express independent business rules: matching
  strings need no shared validator.

## The price of abstraction

Introduce ports and adapters when external dependencies need isolation, not
for the pattern's sake.

Create a boundary when it concentrates a rule, isolates an external system,
hides a protocol, provides needed verifiability or confirmed variability.

A single implementation is allowed with such a reason. Hypothetical extension
alone is not enough.

KISS and YAGNI help choose a sufficient solution. DRY is about repeated
knowledge. SOLID helps assess responsibility, contracts and dependencies. No
principle requires a class, an interface or a layer by itself.

Follow the accepted architectural style. Apply Hexagonal, DDD, CQRS and other
approaches as intended. A local test seam does not mean a project-wide move
to a new architecture.

## Result

Hand off the chosen construction, substantial contracts, consequences and
unresolved questions in the existing design/ADR or TASK format.
wolf-researcher returns FINDINGS/CONFIDENCE/GAPS as a message; a permitted
document author writes only the assigned file/section.

For a non-trivial decision, explain why a simpler option is insufficient. Do
not create an implementation instead of a design, or extra documents for the
skill's sake.

Finish when an executor can implement the solution without guessing
substantial boundaries and guarantees, or an exact gap goes back to the
requester.
