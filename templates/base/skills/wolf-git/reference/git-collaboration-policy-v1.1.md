# Git Collaboration Policy

**Document version:** 1.1  
**Date:** November 1, 2026  
**Purpose:** the normative foundation for people, agents, and the development of portable tools and skills of Mr. Wolf.  
**Status:** a draft of the policy after the process was agreed; introducing it in a specific repository requires configuring protections and CI.

## 1. Scope and the language of requirements

The policy covers small projects with one release line, one integration branch `main`, and parallel work of people and agents. A `dev` branch is not used; permanent maintenance branches for old releases are not created.

The rules are the same for one host, several hosts, separate clones, and linked worktrees. The agent harness, Git hosting, CI, and the registry may differ. The foundation is standard Git, portable scripts, and an explicitly defined project policy.

In this document:

- **MUST** — a condition for admission to the next stage.
- **FORBIDDEN** — the action is not part of the normal process and must not be performed to work around a gate.
- **ALLOWED** — a permitted option under the stated conditions.
- **Gate** — verifiable conditions of a transition between stages. A failed gate blocks that transition, not all independent project work.

The policy defines required behavior. The fields, statuses, and operations below are a contract for future implementation, not a claim about existing Wolf commands.

## 2. Basic concepts

| Concept | Meaning |
|---|---|
| Shared repository | The designated Git remote where work is published and accepted |
| Local copy | A clone on a specific host with its own local data |
| Worktree | A separate working directory linked to a local Git repository |
| Working branch | The branch of one task, with an owner and a target branch |
| Parent branch | The working branch of a lead participant that receives subtask results |
| Baseline | The specific allowed SHA from which a working branch is created |
| Checkpoint | A local commit preserving a known set of changes; not an acceptance |
| MR | A merge request; it also includes a PR on platforms with that name |
| Acceptance | The decision that a task's result meets the requirements and may be presented for integration |
| Integration | Including an accepted result into the target branch |
| Integration candidate | The exact merge commit with the target branch SHA as its first parent and the accepted source branch SHA as its second; verified before publication |
| Release | Publishing a specific version from a chosen accepted commit |
| Image digest | The identifier of the image's or its index's content, as opposed to a mutable tag |

**Modified, saved, published, accepted, integrated, and released are different states.**

| State | Minimum confirmation |
|---|---|
| Modified | Files in the working directory |
| Saved | A local SHA containing the needed work |
| Published | An observable shared repository reference from which this SHA is available |
| Accepted | The authorized acceptance owner's decision for a specific SHA |
| Integrated | A confirmed MR result in the target branch |
| Released | A version Git tag and a confirmed published image with a digest |

## 3. Responsibility and rights

Roles denote responsibility, not mandatory separate processes or agents. A person may perform the lead role; the Wolf lead agent may accept executor results.

| Participant | Responsibility and rights |
|---|---|
| Project owner | Approves the policy, the rights, the required checks, and the protection settings |
| Task/branch owner | Is responsible for the branch history, checkpoints, publication, refreshing, and cleanup of their working copies |
| Lead participant | Assigns subtasks, accepts child MRs, and is responsible for the overall result of their branch |
| Acceptance owner | Verifies the task's requirements and permits presenting a specific SHA for integration |
| Integration handler | Verifies candidates in sequence and updates `main` within the given rules |
| Release operator | Explicitly triggers the release of a version from a chosen SHA; a person or an agent per the project policy |
| Release CI | Verifies the request, creates the tag, builds and publishes the image, triggers registry cleanup |

A working directory has one active writer. A working branch has one active owner of recording and publication. Other participants propose changes through their own branches and MRs.

When the TASK explicitly grants commit rights, the assigned task owner is entitled and obliged to create local checkpoint commits of their changes in the assigned branch; within that TASK each further checkpoint needs no new permission. Without explicit TASK rights the executor makes no commits and hands off the changes and their state. Publication of a working branch is permitted only by an explicit task mandate, unless the project has established a different order.

The owner must not include unknown or someone else's changes in their commit. If an executor has no right to commit, the mandate MUST name the lead who preserves their result until a stop or handoff. The obligation to preserve the work must not remain without a responsible party.

The right to commit and publish a working branch does not give the right to change `main` directly, create release tags, or bypass checks. The Steward does not participate in ordinary Git process control: the state is verified by tools, decisions are made by the assigned participants.

## 4. The branch and task tree model

### 4.1. General rules

1. `main` contains integrated results and is the base of independent tasks.
2. Direct development and manual checkpoint commits in `main` are FORBIDDEN.
3. Each new task gets a separate branch. Completed branch names are not reused.
4. Independent lead participants create branches from a verified SHA of the shared `main`.
5. A subtask branches from an explicitly chosen SHA of the parent working branch and is presented back into it.
6. After final integration, the working branch is closed. Subsequent changes are arranged as a new task and branch.
7. The published history of working branches is not rewritten. The history of `main` and published release tags are never rewritten in the normal process.

