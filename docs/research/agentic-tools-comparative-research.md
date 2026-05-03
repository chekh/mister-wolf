# Agentic Tools Comparative Research

**Generated:** 2026-05-03
**Research Scope:** 11 repositories analyzed for architectural requirements extraction
**Purpose:** Answer the question — "If skills, subagents, plugins, context tools, and workflows already exist, what layer should Mr. Wolf add?"

---

## Research Hypothesis

> **Mr. Wolf must be a front-agent + process-control layer for existing agentic tools, not a standalone agent runtime.**

This hypothesis is tested by analyzing 11 projects that solve pieces of the agentic tooling puzzle:

1. [obra/superpowers](https://github.com/obra/superpowers) — Skill / methodology layer
2. [joshuadavidthomas/opencode-agent-skills](https://github.com/joshuadavidthomas/opencode-agent-skills) — Skill loading layer
3. [kdcokenny/opencode-background-agents](https://github.com/kdcokenny/opencode-background-agents) — Subagent / delegation layer
4. [IgorWarzocha/Opencode-Context-Analysis-Plugin](https://github.com/IgorWarzocha/Opencode-Context-Analysis-Plugin) — Context / observability layer
5. [code-yeongyu/oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) — Multi-agent orchestration
6. [alvinunreal/oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim) — Multi-agent orchestration (slim)
7. [AnganSamadder/opentmux](https://github.com/AnganSamadder/opentmux) — Runtime visibility / terminal UX
8. [Cluster444/agentic](https://github.com/Cluster444/agentic) — Context engineering / workflow packs
9. [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) — Subagent catalog
10. [darrenhinde/OpenAgentsControl](https://github.com/darrenhinde/OpenAgentsControl) — Approval / pattern-control
11. [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec/) — Spec-driven development / planning layer

---

## Research Methodology

For each project, the following dimensions were analyzed:

- **Integration surface** — How the project integrates with host tools (plugin, command pack, skill library, subagent catalog, CLI, hook, tmux/runtime UI, config pack, MCP, other).
- **Core primitives** — What abstractions the project exposes (agents, subagents, skills, commands, workflows, hooks, artifacts, memory, context, policies, approvals, traces/logs).
- **Model routing** — How models are selected (none, per agent, per category, per command, per step, dynamic, unknown).
- **Context strategy** — How context is assembled, injected, compacted, persisted, and budgeted.
- **Artifact / memory model** — What files are created, how artifacts relate, what survives restart/compaction.
- **Safety / governance** — What approval gates, constraints, checks, and sandboxing exist.
- **Strengths & Limitations** — What the project does well and where it falls short.
- **Wolf gap / opportunity** — What layer Wolf should add on top of or alongside this approach.

See `agentic-tools-project-cards.md` for detailed Project Cards.

---

## Key Findings

### Finding 1: No Project Covers the Full Stack

Every project solves **one aspect** well, but leaves the rest unaddressed:

| Layer | Covered By | Gap |
|-------|-----------|-----|
| Skills | Superpowers, opencode-agent-skills | No orchestration, no policy enforcement |
| Subagents | opencode-background-agents, Awesome Subagents | No runtime state, no workflow engine |
| Model Routing | Oh My OpenAgent, oh-my-opencode-slim | Static per-agent, no dynamic step-level routing |
| Context | Context Analysis Plugin, Agentic | Reactive, no predictive compaction |
| Visibility | opentmux | Host-specific (tmux only), no artifact awareness |
| Approval | OpenAgents Control, Agentic | Prompt-level, no deterministic enforcement |
| Workflows | Agentic, OpenAgents Control | Prompt-driven, not executable state machines |
| Persistence | opencode-background-agents | Files only, no structured artifact memory |
| Cross-Platform | Superpowers, OpenSpec | Plugin-per-platform или code generation, no standalone runtime |
| Spec/Planning | OpenSpec | Planning only, no runtime execution, no policy enforcement |

**Conclusion:** There is no unified layer that ties skills, subagents, models, context, artifacts, policies, and workflows together into a coherent runtime. OpenSpec covers planning/specification well, but lacks execution.

---

### Finding 2: Prompt-Driven Workflows Dominate

All workflow-like behavior in existing projects is **prompt-driven**, not declarative:

- **Superpowers:** Sequence of skills (brainstorming → planning → TDD → review) — loaded into prompt, agent decides when to invoke.
- **Agentic:** Phases (Research → Plan → Execute → Commit → Review) — human triggers each phase manually.
- **Oh My OpenAgent:** Commands (`/init-deep`, `/refactor`) — trigger prompt sequences, not state machines.
- **OpenAgents Control:** 6-stage workflow (Discover → Propose → Approve → Execute → Validate → Ship) — described in markdown, not executed automatically.

**Consequence:** No project can guarantee that a workflow will complete, that steps will execute in order, or that artifacts will be produced. The agent may skip steps, loop, or hallucinate.

**Wolf opportunity:** A declarative workflow engine (DAG, state machine, runner registry) that executes workflows reliably, with policy checks at each step. OpenSpec's schema-driven artifact workflows (proposal → specs → design → tasks) could be executed as Wolf workflows, with each artifact becoming a typed node in the Artifact Memory Graph.

---

### Finding 3: Safety Is Prompt-Based, Not Enforced

All safety mechanisms in existing projects rely on the agent **following instructions**:

- **Superpowers:** "Ask your human partner" (TDD skill), HARD-GATE (brainstorming skill).
- **OpenAgents Control:** `@approval_gate`, `@stop_on_failure` in markdown — suggestions, not blocks.
- **Agentic:** Tool restrictions in YAML frontmatter — enforced by host tool, not by framework.
- **oh-my-opencode-slim:** Relies on OpenCode permissions, no built-in governance.

**Consequence:** If the agent ignores the instruction (e.g., due to context compaction, model drift, or adversarial prompt), there is no fallback. Safety is probabilistic, not deterministic.

**Wolf opportunity:** A deterministic policy engine that checks operations **before** execution (regex denylist, token budget arithmetic, subagent depth counter, approval state machine). Block is guaranteed, regardless of what the agent "thinks." OpenSpec has validation before archive, but no enforcement before `apply` — Wolf should add safety gates before any code execution.

---

### Finding 4: Artifacts Are Files, Not Managed Objects

Every project creates files, but none treats them as **managed artifacts** (except OpenSpec, which has the best artifact model but still file-based):

- **Superpowers:** Design specs in `docs/superpowers/specs/` — no lifecycle, no relationships.
- **Agentic:** `thoughts/` directory with YAML frontmatter — good structure, but no query interface, no versioning.
- **Oh My OpenAgent:** Task JSON with `blockedBy`/`blocks` — task dependencies, not artifact graph.
- **OpenAgents Control:** `.tmp/` ephemeral files — no persistence, no versioning.
- **OpenSpec:** `proposal.md`, `specs/`, `design.md`, `tasks.md` with delta-specs and schema-driven dependency graph — best artifact model, but markdown-only, no runtime integration.

**Consequence:** No project can answer: "Show me all review artifacts related to this ticket from last month." Artifacts are opaque to the system.

**Wolf opportunity:** An Artifact Memory Graph — typed artifacts with relationships, lifecycle, query interface, source of truth, and versioning. Wolf should learn from OpenSpec's delta-spec model and schema-driven workflows, but add runtime integration and structured persistence (SQLite).

---

### Finding 5: Host Lock-In Is Universal

All 11 projects are **tightly coupled to one host tool** (or generate adapters for multiple):

- **OpenCode ecosystem:** 8 projects (opencode-agent-skills, opencode-background-agents, Context Analysis Plugin, Oh My OpenAgent, oh-my-opencode-slim, opentmux, Agentic, OpenAgents Control).
- **Claude Code ecosystem:** 1 project (Awesome Claude Code Subagents).
- **Multi-platform plugin:** 1 project (Superpowers — but still plugin-per-platform, not standalone).
- **Multi-tool code generation:** 1 project (OpenSpec — generates skills/commands for 25+ AI tools, but is itself a Node.js CLI, not a runtime).

**Consequence:** Users cannot migrate workflows, skills, or agents between tools. Each ecosystem is a silo.

**Wolf opportunity:** A host-agnostic runtime with adapter layer (OpenCode, Claude Code, Cursor, Codex, Gemini, Copilot, IDE, Standalone). Workflows are written once, run anywhere. OpenSpec demonstrates that adapter pattern through code generation works for 25+ tools — Wolf should use similar pattern at runtime level (universal adapter interface + per-tool implementations).

---

### Finding 6: Token Visibility Is an Afterthought

Only **1 project** (Context Analysis Plugin) provides token visibility:

- Multi-tokenizer engine (tiktoken + HuggingFace + fallback).
- ASCII bar charts showing token distribution.
- Tool-level aggregation.

All other projects rely on host tool behavior or ignore token usage entirely.

**Consequence:** No project can proactively alert when a workflow is about to exceed its budget. No project can optimize context assembly based on token cost.

**Wolf opportunity:** Token budget as a first-class primitive — per workflow, per step, per agent. Proactive alerts, cost estimation, historical analytics.

---

### Finding 7: Background Delegation Lacks Orchestration

opencode-background-agents is the only project that provides **persistent background delegation**:

- Read-only subagents by default.
- Results saved to disk (survive compaction/restart).
- Fire-and-forget model.

But it lacks:
- Workflow orchestration (what happens after delegation completes?).
- Artifact integration (results are markdown files, not typed artifacts).
- Cross-session tracking (in-memory state is lost on restart).

**Wolf opportunity:** Universal background delegation layer with workflow integration — when background task completes, workflow continues. Results become typed artifacts in Artifact Store.

---

## Research Questions Answered

### Q: If skills already exist (Superpowers, opencode-agent-skills), why does Wolf need its own skill system?

**A:** Wolf does not replace existing skill systems. Wolf adds **orchestration**:

| Existing | Wolf Adds |
|----------|-----------|
| Skill format (YAML frontmatter + markdown) | Skill registry with namespace, versioning, dependencies |
| Skill loading into context | Skill selection based on workflow step, artifact type, model route |
| Skill auto-discovery | Skill enforcement (allowed-tools checked at runtime) |
| Skill as prompt injection | Skill as executable step in declarative workflow |

**Wolf skill system = existing format + runtime integration.**

---

### Q: If subagents already exist (Awesome Subagents, Oh My OpenAgent), why does Wolf need subagent management?

**A:** Existing subagent catalogs provide **definitions**, not **orchestration**:

| Existing | Wolf Adds |
|----------|-----------|
| Subagent definition (role + model + prompt) | When to delegate (step-level decision) |
| Manual delegation (`@agent` or `task()`) | Whom to delegate (dynamic selection based on task) |
| Per-agent model preset | Which model to use (step-level routing with fallback) |
| Subagent runs in isolation | What artifact must return (artifact contract) |
| Result in chat or file | How to record in trace/memory (Case Store integration) |

**Wolf subagent management = catalog + orchestration + governance.**

---

### Q: If model routing already exists (Oh My OpenAgent, oh-my-opencode-slim), why does Wolf need its own router?

**A:** Existing routing is **static per-agent/category**, not dynamic per-step:

| Existing | Wolf Adds |
|----------|-----------|
| Per-agent model preset | Step-level model selection based on task complexity |
| Category-based routing (`visual-engineering` → model X) | Token budget-aware routing ("only 20% budget left → use cheaper model") |
| Fallback chains on API error | Artifact-type routing ("architecture doc → capable model, test → fast model") |
| Static frontmatter | Dynamic routing based on content analysis |

**Wolf model router = static presets + dynamic overlay.**

---

### Q: If approval workflows exist (OpenAgents Control, Agentic), why does Wolf need policy engine?

**A:** Existing approvals are **prompt-based or host-dependent**, not deterministic:

| Existing | Wolf Adds |
|----------|-----------|
| `@approval_gate` in markdown | Runtime state machine: `approved?` checked before execution |
| Host tool permissions (ask/allow/deny) | Deterministic denylist (regex match, instant block) |
| Human-in-the-loop checkpoints | Policy inheritance (org → team → project → workflow) |
| Tool restrictions in frontmatter | Audit trail (every decision recorded in Case Store) |

**Wolf policy engine = prompt suggestions + deterministic enforcement + audit.**

---

### Q: If context tools exist (Context Analysis Plugin, Agentic), why does Wolf need context resolver?

**A:** Existing tools are **reactive or manual**, not predictive:

| Existing | Wolf Adds |
|----------|-----------|
| Token visibility (after consumption) | Token budget (before execution, with estimation) |
| Compaction on event | Predictive compaction ("based on usage pattern, compact now") |
| Manual context management | Automatic context assembly (what to load, why, from which source) |
| Ephemeral analysis | Persistent context profiles (trends across sessions) |

**Wolf context resolver = visibility + budgeting + prediction + persistence.**

---

### Q: If spec-driven development already exists (OpenSpec), why does Wolf need its own artifact system?

**A:** OpenSpec excels at **planning and specification**, but lacks **runtime integration**:

| OpenSpec | Wolf Adds |
|----------|-----------|
| Delta-spec format for brownfield changes | Runtime execution of spec-driven workflows |
| Schema-driven artifact dependency graph | Artifact Memory Graph with query + lifecycle |
| Specs/Changes separation | Policy enforcement before `apply` |
| Archive flow with audit trail | Structured persistence (SQLite) + cross-session query |
| Markdown-only artifacts | Typed artifacts (code, test, structured outputs) |
| Code generation for 25+ AI tools | Runtime adapters (not just code generation) |

**Wolf artifact system = OpenSpec's planning model + runtime execution + structured persistence.**

---

## New Finding: Spec-Driven Development Gap

### Finding 8: Planning and Execution Are Separated

OpenSpec is the only project that focuses on **structured planning** through specs:

- Delta-spec model (ADDED/MODIFIED/REMOVED/RENAMED) for brownfield development.
- Schema-driven artifact workflows (proposal → specs → design → tasks).
- Specs/Changes separation — specs are source of truth, changes are proposed modifications.
- Archive flow — full context of why/how/what is preserved.

But OpenSpec has **no runtime execution engine**:
- AI directly executes code from `tasks.md` without governance.
- No policy enforcement before `apply`.
- No model routing or multi-agent orchestration.
- No context management or token budget.
- No traces/logs of execution.

**Consequence:** Even the best planning is useless without controlled execution. OpenSpec plans well, but cannot guarantee safe, observable, policy-governed execution.

**Wolf opportunity:** Wolf can be the **runtime layer for spec-driven development**. OpenSpec creates the plan (proposal, specs, design, tasks), Wolf executes it with policy checks, model routing, artifact management, and trace recording.

**Synergy:**
- OpenSpec → Planning layer (what to build, why, how).
- Wolf → Execution layer (orchestrate, govern, observe, persist).

---

## Taxonomy Summary

The 11 projects cluster into 9 classes:

1. **Skill Libraries** — Superpowers, opencode-agent-skills
2. **Host Plugins** — opencode-background-agents, Context Analysis Plugin, opentmux
3. **Agent Orchestration Packs** — Oh My OpenAgent, oh-my-opencode-slim, OpenAgents Control
4. **Context / Memory Tools** — Agentic, OpenAgents Control
5. **Runtime Visibility Tools** — opentmux
6. **Approval / Pattern-Control Tools** — OpenAgents Control, Agentic
7. **Subagent Catalogs** — Awesome Claude Code Subagents
8. **Methodology / Workflow Packs** — Superpowers, Agentic, OpenAgents Control
9. **Spec-Driven Development Frameworks** — OpenSpec

See `agentic-tools-cross-findings.md` for detailed taxonomy and coverage matrix.

---

## Wolf Positioning

### What Wolf Is

Wolf is a **front-agent + process-control layer** that:

1. Accepts user requests through a single facade (Wolf Agent).
2. Determines the scenario and selects the workflow.
3. Orchestrates skills, subagents, models, and tools through a declarative workflow engine.
4. Enforces policies deterministically (not just prompt instructions).
5. Manages artifacts as typed, related, versioned objects (not just files).
6. Persists state across sessions (Case Store with SQLite index).
7. Adapts to any host tool through adapter layer (OpenCode, Claude Code, Cursor, etc.).
8. Provides projections of process state (CLI, tmux, web, IDE, logs).

### What Wolf Is Not

- **Not a replacement** for Claude Code, OpenCode, Cursor, or any host tool.
- **Not a model** — Wolf orchestrates existing models, does not create them.
- **Not a plugin** — Wolf is a standalone runtime with adapters, not a plugin for one tool.
- **Not a marketplace** — Wolf can import skills/agents, but does not host them.
- **Not a chatbot** — Wolf is a process engine, not a conversational agent.

### Wolf vs. Existing Projects

| Dimension | Existing Projects | Mr. Wolf |
|-----------|------------------|----------|
| Runtime | Host tool (OpenCode, Claude) | Standalone kernel + adapters |
| Workflows | Prompt-driven sequences | Declarative YAML DAG + state machine |
| Skills | Prompt injection | Registry + executable steps |
| Subagents | Manual delegation (`task()`, `@agent`) | Orchestrated delegation (when/whom/how) |
| Model Routing | Static per-agent/category | Dynamic per-step with budget awareness |
| Artifacts | Files on disk | Typed objects with graph + lifecycle |
| Safety | Prompt instructions | Deterministic policy + audit trail |
| Context | Reactive compaction | Predictive resolver with budget |
| Persistence | Ephemeral or file-based | Case Store (SQLite + files) |
| Visibility | Host-specific (tmux, chat) | Projection model (CLI, web, IDE, logs) |
| Cross-Platform | Plugin-per-platform | Host-agnostic adapters |

---

## Implications for Wolf Concept

The research reinforces 10 existing concepts and adds 3 new ones:

**Reinforced:**
1. Wolf as front-agent (not replacement runtime)
2. Process-level control (declarative workflow engine)
3. Step-level model routing (dynamic, budget-aware)
4. Artifact Memory (typed, related, versioned)
5. Host Adapter Layer (OpenCode, Claude Code, Cursor, etc.)
6. Policy Overlay (deterministic enforcement)
7. Projection Model (CLI, tmux, web, IDE, logs)
8. Imported Skills/Agents Registry (namespace, versioning)
9. Context Budget / Visibility (first-class primitive)
10. Read-only background delegation by default

**New:**
11. Deterministic policy (not prompt instruction) — runtime checks before execution
12. Workflow as Skill, Skill as Workflow — unified abstraction
13. Artifact Contract — input/output artifact validation per step

See `wolf-concept-implications.md` for detailed analysis.

---

## Implications for FUP

The research reshapes FUP from "standalone CLI-agent" to **"reference sidecar / adapter for OpenCode"**:

**FUP Should Prove:**
1. Declarative process control works (YAML workflow + state machine).
2. Policy enforcement is real (deterministic block, not prompt suggestion).
3. Artifact memory persists across sessions (typed artifacts in Case Store).
4. Host-agnostic runtime is feasible (OpenCode + Standalone adapters).

**FUP Should NOT Try to Prove:**
1. Replacement of host tools.
2. Multi-domain universality.
3. AI model superiority.
4. Real-time collaboration.
5. Marketplace/registry.

**Most Realistic First Integration:** OpenCode Adapter (plugin architecture, TypeScript, event bus, alignment with existing ecosystem).

**Capability Boundaries (Read-Only by Default):**
- Background delegation → read-only.
- Subagent execution → read-only.
- Context analysis, artifact query, trace reading → read-only.
- File write/edit, bash execution, git operations, tool use → require approval.
- Destructive operations (`rm -rf`, `sudo`, `*.env*`) → deterministic block.

**Where Deterministic Policy Is Needed (Not Prompt):**
- File path allowlists (regex match).
- Command denylist (regex match).
- Token budget (arithmetic check).
- Subagent depth (counter).
- Approval gate (state check).
- Tool allowlist (set membership).

See `wolf-fup-implications.md` for detailed FUP definition, success criteria, timeline, and risk register.

---

## Conclusion

### The Core Question

> If the ecosystem already has skills, subagents, OpenCode plugins, context tools, command packs, methodology packs, and approval workflows, why does Wolf need to exist?

### The Answer

**Existing projects solve individual pieces. Wolf solves the integration.**

Every analyzed project is valuable in its domain:
- Superpowers teaches discipline and methodology.
- opencode-agent-skills teaches skill discovery and compaction resilience.
- opencode-background-agents teaches persistent background delegation.
- Context Analysis Plugin teaches token visibility.
- Oh My OpenAgent teaches multi-model orchestration.
- oh-my-opencode-slim teaches cost-conscious delegation.
- opentmux teaches live process visibility.
- Agentic teaches context engineering and phased work.
- Awesome Claude Code Subagents teaches specialization at scale.
- OpenAgents Control teaches pattern governance and approval gates.
- **OpenSpec teaches delta-spec planning and schema-driven artifact workflows.**

But **no project ties these pieces together** into a coherent, declarative, policy-governed, artifact-oriented, host-agnostic runtime.

**Wolf is that layer.**

Wolf does not compete with any of these projects. Wolf **orchestrates** them:
- Wolf can load Superpowers skills as workflow steps.
- Wolf can use opencode-agent-skills for skill discovery.
- Wolf can delegate background work through opencode-background-agents patterns.
- Wolf can apply Oh My OpenAgent's category-based routing as a model router preset.
- Wolf can display processes through opentmux-inspired projections.
- Wolf can adopt OpenAgents Control's approval patterns as policy primitives.
- **Wolf can execute OpenSpec's schema-driven workflows with runtime governance.**

**Wolf = front-agent + process-control + artifact memory + policy overlay + host adapters.**

**Wolf + OpenSpec synergy:** OpenSpec creates the plan (delta-specs, artifact dependencies). Wolf executes the plan (workflow engine, policy checks, model routing, trace recording). Together they form a complete spec-driven development system.

The research validates that this layer is missing and needed.

---

## Output Files

This research produced the following artifacts:

| File | Content |
|------|---------|
| `docs/research/agentic-tools-comparative-research.md` | This file — main research document |
| `docs/research/agentic-tools-project-cards.md` | Detailed Project Cards for all 11 repositories |
| `docs/research/agentic-tools-cross-findings.md` | Cross-project analysis: patterns, gaps, taxonomy |
| `docs/research/wolf-concept-implications.md` | How research impacts Mr. Wolf concept |
| `docs/research/wolf-fup-implications.md` | How research reshapes First Useful Product |

---

## Appendix: Repositories Analyzed

| # | Repository | Host | Primary Purpose |
|---|-----------|------|-----------------|
| 1 | [obra/superpowers](https://github.com/obra/superpowers) | Multi-platform | Skill library + methodology |
| 2 | [joshuadavidthomas/opencode-agent-skills](https://github.com/joshuadavidthomas/opencode-agent-skills) | OpenCode | Skill discovery & loading |
| 3 | [kdcokenny/opencode-background-agents](https://github.com/kdcokenny/opencode-background-agents) | OpenCode | Background delegation |
| 4 | [IgorWarzocha/Opencode-Context-Analysis-Plugin](https://github.com/IgorWarzocha/Opencode-Context-Analysis-Plugin) | OpenCode | Token visibility |
| 5 | [code-yeongyu/oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) | OpenCode | Multi-agent orchestration |
| 6 | [alvinunreal/oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim) | OpenCode | Multi-agent orchestration (slim) |
| 7 | [AnganSamadder/opentmux](https://github.com/AnganSamadder/opentmux) | OpenCode | Runtime visibility |
| 8 | [Cluster444/agentic](https://github.com/Cluster444/agentic) | OpenCode | Context engineering |
| 9 | [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) | Claude Code | Subagent catalog |
| 10 | [darrenhinde/OpenAgentsControl](https://github.com/darrenhinde/OpenAgentsControl) | OpenCode | Approval / governance |
| 11 | [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec/) | Node.js CLI (25+ AI tools) | Spec-driven development |
