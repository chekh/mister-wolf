---
name: wolf-git
description: "Apply at a task's Git stages: entry/resumption, branch or worktree, checkpoint, handoff, completion and cleanup; also on a git failure that requires force, and on unconfirmed currency."
---

# Git stages of a task

Policy: `reference/git-collaboration-policy-v1.1.md` beside this file (in a project, `.opencode/skills/wolf-git/reference/git-collaboration-policy-v1.1.md`). Read only the policy § your stage needs; do not pull the whole file into context.

## Mandatory input

The lead may execute itself; TASK Git operations are permitted to the assignee; the old executor role is not required.

The mandate comes from the task brief; the skill grants none. No right to commit/publish — the assigned executor saves within TASK rights (§3). Companions: `using-git-worktrees`, `wolf-handoff`, `finishing-a-development-branch`.

## Entry / resumption (G0)

Structural facts come from `wolf git-inspect` (B0.5): a JSON with verdict PASS|VIOLATION|UNKNOWN, facts/reasons/allowed_next_actions. The commands below serve addressed detail.

§6: `git rev-parse --show-toplevel`, `git remote -v`, `git worktree list --porcelain`, `git status --porcelain`, `git rev-parse HEAD`, `git ls-remote` with observation time; unfinished merge/rebase/cherry-pick; owner, baseline, published-branch comparison, MR goal. No remote/network — "could not verify", not success (§6.5). Local `main` ahead or diverged — no push, no reset (§6.2).

## Branch and worktree creation (G1)

§7, §4.1: task, owner, MR goal, an explicit baseline SHA (not current HEAD). An independent task branches from a verified `main` SHA; a subtask from the identified parent SHA (published for handoff to another host). A unique name, a safe path; someone else's non-empty directory is not overwritten; look first for an existing continuation branch/worktree (§15.3).

## Saving (checkpoint)

§8: a checkpoint is mandatory at a logical boundary, before a stop or handoff, before an operation touching uncommitted work, before presenting. Before a commit — review the diff and the known file set; `git add -A` from an unknown state is forbidden. Secrets are not published. Commit ≠ publish.

## Handoff (G2)

No shared stash across parallel executors.

§9: stop the previous recording, save and publish when a remote is available; hand off the task/owner, repo/branch/target, baseline and published SHA, working copy, state, verifications, next step. The receiver confirms the input; without it the handoff is incomplete, and a timeout does not prove recording stopped.

## Completion and cleanup (G9)

§15: stop the writers; confirm the result's fate — original SHA ancestry (`git merge-base --is-ancestor`) or an MR record with allowed squash; check unfinished operations, dirty state, commits after the accepted SHA, valuable ignored files, descendants' needs. A clean `git status` does not prove deletion is safe. By default `--force`, `reset --hard`, `clean` deleting unknown content, and `branch -D` are forbidden; unconfirmed preservation keeps the directory.

## Acceptance, integration, and release

§10, §16, §22: the standard is a `--no-ff` merge; squash only by explicit exception. Wolf does not automate this.

## What is not delivered

No MR statuses, hosting adapter, CI checks, integration queue (§11), tags/registry/release, portable git mutations B1 (structural read-only `git inspect` and JSON verdict are delivered in B0.5 as `wolf git-inspect`), scheduler, or permanent controller. Gates G3–G8 are not automated and not a delivered gate: people run them manually when needed. Do not call what is missing an available command.

## Transition gate

Only what a command has verified, with its time and result, is confirmed. "Could not verify" ≠ passed; an unknown state is not counted as clean.

## Do not skip the process

| Thought | Action |
| --- | --- |
| "I will create from the current HEAD" | Choose the baseline SHA explicitly. |
| "The PR is ready — I will remove the worktree" | Preservation is not proven (§15.1). |
| "Git failed — I will add --force" | Analyze the cause; do not strengthen. |
| "A Wolf note proves the Git state" | Memory is not a Git fact; check commands. |
| "The handoff seems done" | The receiver must confirm (§9). |