### 4.2. Example

| Participant | Branch | Base at creation | MR goal |
|---|---|---|---|
| Lead A | `feat/123-some-a` | Verified SHA of `main` | `main` |
| Subagent A1 | `feat/124-some-a1` | SHA `feat/123-some-a` | `feat/123-some-a` |
| Subagent A2 | `fix/125-some-a2` | SHA `feat/123-some-a` | `feat/123-some-a` |
| Lead B | `feat/126-some-b` | Verified SHA of `main` | `main` |

The `feat/`, `fix/`, `docs/`, `chore/` prefixes help navigation. They do not define rights. The name includes a unique task ID and a brief description. The relation to the parent is stored explicitly, not computed from name similarity.

A lead does not present their branch into `main` until the needed child results are accepted and the remaining subtasks are closed, canceled, or explicitly moved to standalone work. After the parent MR is ready, recording in its branch is frozen; a change withdraws readiness.

## 5. Work on one and several hosts

| Placement | Mandatory rule |
|---|---|
| One clone, linked worktrees | Each active writer gets a separate worktree and branch |
| Several clones on one host | Each clone verifies and synchronizes the state on its own |
| Different hosts | Commits are exchanged through the shared repository; different active owners work in different branches |
| Handoff of one branch | First the previous owner stops and publishes; then the new one's acceptance is confirmed |

The "we edit different files" arrangement does not permit independent simultaneous recording in one working directory. Parallel independent writers use different branches.

Linked worktrees share local branches and part of the Git metadata. Tools MUST coordinate operations on shared refs and the clone's internal state. A branch used by another owner must not be changed, nor Git's protection against its concurrent checkout bypassed.

`git worktree lock` is not counted as a recording lock for agents or a distributed ownership mechanism. Ownership is reflected in the task state, and the stopping of recording is confirmed by the previous owner or the responsible lead after the process is stopped.

Neither lost connectivity nor activity age permits a second participant to immediately continue recording in the same branch. In case of doubt, a separate recovery branch is created, and ownership is resolved explicitly.

## 6. Entry into work: verification and refresh

### 6.1. Mandatory sequence

At task start, on resumption after a break, a restart, or a change of owner, the participant:

1. Verifies the repository identity, the shared remote address, the host, the worktree path, and the task branch.
2. Verifies staged, unstaged, and untracked files and known valuable files outside Git.
3. Verifies an unfinished merge, rebase, cherry-pick, and other Git operations.
4. Verifies the assigned owner, the baseline, the local HEAD, and the saved task information.
5. Obtains the current refs of the shared repository and records the time of successful observation.
6. Separately compares the working branch with its published version and with the MR target branch.
7. Only then chooses an allowed update or recovery.

Fetch updates the remote-state information, but does not mean the changes are included into the working branch. An old remote-tracking ref value is not a confirmation of the server's current state.

### 6.2. Local `main`

After the remote state is successfully obtained, the table applies:

| Local `main` relative to the shared `main` | Allowed action |
|---|---|
| Matches | Use the SHA as the verified base |
| Behind only | Fast-forward when the directory is clean and no other owner exists |
| Ahead | Stop updating; establish the origin and preserve the local commits |
| History diverged | Stop updating; perform a divergence analysis |
| Remote unreachable | Mark currency as unconfirmed |

Local commits in `main` must not be automatically pushed, reset, or deleted for synchronization. Known useful work may be preserved in a separate branch and then presented through a regular MR. Bringing the local `main` to the shared state is done only after the work is saved and ownership is verified.

Creating a new task does not require switching or updating the local `main`: a branch may be created directly from a verified SHA of the shared `main`. An anomaly of the local `main` is still recorded and not hidden.

### 6.3. The working branch and its published version

| State | Action |
|---|---|
| They match | Continue after the remaining verifications |
| Local is ahead | Verify the commits belong to the task; publish at a mandatory boundary |
| Local is behind only | Establish the remote commits' origin; fast-forward if they are expected |
| Diverged | Stop automatic updating; find the reasons and the owner |
| The remote branch is missing | Distinguish a new unpublished branch, a closed task, and an unexpected deletion |

The presence of expected local commits is not an error on its own. An unknown origin of local or remote changes is grounds for analysis.

### 6.4. Updating from the target branch

Target changes reach the published working branch through a merge. Before the merge, own work is saved and unknown changes are examined. After conflicts are resolved, the necessary verifications are performed.

A lead updates their branch from `main`; a subagent from the parent branch. Simultaneous independent merging of `main` into all tree levels is not required.

