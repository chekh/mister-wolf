# Implications for Mr. Wolf First Useful Product (FUP)

**Generated:** 2026-05-03
**Scope:** How comparative research reshapes FUP definition
**Sources:** `agentic-tools-project-cards.md`, `agentic-tools-cross-findings.md`, `wolf-concept-implications.md`
**New Source Added:** OpenSpec (Fission-AI/OpenSpec) — spec-driven development framework

---

## Core Question

Если в экосистеме уже есть skills, subagents, OpenCode plugins, context tools, command packs, methodology packs, approval workflows **и spec-driven development frameworks (OpenSpec)**, то **что должен доказать FUP**?

**Ответ:** FUP должен доказать, что Wolf добавляет **единый оркестрационный слой**, который скрывает от пользователя переключение между agents/skills/models/tools, но делает процесс декларативным, проверяемым, policy-governed, artifact-oriented и переносимым между host-инструментами.

---

## What FUP Should Prove

### 1. Declarative Process Control Works

**Что доказать:** Можно описать процесс в YAML и Wolf выполнит его, отслеживая состояние, проверяя policy, создавая artifacts.

**Почему важно:** Все существующие проекты используют prompt-driven workflows (Superpowers, Agentic, Oh My OpenAgent). OpenSpec имеет schema-driven artifact workflows, но без runtime execution. Ни один проект не имеет executable state machine, который выполняет declarative workflows с policy checks и artifact contracts. Если Wolf покажет, что YAML workflow может orchestrate real work — это differentiation.

**Как доказать:**
- Один YAML workflow (5-7 шагов).
- Выполнение через Wolf engine.
- State visible в CLI и файловом trace.
- Policy checks на критичных шагах.
- Artifacts создаются и сохраняются.

---

### 2. Policy Enforcement Is Real, Not Just Prompt Instructions

**Что доказать:** Wolf может block операцию, даже если агент "хочет" её выполнить. Policy = runtime check, не suggestion.

**Почему важно:** Все существующие проекты полагаются на prompt-based safety (Superpowers: "ask your human partner", OpenAgents Control: "@approval_gate" в markdown). OpenSpec имеет validation перед archive, но нет enforcement перед `apply`. Нет deterministic enforcement. Если Wolf покажет, что `rm -rf /*` blocked независимо от того, что "думает" агент — это differentiation.

**Как доказать:**
- Workflow с шагом, который пытается выполнить запрещённую операцию.
- Wolf block'ит операцию до выполнения.
- Audit trail записывает попытку и block.
- Пользователь получает notification с объяснением.

---

### 3. Artifact Memory Persists Across Sessions

**Что доказать:** Artifacts создаются в одной сессии, доступны в следующей, имеют тип, статус, связи.

**Почему важно:** Все существующие проекты создают файлы, но нет managed artifact system. Agentic имеет `thoughts/`, но нет query, lifecycle, relationships. Если Wolf покажет, что artifact созданный вчера можно найти по типу и связям — это differentiation.

**Как доказать:**
- Сессия 1: workflow создаёт artifact типа `research_doc`.
- Сессия 2 (новый процесс): workflow запрашивает "найти последний research_doc по теме X".
- Wolf находит artifact через SQLite index.
- Workflow продолжается с использованием найденного artifact.

---

### 5. Spec-Driven Execution Works (Optional / Post-FUP)

**Что доказать:** Wolf может взять план от OpenSpec (или похожего инструмента) и выполнить его с governance.

**Почему важно:** OpenSpec показывает, что spec-driven development имеет спрос. Но OpenSpec не имеет runtime execution. Если Wolf покажет, что может выполнять spec-driven workflows — это открывает новый use case.

**Как доказать:**
- OpenSpec создаёт `proposal.md` + `specs/` + `design.md` + `tasks.md`.
- Wolf читает эти artifacts и создаёт workflow.
- Wolf выполняет workflow с policy checks, model routing, artifact tracking.
- Результат: выполненные задачи + trace + archive.

**Note:** Это post-FUP enhancement. FUP не требует OpenSpec integration, но architecture должна позволять его.

---

## What FUP Should NOT Try to Prove

### 1. FUP Should NOT Try to Replace Host Tools

**Почему:** Все существующие проекты — plugins/packs для host tools. Пользователи не ищут replacement для Claude Code или OpenCode. Они ищут better orchestration поверх них.

**Risk:** Если FUP позиционирует Wolf как "лучший Claude Code" — пользователи отвергнут, потому что уже инвестировали в host tool.

**Mitigation:** FUP — это OpenCode-like command pack / sidecar. Не standalone CLI-agent. Не autonomous runtime replacement.

---

### 2. FUP Should NOT Try to Prove Multi-Domain Universality

