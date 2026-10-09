# A Persistent Organization, Built From Temporary Agents

Every AI coding agent is a temporary worker: it arrives with a cold context, works one session and leaves. Hiring a smarter model does not change this — the experience still evaporates when the session ends.

Mr. Wolf attacks the problem from the other side. It gives a project a **persistent organization**: roles, a working cycle, memory and a learning loop live in the repository, while agents come and go. The org chart is durable; the people in it are disposable. Local-first — everything lives in your files, not in someone's cloud.

We run Wolf's own development through this organization every day. The page you are reading was produced by an L2 worker against a brief from L1, accepted by L0 — the exact cycle described below. Wolf's releases are built the same way; the pattern is load-bearing, not decorative.

## Three levels, clean prohibitions

The hierarchy is small on purpose. Each level owns one thing and is explicitly forbidden from doing the others' work:

| Level                | Owns                                                     | Never does                                  |
| -------------------- | -------------------------------------------------------- | ------------------------------------------- |
| **L0** — Coordinator | the goal, acceptance criteria, the final verdict         | execute work itself; call L2 directly       |
| **L1** — Executor    | delivery of one task: decomposition, integration, report | bypass the process; touch workers' behavior |
| **L2** — Worker      | exactly one bounded subtask in a clean session           | spawn anyone; expand its own scope          |

Escalation goes **up** (L2 → L1 → L0) or **sideways** to the Council — never around the structure. L0 is the only level that talks to the project owner; L1 is the only level that talks to workers. Each brief carries just what the next level needs, so every session stays small, focused and replaceable. The prohibitions are not honor code: every call in the topology has a machine-checkable justification.

These roles are not a metaphor: they map to concrete agents delivered by `wolf init` — see [Base Set](/guide/base-set).

Constraint is half of the design; compensation is the other half. The hierarchy deliberately limits each agent's context and authority. Typed memory compensates for what gets lost at every handoff. The Council compensates for the one-sidedness of a vertical chain. Checkpoints compensate for drift during long-running work. None of this lives inside an agent's head — all of it lives in the project.

## The working cycle

```text
goal → brief → plan → execute → report → accept → checkpoint
```

| Step         | Who               | What happens                                                                          |
| ------------ | ----------------- | ------------------------------------------------------------------------------------- |
| `goal`       | owner → L0        | a work-thread opens with the goal and success criteria                                |
| `brief`      | L0                | desired outcome, scope, constraints, acceptance criteria — no technical decomposition |
| `plan`       | L1                | decomposition, dependencies, worker assignments, a verification plan                  |
| `execute`    | L1 → L2           | workers run bounded subtasks in clean sessions; Council joins at hard forks           |
| `report`     | L1                | an executor-report plus verifiable artifacts                                          |
| `accept`     | L0                | a verdict against the acceptance package: accept, return or escalate                  |
| `checkpoint` | runtime / L0 / L1 | a deterministic recap of state plus fresh signals for the learning loop               |

Checkpoints fire not only after acceptance but inside long-running work: before a handoff, after a major milestone, before a risky fork, when progress stalls. A session can die at any moment; the organization's state survives it.

The clean-session rule is also what makes workers cheap to replace. A worker that dies mid-task takes nothing with it: the brief is on disk, the findings are in memory, and a fresh worker picks up from the checkpoint.

The last step feeds the first: lessons, complaints and metrics recorded at the checkpoint shape the next cycle — this is where the working cycle hands off to the learning loop.

## Acceptance by verifiable artifacts

A verdict is never taken on someone's word. L0 accepts or returns work against an **acceptance package** — machine-checkable evidence attached to the report:

```text
criterion results · verification commands · exit codes · artifact hashes
independent review verdict · known limitations · unresolved risks
```

"It works" is a claim. `verification command → exit 0` is evidence. The acceptance criteria come from the brief, so L0 stays independent of the implementation: it judges artifacts, not the executor's confidence. Known limitations are part of the package — declared, not hidden.

High-risk deliveries add one more layer: the work of L1 goes to a **separate L2 reviewer** before L0 sees it, and an independent L1 audit can be placed above that.

```text
L1 delivery → separate L2 reviewer → acceptance package → L0 verdict
```

Because the package is a fixed contract, a verdict stays auditable months later: what was checked, by which commands, against which criteria — and what was knowingly left undone.

## Council — independent opinions at hard forks

**Status: DESIGNED** — the schema already lives in memory; the runtime is on the roadmap. See [maturity.md](https://github.com/chekh/mister-wolf/blob/main/docs/concept/maturity.md) for the honest state.

When a fork is genuinely hard, the working cycle can summon a Council. Summoning is measured, not a matter of taste — the triggers are explicit:

- high uncertainty or high risk;
- an irreversible decision;
- an interdisciplinary conflict;
- conflicting evidence;
- stalled progress at L1;
- an architectural decision with a large blast radius.

L1 calls the Council for technical forks inside its delivery; L0 calls it for product or strategy forks. Several agents then produce **independent opinions**, each formed before reading the others, so the panel is not five copies of the first answer. A synthesis keeps what survives scrutiny: accepted claims, rejected alternatives, unresolved dissent.

An opinion is a contract, not a vote: position, claims, evidence, assumptions, confidence, risks, counterexamples and the validation it recommends. The Council advises; the level that owns the decision still decides. And because a panel of agents is expensive, it is bounded: quorum, budget and a maximum number of rounds.

## Status stamps — the honesty legend

Every mechanism in the concept carries a maturity stamp, and so does this page:

| Stamp                | Meaning                                                    |
| -------------------- | ---------------------------------------------------------- |
| **I3**               | implemented and exercised daily in Wolf's own development  |
| **validating (E1x)** | target effect under benchmark validation (program E1a–E1e) |
| **DESIGNED**         | specified in the concept; no runtime yet — on the roadmap  |

Today: the L0/L1/L2 hierarchy and the working cycle are **I3** — dogfooded on this repository; the Council runtime is **DESIGNED**. The full matrix lives in [maturity.md](https://github.com/chekh/mister-wolf/blob/main/docs/concept/maturity.md).

## Where the organization goes next

The organization improves through turnover rather than despite it. An agent's behavior lives in its playbook — a mutable "face" stored in memory — while the frame (role, boundaries, prohibitions) stays fixed. When the loop finds a better way, the face is replaced by a new version; the agent itself is never attached to the outcome.

- [Memory Model](/guide/memory) — where the organization's state lives: seven types, lifecycle, supersede chains.
- [Learning Loop](/guide/feedback) — how the organization learns: complaint → triage → playbook mutation.
- [Getting Started](/guide/getting-started) — set up the organization in your project.