After each new target commit, an immediate update of all branches is not required. The state MUST be verified at entry, at handoff, and at result presentation. Updates are required when there is a dependency on them, a conflict, a compatibility violation, or an MR returned by the handler. An automatically compatible result may be verified by the integration handler on its own, without changing the source branch.

Rebase is allowed only for unpublished work of a single owner from which nobody has branched. The compound `pull` command is not used as an unconditional way to fix any state: obtaining information and the way history is changed must be explicit.

### 6.5. Work without connectivity

A known local task may continue from a previously verified base and create checkpoints. The last successful remote observation is recorded. A new independent task from an unconfirmed base, acceptance into the shared branch, cross-host handoff, and release are blocked until connectivity is restored. A report must not call such a copy current.

## 7. Branch and worktree creation

Before creation, the task, the owner, the MR goal, and the exact baseline SHA MUST be determined. The current HEAD is not chosen automatically.

A top-level branch is created from a verified `main`; a child branch from the saved and identified parent commit. For a handoff to another host, this commit must be published and available to the receiver. Parent changes left only in files are not the child branch's base.

Creation includes verifying the name's uniqueness, the absence of existing work of the same task, a safe path, and worktree registration. Someone else's non-empty directory is not overwritten. To continue a task, an existing branch and worktree are looked for first, instead of creating a duplicate.

Environment preparation is done separately: dependencies, local settings, and secrets must not accidentally end up in commits. Symlinks and shared directories must not let two worktrees silently change the same sources or build results.

## 8. Saving and publication

A checkpoint MUST be created:

- at a completed logical step;
- before a planned stop and ownership handoff;
- before an operation that can affect uncommitted work;
- before presenting a result for acceptance.

Within an owner's continuous work, known uncommitted changes are allowed. A commit before every action or every subagent's launch is not required. In the standard scheme, a subagent works in its own branch and saves its result on its own or via an explicitly assigned responsible party.

An intermediate checkpoint is allowed with unfinished verifications or failing tests, if this is explicitly reflected in the message and the task state. Such a commit preserves the work and does not pass the readiness gate automatically.

Before a commit, the diff is verified and a known file set is chosen. Unconditional inclusion of all files from an unknown state is FORBIDDEN. Secrets, temporary data, and local settings are not published.

Publication MUST happen before an MR, a cross-host handoff, and a planned stop when a remote is available. Without connectivity, the checkpoint remains local with this constraint stated explicitly and a responsible party for the subsequent publication.

Push confirmation contains the remote, the branch, the SHA, and the observation time. A successful local commit or an intent to push does not confirm publication. An unexpected push refusal requires a repeated inspect, not a force push.

## 9. Task handoff

A planned handoff is performed in sequence:

1. The previous owner stops new changes and halts the writers of their branch.
2. Saves and publishes the result, records residual local data.
3. Hands over the information from the table below.
4. The receiver performs the input verification and confirms the needed SHA is available.
5. After confirmation, the active owner changes; the previous one does not resume recording.

| Required field | Content |
|---|---|
| Task and owner | Who hands over, who accepts, what remains to be done |
| Repository and branch | The shared remote, the source branch, and the MR goal |
| Base and result | The baseline SHA and the last published SHA |
| Working copy | Host, clone/worktree; a local path does not count as a shared address |
| State | Unfinished operations, residual files, child tasks |
| Verifications | What was done, on which SHA, what was not done or is failing |
| Next step | The specific continuation action |

On an emergency interruption, the new participant first restores the facts. The absence of a handoff record does not permit cleaning the directory or declaring unpublished work unnecessary. `stash` data, the reflog, and local files are treated as possible sources for recovery, not as a confirmed handoff.

## 10. MRs and acceptance of child tasks

An MR MUST contain the task, the source and target branches, the presented SHA, a result description, substantial contract changes, verification results, and known constraints.

A lead accepts child MRs sequentially into their own branch. For each result, compatibility with the parent's current state is verified. If two child results touch a shared contract, the lead is responsible for their coordination and joint verification.

A subagent does not redirect an MR into `main` on its own. A lead does not substitute the mere presence of commits for child-result acceptance.

**The standard acceptance method is a merge commit (`--no-ff`)**, both for child MRs into the parent working branch and for MRs into `main`. The Git graph preserves the accepted original commit history: the final integration commit has the current target as its first parent and the exact accepted source SHA as its second. A fast-forward does not replace a separate integration commit. Updating the working branch from the target is still done with a regular merge per §6.4.

**Squash is not applied automatically.** As an exception it is ALLOWED only by an explicit acceptance-owner decision, for a small independent task, when there are no active dependent branches, the original SHA/MR stays traceable, and the possibility of safe cleanup has been verified. The exception does not change the general queue algorithm in §11: if the handler in use cannot build and verify a squash candidate with the same guarantees, such an MR is integrated with a standard merge or remains unintegrated until a supported process exists. The prohibition on rewriting published history remains.

