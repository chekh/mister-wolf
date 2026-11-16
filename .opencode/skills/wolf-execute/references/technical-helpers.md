<!-- wolf:rendered base=technical-helpers.md set=3.1.2 -->
# Technical operations of a finite mandate

A helper agent is an executor with a finite TASK and assigned skills. The Python 3 helper below serves
repeatable mechanics, choosing no executor/goal/AC. When needed,
use `python3 <skill directory>/scripts/workflow-helper.py --help`.
A local tool, not new Wolf commands or a public TASK parser.
Before running, check role rights, environment, and assigned output paths.

| Operation | Input and use | Confirmation |
| --- | --- | --- |
| task-pack | --input with the JSON of a finite task: task_id, role, goal, ac, scope, inputs (local paths), method (full source), verification, execution with budget/stop, expected_result | ready=false and a missing list on shortage; the lead resolves active memory policies |
| check | --repo the worktree root, --task, --claim, --log in an allowed location, then -- command with arguments | outcome/exit, revision before/after, dirty-state and log digest; not ACCEPTED |
| review-package | --repo, --task, --base, --head, --output outside the worktree being verified | a non-empty range of committed changes with no hidden dirty part; republishing the same package overwrites no other content |

The check command runs without a shell and in the assigned cwd. It requires
a clean committed working copy and a log outside it; a separate dirty snapshot is not implemented.
Python 3.9 or newer is required. A non-zero outcome,
timeout, unavailability, or a HEAD change is not passed off as success. The log is kept
in the chosen location; if tmp, the lead preserves the needed evidence until
handoff/cleanup. One and the same finished result has an evidence_key;
the lead uses it for addressed save/update of an existing working note.
The helper does not write memory itself, deduplicate arbitrary Wolf notes, or
repeat a side run after an unknown outcome. A new actual run
may have separate confirmation. Logs and sources may contain secrets:
do not print them whole into chat; prepare user-facing output per wolf-feedback.

A review package does not contain AC automatically: the lead passes the needed norms and evidence,
with no expected verdict or others' findings, on the first independent pass.
If the chosen mode does not cover untracked/dirty, first secure a checkpoint
or assign another reproducible snapshot; the helper does not clean the working copy.
Verification of evidence currency and ACCEPTANCE remains with the acceptance owner.
