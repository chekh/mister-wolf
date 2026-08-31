---
layout: home
hero:
  name: PROJECT MEMORY / LOCAL-FIRST
  text: Project memory that outlives the session
  tagline: A local-first layer of memory, processes, agents and tools for AI coding — a single source of truth that agents write their experience to and read context from. It is not an orchestrator and not yet another agent — it is a substrate under any agent.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: CLI Reference
      link: /guide/cli
features:
  - title: Local-first storage
    details: Everything lives in .wolf/ inside your project — markdown memory objects, a SQLite search index, no cloud. Decisions, lessons, rules and tools stay with the project after the session ends and make the next task cheaper.
  - title: CLI + MCP dual surface
    details: One wolf binary, two surfaces. Humans and scripts use the CLI; agents use the stdio MCP server (wolf mcp) with the same memory, processes and governance on any MCP-compatible platform.
  - title: Call injections
    details: wolf call delivers the right active rules, lessons and call-injections at session start — matched by trigger keywords, ranked by importance, confidence and recency, with an optional compact budget.
  - title: Lifecycle & governance
    details: 25 memory types, 16 lifecycle statuses, supersede chains (wolf get <id> --latest follows them to the current object) and governance axes (memory_class, truth_role, lifetime) keep accumulated knowledge from becoming noise.
  - title: Rules, work threads & blockers
    details: Rules with project or global scope, work threads with goals, checkpoints and diffs, blockers with impact and workarounds — the working state your agents share instead of losing it between sessions.
  - title: Self-learning loop
    details: The learn loop (digest → propose → validate → activate) turns repeated signal-log patterns into draft lessons and rules; mileage-based decay retires knowledge that no longer pays off.
---

## Why Mr. Wolf?

AI coding agents are powerful but forgetful. Mr. Wolf is a local-first layer of memory, processes, agents and tools for AI coding: a single source of truth that agents write their experience to and read context from. It is not an orchestrator and not yet another agent — it is a substrate under any agent. Accumulation instead of evaporation.

| #   | Problem                                  | Symptom                                                                        |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| P1  | Context is lost between sessions         | the agent starts from scratch                                                  |
| P2  | Experience is not reused                 | recurring tasks are solved from scratch: prose reasoning + new one-off scripts |
| P3  | Project documents live apart from agents | no single source of truth                                                      |
| P4  | Accumulated knowledge becomes noise      | memory grows, value drops                                                      |

Ready to give your agents a memory? Start with the [Getting Started guide](/guide/getting-started).