After integration, the source branch is closed to new tasks. Before deletion, the remaining dependent branches are verified: they can be finished, canceled with the work preserved, or moved to a new confirmed base. After a regular merge, the relation to the already accepted source commits is preserved and reachable through ancestry. After an allowed squash, this relation is not preserved; integration is confirmed separately by the MR record and the exact SHAs.

**Change origin.** Each MR contains a task ID, a parent task when present, source/target refs, the presented source SHA, and references to the evidence and acceptance. The integration commit must contain stable references to the task and the MR (for example, `Task:` and `MR:`), and the integration log — the source SHA, the target SHA before the merge, the result SHA, and the verification results. Changes can be investigated via `git log --first-parent`, the full graph, and `git blame`, without reading the agents' correspondence. Metadata does not replace verifications and must not include secrets or private traces.

## 11. The integration queue into main

### 11.1. Storage and triggering

The queue is open MRs in `main` with a valid readiness mark for a specific source SHA. The queue is not stored solely in pending CI runs. One integration handler works at a time for one repository.

The handler is triggered when a ready MR appears, after candidate processing completes, on a material queue-state change, and manually. A periodic run every `reconcile_interval_minutes` restores operation after a missed event or a failure.

Repeated events do not cancel an active integration. Ready independent MRs are ordered by the time valid readiness was obtained; on equality, by the stable MR identifier. A returned and corrected MR gets a new place. A dependency must be completed before readiness; urgency allows an explicitly recorded priority without skipping checks.

### 11.2. Algorithm

1. Pick the next ready MR; verify its currency, target branch, and acceptance.
2. Record the source SHA `S` and the current `main` SHA — `T`.
3. In a temporary isolated directory, build the **candidate merge commit `C`** from the exact `T` and `S`, with two parents in the order `T`, `S` (equivalent to `--no-ff`, even when a fast-forward would be allowed). On a conflict, do not create a ready candidate: return the task to the owner. Verify the result tree, the parents, and the task/MR references.
4. Run the required checks exactly for `C` per the approved CI policy; checks of the source `S` alone are insufficient.
5. Before publication, re-verify: the MR is open and ready, the source SHA is still `S`, the acceptance is valid, and `main` is still `T`.
6. When the conditions hold, publish exactly the verified `C` as the new `main`, with a server-side verification of the expected previous state.
7. Record the correspondence of MR, `S`, `T`, `C`, and the check results; complete the MR by the chosen platform's means.
8. Move on to the next MR relative to the updated `main`.

If `main` or the source SHA has changed, the old result is not published. The candidate is built anew; a source-branch change also withdraws readiness and requires a new acceptance. CI success for the previous SHA pair does not carry over automatically to the new one.

The Git hosting adapter MUST provide a conditional target update and forbid silent substitution of the verified candidate. A regular force push is not used for this. If the platform forms the merge commit on its own, the implementation must prove the exact published commit matches the verified `C` (parents and tree included), or build and verify the actually published candidate in advance. A simple verification of the source branch or diff similarity is insufficient. Without such a guarantee, automatic publication through this adapter is forbidden until a supported integration method is chosen.

### 11.3. Errors and waiting

| Situation | Response |
|---|---|
| Conflict | Withdraw readiness, inform the owner, immediately move to the next MR |
| Required check error | The same; there is no need to retry unchanged code without a reason |
| Infrastructure failure | One retry by default; then withdraw readiness and report the reason |
| Check timeout | Finish the attempt as unsuccessful, release the queue; do not delete the source code |
| The target changed | Rebuild the candidate relative to the new SHA |
| Handler restart | Read the MR and the actual `main`; continue without re-applying the accepted result |

The queue **does not wait for a conflicting MR to be fixed**. The owner may fix it as many times as needed; after a new acceptance, the MR returns to the queue. The initial timeout is 20 minutes, changed by a project parameter. A check result arriving after the attempt was canceled does not permit publication.

### 11.4. Example A and B

A and B started from `M0`. For A, candidate `M1` was built and verified; it was accepted. For B, a candidate from `M1`, which already includes A, is then verified. If it is compatible, it is accepted. On a conflict, B updates their own branch and presents a corrected result; the next independent MR does not wait for B.

The queue eliminates the publication race, but not semantic contradictions. When shared APIs, data schemas, configuration, or dependencies change, leads record the contract or the task dependency in advance. Responsibility for adaptation usually lies with the not-yet-accepted result; a violation of an earlier agreed contract is analyzed on the merits, not by the "first one is always right" principle.

## 12. Protecting main and the checks policy