**Почему:** Все 10 проектов фокусируются на coding/development. Awesome Claude Code Subagents имеет 131+ агента по разным доменам, но это каталог, не runtime. Если Wolf попытается доказать universality (legal, sales, HR, finance) — размывает фокус.

**Risk:** "Universal framework" звучит как "ничего конкретного".

**Mitigation:** FUP фокусируется на **одном домене** (software development), но архитектура показывает, как добавить другие домены через domain packs. OpenSpec integration — отдельный use case, не core FUP.

---

### 3. FUP Should NOT Try to Prove AI Model Superiority

**Почему:** Wolf не создаёт модели. Wolf orchestrates существующие модели. Все проекты с model routing (Oh My OpenAgent, oh-my-opencode-slim) используют существующие API (Claude, GPT, Grok).

**Risk:** Сравнение моделей — red herring. Wolf не про модели, Wolf про orchestration.

**Mitigation:** FUP использует одну модель (например, Claude via OpenCode или direct API). Model routing — future enhancement, не FUP requirement.

---

### 4. FUP Should NOT Try to Prove Real-Time Collaboration

**Почему:** Опентмюкс показывает live tmux panes, Oh My OpenAgent — background agents с tmux. Это cool, но не core value. Real-time collaboration — projection layer, не runtime.

**Risk:** Tmux integration требует significant effort и привязывает к Unix. Не portable.

**Mitigation:** Projection Model — post-FUP. FUP имеет CLI projection (text-based status) и файловый trace. Это достаточно для proof of concept.

---

### 5. FUP Should NOT Try to Prove Marketplace / Registry

**Почему:** Awesome Claude Code Subagents имеет marketplace, opencode-agent-skills — multi-source discovery. Но marketplace требует infrastructure, hosting, community.

**Risk:** Marketplace — distraction от core value (orchestration).

**Mitigation:** Imported Skills Registry — post-FUP. FUP использует local skills/workflows из файловой системы. Registry — enhancement для MVP3+.

---

## Most Realistic First Host-Tool Integration Surface

### OpenCode Adapter (Recommended)

**Почему OpenCode:**
1. **Plugin architecture** — OpenCode имеет mature plugin API (hooks, tools, events).
2. **Wolf codebase already uses OpenCode** — AGENTS.md предписывает OpenCode conventions.
3. **Alignment with existing projects** — 8 из 10 проектов target OpenCode. Это validates ecosystem.
4. **TypeScript runtime** — Wolf написан на TypeScript, OpenCode plugin API — TypeScript.
5. **Event bus** — OpenCode имеет event system, который может map на Wolf Event Bus.

**Integration surface:**
- Wolf как OpenCode plugin (`opencode.json` → `wolf-plugin`).
- Commands: `/wolf run <workflow>`, `/wolf status`, `/wolf artifacts`.
- Hooks: `session.start` → inject Wolf bootstrap, `session.compacted` → re-inject context.
- Tools: Wolf предоставляет tools для OpenCode (run_workflow, check_policy, find_artifact).
- Events: Wolf слушает OpenCode events и записывает в Case Store.

**Alternative:** Claude Code Adapter
- Claude Code имеет plugin system (`.claude/plugins/`), но менее mature чем OpenCode.
- Superpowers уже покрывает Claude Code ecosystem.
- Wolf для Claude Code — secondary priority.

**Decision:** OpenCode Adapter — primary. Standalone Adapter — secondary (для proof of host-agnostic concept).

---

## Capability Boundaries That Should Be Read-Only

### By Default (Read-Only)

На основе анализа opencode-background-agents и oh-my-opencode-slim:

| Capability | Default | Override |
|------------|---------|----------|
| Background delegation | Read-only | Policy allows write with approval |
| Subagent execution | Read-only | Parent workflow can grant write |
| Context analysis | Read-only | N/A |
| Artifact query | Read-only | N/A |
| Trace reading | Read-only | N/A |
| Policy checking | Read-only | N/A |

### Require Approval

| Capability | Approval Required | Exception |
|------------|-------------------|-----------|
| File write/edit | Yes | Trusted agents by policy |
| Bash execution | Yes | Allowlisted commands |
| Git operations | Yes | Read-only ops exempt |
| Tool use (webfetch, etc.) | Yes | Read-only tools exempt |
| Model switch | Yes | Fallback chains auto-approved |
| Workflow modification | Yes | Policy allows auto-update |

### Never Allowed (Deterministic Block)

| Operation | Block Reason |
|-----------|--------------|
| `rm -rf /`, `rm -rf /*` | Destructive |
| `sudo *` | Privilege escalation |
| Write to `*.env*`, `*.key` | Sensitive files |
| Write to `node_modules/` | Generated files |
| Subagent depth > 3 | Recursion prevention |
| Token budget exceeded | Budget protection |

---

## Where Deterministic Policy Is Needed (Not Prompt Instruction)

### Critical: Deterministic Policy

