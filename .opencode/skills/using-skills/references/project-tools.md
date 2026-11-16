<!-- wolf:rendered base=project-tools.md set=3.1.1 -->
# Project tools and Wolf cards

Loaded by the lead or an executor creating, saving or updating a tool: relevant rules and the
exact contract, not the whole catalog.

## Placement and registration

Use the project's established permanent directory for auxiliary tools. If there is none, the
lead picks and creates one, asking the user on substantial ambiguity. The path is recorded in
memory and not agreed again. The directory stays apart from product functionality; service
procedure dependencies are explicit, and product components stay in the product structure.

A tool may include one or more files, resources and dependencies in whatever language suits the project. Sources live in the project's Git. A Wolf card records purpose, when to apply,
relative entry point, run command and cwd, input and output, environment, side effects and the
basis for verification. wolf tool register stores a reference, not a second copy; an old file in
.wolf/tools may stay at its path. Update a known card the regular way, keeping its ID; never
duplicate it or use --force instead of finding an analogue. Check a new command or field in
current CLI/help first.

## What to save

tmp is acceptable for one-off trials. A script needed for reuse, reproducing a result or
continuation is saved and registered before the task ends. The name "temporary" cancels no
dependency, and one reference to tmp is not enough. A one-off command with no further value
needs no packaging or card.

If scripts were created, the executor briefly returns purpose, path, verification and need. The
lead ensures preservation and registration before acceptance; Git diff does not see every tool
created in tmp. Filling in an already permitted tool is part of completion, not a new
agreement. A substantial expansion of automation is the owner's decision.

## Search, quality and run

Before repeatable work, use a delivered tool or addressed wolf tool list --status active, then
the contract of the chosen object. Do not search the whole catalog for every command. Check
applicability, versions of significant files, cwd, resources and rights. A change in unrelated
files does not void all evidence. A missing path or stale card is a constraint, not a reason to
make another copy. Keep the source when registration fails.

A tool must be lightweight, clear and reusable where possible: sufficient dependencies,
parameters for known repetitions, clear results and errors, a check of purpose and substantial
risks. Do not build a universal product out of every trial. wolf tool use is accounting, not a run
or evidence of success; a real run by a permitted means returns its own outcome and evidence.