Only the integration mechanism with limited rights changes the shared `main`. Direct pushes by participants, forced updates, and branch deletion are blocked by server settings. Fixes, rollbacks, and changes to the CI itself go through a working branch and an MR.

Required checks are defined by the project: task correctness, the needed tests, static analysis, and other applicable checks. Documentation changes may have a lighter set if the policy describes it in advance. An empty "everything is verified" without SHAs and results is not accepted.

CI uses a trusted gate configuration. A CI change in an MR cannot, on its own, remove its own required checks or obtain rights to update `main`, create tags, or delete images. Verification of untrusted code and publication-secret operations are separated by rights.

A merge into `main` **does not trigger container image publication**. MR checks may perform the necessary build verification, if the project needs it; this is not a release and not image publication into the registry.

## 13. Tagging and release of the container image

### 13.1. General rules

The project maintains one current version line. A Git tag has the form `vMAJOR.MINOR.PATCH`; an image tag — `MAJOR.MINOR.PATCH`. The components are non-negative integers without leading zeros. Stable versions are compared numerically by major, then minor, then patch.

A new version MUST be greater than all previously released stable versions, including ones already deleted from the registry. Release history's source is Git tags and the release log, not only the remaining images. Published numbers are not reused; version tags and the version-to-digest correspondence are not overwritten.

### 13.2. Three separate CI processes

| Process | Trigger | Result |
|---|---|---|
| Integration | A ready MR | An accepted commit in `main` |
| Release preparation | An explicit command of an authorized participant with a version and a SHA | A verified and published Git tag |
| Image release | The publication event of a release Git tag | A verified version image, `latest`, the release log, and cleanup |

Tag creation is not done automatically after every MR. Between releases, several accepted tasks may accumulate in `main`. Deployment is a separate action; this policy does not introduce automatic CD.

### 13.3. Release preparation

1. Version changes, the changelog, and the needed documentation updates are accepted through a regular MR.
2. The operator explicitly chooses the version and the full SHA of the accepted commit. Substituting the current HEAD for it is not allowed when `main` has moved ahead.
3. CI verifies the SHA is in the shared `main` history, the version matches the sources, the required checks pass, and no version is already published.
4. CI creates and publishes the annotated Git tag `vX.Y.Z` on the chosen SHA.
5. CI records the release request and the triggering of the next process.

The CI adapter must account for platform constraints on triggering a workflow from another workflow. Before the process is introduced, it MUST be verified that a tag created by the service account actually triggers the release and that an event repeat does not create duplicates.

### 13.4. Publication and partial failures

For a single image, version preparation and release are coordinated sequentially: a newer version must not finish publication before an unfinished previous release and then receive a stale `latest`. A stuck release does not hold the integration queue into `main`; it blocks only later releases until it resumes or the attempt is explicitly finished.

CI gets the code by the tag, verifies its SHA, builds and verifies the image. Then it publishes the version tag, confirms the digest is available, and updates `latest` to the same digest. Only after both tags are confirmed does cleanup start.

| Failure | Rule |
|---|---|
| Build before version publication | Repeat the release of the same Git tag; do not move the tag |
| The version image is published, `latest` not updated | Repeat the promotion of the existing digest; do not rebuild or overwrite the version |
| Unknown whether publication finished | First read the actual tags and digests; do not re-write blindly |
| Publication succeeded, cleanup failed | The release stays successful; cleanup is marked separately as unsuccessful and allows a retry |
| An error in the published product | A fix through an MR and a new version number |

A retry verifies the consistency of the Git tag, the version, the SHA, and the digest. A mismatch blocks automatic continuation. The release log contains the version, the Git SHA, the digest, a reference to the CI, the time, and the publication/cleanup statuses.

## 14. Registry cleanup

### 14.1. Retention policy

The `keep_last` parameter is a positive integer. The initial example is `5`; this is a project setting, not an immutable rule.

After a successful release, the following are preserved:

- the `keep_last` greatest published stable versions `MAJOR.MINOR.PATCH`;
- the image that `latest` points to.

If `latest` points to one of the preserved versions, no additional image appears. If it points outside the list, it is still protected. The count refers to versions, not to layers, platform manifests, or the number of registry entries.

The policy does not support separate release lines and does not sort images by build dates, tag changes, or API output. For example, `2.22.10` is newer than `2.22.9`, and `2.10.0` is newer than `2.9.0`. A verified numeric parser is used; lexicographic sorting is forbidden.

### 14.2. Cleanup algorithm