| Area | Why Deterministic | Example |
|------|-------------------|---------|
| File path allowlists | Regex match, instant | `*.env*` → block |
| Command denylist | Regex match, instant | `sudo`, `rm -rf` → block |
| Token budget | Arithmetic check, instant | `used > budget` → pause |
| Subagent depth | Counter, instant | `depth > 3` → block |
| Approval gate | State check, instant | `not approved` → block |
| Tool allowlist | Set membership, instant | `tool not in allowed` → block |

### Acceptable: Prompt Instruction

| Area | Why Prompt-Based OK | Example |
|------|---------------------|---------|
| Code style | Guideline, not safety | "Use snake_case" |
| Design patterns | Recommendation | "Prefer dependency injection" |
| Testing approach | Methodology | "Use TDD" |
| Documentation format | Convention | "Use Google-style docstrings" |
| Review checklist | Guidance | "Check for SQL injection" |

### Hybrid: Prompt + Runtime Check

| Area | Prompt | Runtime Check |
|------|--------|---------------|
| Approval workflow | "Ask before write" | State machine: `approved?` |
| Context budget | "Stay within budget" | Token counter + alert |
| Tool usage | "Use only allowed tools" | Tool allowlist enforcement |
| Artifact creation | "Create artifact type X" | Contract validation |

**Rule:** Safety-critical → deterministic policy. Style/methodology → prompt instruction. Mixed → both.

---

## FUP Definition (Revised)

### Goal

Доказать, что Wolf может orchestrate declarative workflow через OpenCode с:
1. **State machine** — отслеживание шагов, зависимостей, статусов.
2. **Policy enforcement** — deterministic block на запрещённых операциях.
3. **Artifact persistence** — создание, сохранение, query artifacts между сессиями.
4. **Host abstraction** — workflow работает через OpenCode adapter, но архитектура позволяет другие adapters.

### Scope

| Included | Excluded |
|----------|----------|
| 1 YAML workflow (5-7 шагов) | Multi-domain workflows |
| OpenCode Adapter | Claude Code Adapter (planned) |
| Standalone Adapter (proof) | IDE Adapter (future) |
| CLI projection (text status) | Tmux/Web dashboard (future) |
| Local skills/workflows | Marketplace/Registry (future) |
| File-based Case Store | Vector store (future) |
| Deterministic policy (denylists) | ML-based policy (future) |
| Single model | Model router (future) |
| Basic artifact types | Delta-spec artifacts (future) |
| Simple artifact relationships | Schema-driven workflows (future) |

### Success Criteria

1. Пользователь запускает `/wolf run research-to-plan` в OpenCode.
2. Wolf выполняет workflow: research → analyze → plan → review → approve → implement.
3. На шаге "implement" агент пытается выполнить `sudo rm -rf /tmp`.
4. Wolf block'ит операцию до выполнения, записывает в audit trail.
5. Workflow продолжается с альтернативным шагом (fallback).
6. По завершению созданы artifacts: research_doc, plan_doc, implementation_doc.
7. Новая сессия: `/wolf find artifacts type=plan_doc topic=X` находит artifact.
8. Тот же YAML workflow выполняется через Standalone Adapter с тем же результатом.

### Anti-Goals

- Не заменять OpenCode.
- Не доказывать universality.
- Не сравнивать модели.
- Не делать real-time collaboration.
- Не строить marketplace.

---

## Timeline Estimate

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| FUP Spec | 1 week | Revised FUP document |
| Workflow Engine + OpenCode Adapter | 2 weeks | Runnable workflow через OpenCode |
| Policy Engine + Case Store | 2 weeks | Deterministic policy + artifact persistence |
| Standalone Adapter | 1 week | Proof of host-agnostic concept |
| Integration Testing | 1 week | End-to-end FUP demo |
| Documentation | 1 week | FUP report, architecture update |
| **Total** | **8 weeks** | **Working FUP with proof** |

---

## Risk Register (FUP-Specific)

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| OpenCode plugin API changes | High | Medium | Abstract adapter, monitor API changelog |
| Token budget unpredictable | Medium | High | Conservative defaults, proactive alerts |
| Policy false positives | Medium | Medium | Configurable policies, override by user |
| Case Store performance | Low | Low | SQLite with indexing, lazy loading |
| User expects replacement runtime | High | Low | Clear messaging: "Wolf = sidecar, not replacement" |

---

## Conclusion

FUP — не standalone CLI-agent. FUP — **reference sidecar / adapter** для OpenCode, который доказывает:

1. Declarative workflows > prompt-driven sequences.
2. Deterministic policy > prompt-based safety.
3. Artifact memory > files on disk.
4. Host abstraction > vendor lock-in.

Если FUP докажет эти 4 пункта — Wolf имеет право на существование в экосистеме, где уже есть skills, subagents, plugins, context tools и approval workflows.