1. Verify the parameter, the specific registry, and the image repository name.
2. Obtain the full tag list with all pages; if completeness cannot be confirmed, stop deletion.
3. Extract the strictly valid stable versions. Non-canonical and unknown tags are shown in the report but not deleted by this rule.
4. Sort the versions numerically in descending order, choose `keep_last`, and add the `latest` protection.
5. Obtain the tag-to-digest correspondences; build a deletion plan for the old versions.
6. Verify all references to the content being deleted, including preserved and unknown tags and multi-architecture indexes.
7. Re-verify the plan before changing anything; perform the allowed deletions and record the actual result.

Where possible, only stale tags are deleted. If the API deletes a manifest/digest together with all its tags at once, the adapter must not touch content used by preserved or unknown tags or preserved multi-platform indexes. When safety cannot be proven, the specific object is skipped with a reason; the count policy may be temporarily unmet.

Full support of the multi-platform graph is needed only when such images are used, but an unsupported format must lead to a refusal to delete, not to an assumption of safety. Actual layer reclamation is performed by the registry's means and is not guaranteed by a single tag deletion.

Cleanup runs at the end of a successful release, without a separate mandatory schedule. It does not overlap with the same image's publication; all writers observe the shared coordination. A manual retry is supported by the same policy. A configuration, list, or verification error does not permit deletion "by an approximate list".

The script provides modes for planning without writing or applying. After the initial enabling, automatic application does not require confirmation of each deletion, as long as it fits the approved policy. No separate complex retention categories are introduced. Deleted versions are not guaranteed for rollback; `keep_last` is chosen with the needed margin.

## 15. Cleanup of worktrees, branches, and local data

### 15.1. Cleanup as part of closure

Integration does not mean the cleanup is complete. The owner of each host is responsible for the local worktrees and clones; the central CI does not declare them deleted without the host's confirmation.

Before deletion, the following MUST be done:

1. Stop the owner and all related recording processes.
2. Confirm the task's integration or its cancelation with an explicit decision on preserving the needed work.
3. Verify there are no unfinished Git operations, staged/unstaged/untracked changes, or additional commits after the presented SHA.
4. Verify valuable ignored files, local artifacts, and backup data: a clean `git status` on its own does not prove the directory can be deleted.
5. Verify the branch is not needed by active descendants, MRs, or another owner.
6. Preserve the needed local data and obtain a fresh verification result immediately before deletion.

With a standard merge, it MUST be confirmed that the presented source SHA is an ancestor of the published integration result, and that the integration commit has the expected parents and is tied to the MR record. This verification confirms commit inclusion, **but not the absence of new local changes, foreign data, or active dependencies**. With an allowed squash, the source SHA's ancestry is absent; preservation is proven by the MR integration record with exact source/result SHAs and by verifying the branch's current state. Additional commits after the accepted source SHA are analyzed separately under any integration method. The mere MR status "merged" does not permit deleting current branch content.

### 15.2. Order

First the worktrees of completed subtasks are cleaned up, then their local branches and, if no longer needed, the remote branches. After the parent task is accepted, its working copy and branch are cleaned up likewise. A useful accepted child result may be preserved in the published parent branch until that branch's integration into `main`.

A worktree is deleted with standard Git tooling, not by unconditional directory deletion. A remote branch is deleted with verification of the expected SHA: a new commit's appearance revokes the earlier cleanup permission. At each step the result is recorded separately, so a cleanup retry after a failure is safe.

Automatic `remove --force`, `reset --hard`, and `clean` that delete unknown files, and forced branch deletion for tidiness, are FORBIDDEN. By default, a local branch is deleted with the standard `branch -d` after the worktree is removed and the verifications pass. If even after a standard merge `branch -d` refuses because of the chosen checkout/merge base, the refusal is analyzed, not automatically bypassed. With an allowed squash, special deletion is permitted only after preservation is proven by the MR record and a repeated verification of the SHA's immutability; a regular `branch -d` refusal on its own is not a permission for forced deletion.

The main clone and its principal working directory are not deleted like an ordinary child worktree. Deleting a whole clone is a separate procedure with verification of all branches, worktrees, and local data.

### 15.3. Finding forgotten copies

At the start of a work session, the registered working copies are inspected locally:

| Found | Action |
|---|---|
| A completed task, preservation confirmed | Perform cleanup per the gate |
| A completed task, work remains | Establish the owner and preserve the result |
| An active task | Leave |
| An unknown task or owner | Flag for analysis, do not delete |
| Unused for a long time | Inform the owner; age grants no right of deletion |
| Traces of an already deleted worktree | Verify, then clean up stale Git administrative records |

If a host is unreachable, a task may have the status "integrated, cleanup pending". The cleanup of other tasks and the queue's operation continue. Full closure is recorded after confirmation across all registered working copies of the task.

## 16. Gate summary table

| Gate | Admission conditions | Who verifies and is responsible | On failure |
|---|---|---|---|
| G0. Entry / resumption | Repository, branch, owner, local changes, Git operations, and remote state are known | The owner via inspect/check | Divergence analysis; limited offline work only per §6.5 |
| G1. Branch creation | Task, unique name, allowed baseline SHA, goal, and a safe path | Owner / lead | Do not create; remove the uncertainty |
| G2. Stop / handoff | Checkpoint, publication when connectivity is available, recording stopped, handoff | The previous owner; the receiver confirms the entry | Do not declare the handoff complete |
| G3. MR readiness | Published SHA, task completion, verifications and acceptance, mandatory descendants finished | Acceptance owner / lead | Leave the MR not ready; return remarks |
| G4. Child task acceptance | Compatibility with the current parent, specific-candidate checks | Lead | Return to the subtask owner |
| G5. Integration into main | Ready MR, verified candidate, unchanged source/target SHAs, server-side rights | The single handler | Withdraw readiness or rebuild the candidate; the queue keeps working |
| G6. Version tag | Explicit request, accepted SHA, correct new version, checks and documentation | Release-preparation CI | Do not create the tag; state the reason |
| G7. Image release | Unchanged Git tag, verified image, available version digest and `latest` | Release CI | Restore the corresponding stage without overwriting the version |
| G8. Registry cleanup | Successful publication, full list, valid `keep_last`, safe plan | The cleanup script under release coordination | Do not delete anything unverified; report the cleanup error separately |
| G9. Worktree cleanup | No writers and no unsaved work; the fate of the result and its dependencies confirmed | The local owner via check/remove | Keep the directory; record the reason |

A gate is not passed when confirmation is missing or stale because the verified SHAs changed. The success of a Git verification tool does not replace the acceptance of the functional result.

## 17. Recovery and deviations

| Deviation | Required response |
|---|---|
| Unknown files or commits | Record the state, exclude them from your own work, find out the origin, and preserve them |
| Local main ahead / diverged | Preserve the commits under a separate ref, determine the MR path; no automatic push/reset |
| Two active owners | Stop the conflicting recording, preserve both results, restore a single owner |
| An unfinished merge/rebase | Establish the operation's goal; finish it deliberately or cancel it with the work preserved |
| The MR was accepted, but the owner managed to add commits | Do not count the new commits as accepted; arrange a separate branch/MR |
| A regression in main | A rollback, or a fix via a new branch and an MR through the same queue; main history is preserved |
| A failure between updating main and closing the MR | Cross-check the actual SHA and the log; finish the accounting without applying the task a second time |
| Stale publication information | Obtain a new observation; do not present an old verification as current |

The participant reports: what was found, which SHAs/paths are affected, what was preserved, which transition is blocked, and who must continue. A generic "Git is broken" does not count as a usable handoff.

## 18. Project settings

Below is an example of a future configuration contract, not a finished Wolf format. Values, except the mandatory process rules, are configured per project.

```yaml
git_policy:
  remote: origin
  integration_branch: main
  acceptance_method: merge
  merge_commit: always # proposed Wolf policy field: equivalent to --no-ff
  squash_exception: explicit_only # only under the conditions of §10 and a supported candidate verification
  update_method: merge
  published_history_rewrite: false
  queue:
    order: ready_at
    candidate_timeout_minutes: 20
    infrastructure_retries: 1
    reconcile_interval_minutes: 10
  required_checks: [] # fill in with real check identifiers before enabling
release_policy:
  git_tag_prefix: v
  version_format: MAJOR.MINOR.PATCH
  trigger: explicit_request
  image_build_trigger: release_tag
  image_latest_tag: latest
  keep_last: 5 # a positive parameter, freely changed by the project owner
```

An empty list of required checks in the example does not mean integration without control is allowed. When the process is introduced, real checks or an explicitly approved minimal policy for this repository type are defined. Also configured are the image address, the CI rights, and the hosting/registry adapter in use.

## 19. Implementation requirements in Wolf

### 19.1. Separation of responsibility

| Layer | What it implements |
|---|---|
| Policy | The rules of this document, the settings, and the project rights |
| Portable scripts | The actual inspect/check, creation, checkpoint, publication, safe cleanup |
| Git hosting adapter | MRs, statuses, readiness, conditional update of the target, and refs protection |
| CI | Sequential integration, tag preparation, release, and cleanup |
| Skills | When to trigger operations, how to read results, and how to respond to a refusal |
| Agents / people | Semantic acceptance, conflict resolution, and performing allowed actions |

OpenCode and other harnesses call the shared mechanism. Instructions must not depend on the special worktree commands of one harness. A separate permanent controller agent and a distributed locking system are not required for the first implementation.

### 19.2. Operation requirements

- Explicit repository/worktree, task, stage, and expected SHAs; dangerous implicit values from the current directory are forbidden.
- One actual Git state collector for all verifications; no divergent interpretations.
- A verification-only mode without fixes; separate mutating operations.
- A brief human-readable summary and a structured JSON with the verdict, reason codes, facts, and an allowed next action.
- Distinguishing "conditions violated" from "could not verify"; missing data is not counted as success.
- Re-verification of preconditions immediately before recording, shared local coordination, and server-side verifications of expected refs.
- A safe retry after a partial failure; a log of actual results and no integration/release duplicates.
- Verification of own rights; no automatic force, no publication of unknown history, and no deletion for a green status.

In the task state, references and compact facts are enough: task/parent, owner, host/clone/worktree, branch/target, baseline/HEAD, dirty-state, remote observation, MR/source/result SHA, the checks state, the next step, and the cleanup state. Wolf state does not replace actual Git and remote verification.

### 19.3. Implementation acceptance scenarios

An implementation is considered fit after at least the following scenarios are verified:

1. A and B on different hosts start from one SHA; both results are accepted sequentially with joint-state verification.
2. B's conflict does not delay the next independent MR.
3. A source or target change after verification does not allow publishing the old candidate.
4. A CI restart after an actual merge does not lead to re-applying the task.
5. Local unpublished commits in main are detected and preserved without automatic push/reset.
6. A branch handoff requires the previous writer to be stopped and the published SHA to be available on the other host.
7. After a merge, the accepted SHA's ancestry and the MR record are verified; a completed branch with no new data is cleaned up safely, and a branch with an additional commit is preserved. With an explicitly allowed squash, a separate preservation verification by source/result SHAs applies.
8. A worktree with valuable ignored files is not deleted by a clean status alone.
9. Between the MR and the release, main moves ahead; the tag stays on the explicitly chosen release SHA.
10. A release retry after the version is published restores latest without overwriting the version image.
11. Numeric sorting handles `2.9.0`, `2.10.0`, `2.22.9`, `2.22.10` correctly; changing keep_last changes the plan.
12. An incomplete registry list, a shared digest of a preserved tag, and multi-platform references do not lead to deleting needed content.
13. A cleanup error does not cancel the published release and allows a safe retry.
14. A regular merge into main does not publish the container image.
15. Accepting child and top-level MRs through a merge preserves the original commits; `git log --first-parent` shows the integrations, and the full graph makes it possible to connect a change to the original SHA and MR.
16. For a merge candidate, the two parents (`T`, `S`), the tree, and the exact SHA `C` are verified; a change of either `T`/`S` forbids publishing the previously verified `C`. A hosting adapter that does not support this guarantee fails safely.
17. A squash request without an explicit exception, or with an active child branch, is not integrated the squash way; with an allowed exception, safe cleanup without ancestry is verified.

## 20. Quick reference for participants

1. **Entry:** verify your local work, the owner, and the remote; then update.
2. **New task:** a separate branch from an explicit main SHA; a subtask from the parent's SHA.
3. **Work:** one writer, your own files, a checkpoint at logical boundaries.
4. **Handoff:** stop, save, publish, hand over the SHA and the next step.
5. **Acceptance:** present the published SHA and the verifications; a subtask is accepted by the parent.
6. **Main:** present a ready MR; integration is done by the shared queue.
7. **Refusal:** fix the specific reason and present a new result; someone else's independent work continues.
8. **Release:** an explicit version and SHA request, a Git tag, image build and publication, registry cleanup.
9. **Completion:** confirm preservation, clean up the worktree and unneeded branches on every host.

## 21. Technical grounds

The choice of the queue, the branch model, the rights, and the retention rules is the policy of this document. Tool behavior is verified against the primary documentation:

- [Git worktree](https://git-scm.com/docs/git-worktree) — the structure of linked working copies, shared refs, deletion, and the service lock.
- [Git push](https://git-scm.com/docs/git-push) — updating remote refs and protection against unwanted history changes.
- [Git merge](https://git-scm.com/docs/git-merge) — merge commits, `--no-ff`, parent order, and differences from squash.
- [Git log](https://git-scm.com/docs/git-log) — `--first-parent` and the analysis of change origin.
- [Semantic Versioning 2.0.0](https://semver.org/) — the stable version format, numeric ordering, and the immutability of a published version.

The specific CI events, blocking conditions, and registry deletion operations are defined by adapters and verified at implementation time. This document does not assume that regular Git on its own provides MRs, a queue, owner information, or a registry API.


## 22. Policy change history

- **1.1 (November 1, 2026):** by the owner's decision, the standard integration of child MRs and MRs into `main` was changed from squash to a merge commit (`--no-ff`); the two parents and the verification of the exact candidate, the task/MR origin, worktree cleanup, configuration, and acceptance scenarios were clarified. Squash remains only as an explicitly granted exception with a separate preservation verification. The other GitFlow rules do not change.
