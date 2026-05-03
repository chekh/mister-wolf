# Implications for Mr. Wolf Concept

**Generated:** 2026-05-03
**Scope:** How comparative research changes or reinforces Mr. Wolf concept
**Sources:** `agentic-tools-project-cards.md`, `agentic-tools-cross-findings.md`

---

## Executive Summary

Исследование 10 существующих проектов подтверждает рабочую гипотезу:

> **Mr. Wolf должен быть не standalone agent runtime, а front-agent + process-control layer для существующих agentic tools.**

Все изученные проекты решают отдельные куски (skills, subagents, model routing, context visibility, background delegation, terminal visibility, approval patterns), но **отсутствует единый слой**, который:
1. Скрывает от пользователя переключение между agents/skills/models/tools.
2. Делает процесс декларативным (YAML workflows, не prompt-driven sequences).
3. Обеспечивает policy governance с enforcement, audit trail, rollback.
4. Управляет artifact lifecycle с relationships, versioning, query.
5. Переживает restart/compaction с полным recovery состояния.
6. Работает поверх любого host tool (OpenCode, Claude Code, Cursor, Codex, Gemini, Copilot).

---

## Reinforced Concepts

### 1. Wolf as Front-Agent, Not Replacement Runtime

**Из исследования:**
- Все 10 проектов — это plugins, command packs, skill libraries, subagent catalogs **для существующих host tools**.
- Ни один проект не пытается заменить Claude Code или OpenCode.
- Пользователи остаются в привычной среде (CLI, IDE), но получают дополнительные capabilities.

**Implication для Wolf:**
- Wolf **не заменяет** OpenCode, Claude Code, Cursor. Wolf **orchestrates** их.
- Wolf Agent — единая точка входа, которая принимает запрос и решает: какой host tool использовать, какой skill применить, какой subagent делегировать, какую модель выбрать.
- Пользователь взаимодействует с Wolf, Wolf взаимодействует с host tools через adapters.
- Это позиционирует Wolf как **sidecar / adapter layer**, не как конкурирующий runtime.

---

### 2. Process-Level Control

**Из исследования:**
- Существующие проекты имеют workflows, но они **prompt-driven**, не declarative.
- Oh My OpenAgent имеет Ralph Loop, ultrawork — но это последовательности prompt-инструкций, не state machine.
- Agentic имеет фазы (Research → Plan → Execute → Commit → Review) — но переходы требуют human-in-the-loop.
- OpenAgents Control имеет 6-stage workflow — но описан в markdown, не исполняется автоматически.

**Implication для Wolf:**
- Wolf должен иметь **declarative workflow engine** (уже реализовано в MVP1A–MVP1C): YAML-описание workflows с sequential + graph execution.
- Process-level control = state machine, который отслеживает: текущий шаг, зависимости, статус, artifacts, approvals.
- Workflow engine — не replacement для prompt-driven workflows, а **runtime layer**, который может orchestrate их.
- Каждый шаг workflow декларирует: runner, skill, model route, policy checks, input/output artifacts.

---

### 3. Step-Level Model Routing

**Из исследования:**
- Все проекты с model routing делают это **per agent или per category**, не per step.
- Oh My OpenAgent: `visual-engineering` → модель X (статическая категория).
- oh-my-opencode-slim: per-agent preset + fallback chains.
- Agentic: per agent в YAML frontmatter.
- Нет dynamic routing на основе: task complexity, token budget, artifact type, content analysis.

**Implication для Wolf:**
- Wolf должен иметь **step-level model router**, который на каждом шаге решает:
  - Какая модель оптимальна для этого шага?
  - Сколько токенов осталось в бюджете?
  - Какой artifact type ожидается?
  - Какие policy constraints применяются?
  - Какие модели доступны сейчас (fallback на rate limit)?
- Model router — не замена per-agent presets, а **dynamic overlay** поверх них.

---

### 4. Artifact Memory

**Из исследования:**
- Все проекты создают файлы, но нет **managed artifact system**:
  - Superpowers: design specs ad-hoc, нет lifecycle.
  - Agentic: `thoughts/` с frontmatter, но нет связей, query, versioning.
  - Oh My OpenAgent: task JSON с `blockedBy`/`blocks`, но это task dependencies, не artifact relationships.
  - OpenAgents Control: `.tmp/` ephemeral, нет versioning.
- Нет concept "artifact type", "artifact contract", "artifact query".

**Implication для Wolf:**
- Wolf должен иметь **Artifact Memory Graph** (частично есть в концепции, нужно усилить):
  - Typed artifacts (design_doc, test_result, code_change, review, trace).
  - Relationships (ticket → research → plan → review).
  - Lifecycle (draft → in_review → approved → archived).
  - Source of truth (git + SQLite index).
  - Query interface ("покажи все artifacts типа review, связанные с этим ticket").
  - Versioning и garbage collection.
- Artifacts — first-class primitive, не просто файлы на диске.

---

### 5. Host Adapter Layer

**Из исследования:**
- Все 10 проектов **привязаны к одному host tool**:
  - OpenCode: opencode-agent-skills, opencode-background-agents, Context Analysis Plugin, Oh My OpenAgent, oh-my-opencode-slim, opentmux, Agentic, OpenAgents Control.
  - Claude Code: Awesome Claude Code Subagents.
  - Multi-platform plugin: Superpowers (но всё равно plugin per platform).
- Нет проектов, которые работают как standalone runtime поверх нескольких host tools.

**Implication для Wolf:**
- Wolf должен иметь **Host Adapter Layer**:
  - OpenCode Adapter — интеграция через Plugin API.
  - Claude Code Adapter — интеграция через plugin system.
  - Cursor Adapter — через .cursorrules или plugin.
  - IDE Adapter — через LSP или MCP.
  - Standalone Adapter — direct API calls к моделям.
- Adapters реализуют uniform interface: send prompt, receive response, execute tool, create session, inject context.
- Wolf runtime не зависит от host tool — только adapter implementation.

---

### 6. Policy Overlay

**Из исследования:**
- Approval gates, permissions, tool restrictions существуют, но:
  - Hardcoded в markdown агентов (OpenAgents Control, Agentic).
  - Зависят от host tool permissions (oh-my-opencode-slim).
  - Нет centralized policy engine.
  - Нет policy versioning.
  - Нет policy inheritance (project → team → org).
  - Нет audit trail.
- Superpowers имеет instruction priority hierarchy (user > skills > default) — но это prompt-level, не runtime enforcement.

**Implication для Wolf:**
- Wolf должен иметь **Policy Overlay**:
  - Декларативные policies (YAML): approval gates, tool allowlists, read-only constraints, write restrictions, sandbox rules.
  - Enforcement на уровне Wolf runtime, не только prompt instructions.
  - Audit trail: каждое решение записывается в Case Store.
  - Policy inheritance: org policies → team policies → project policies → workflow policies.
  - Policy versioning: история изменений policies.
- Policy engine — не replacement для host tool permissions, а **overlay**, который может override или complement их.

---

### 7. Projection Model

**Из исследования:**
- opentmux предоставляет tmux pane per subagent — но только для OpenCode, только tmux.
- Oh My OpenAgent имеет tmux integration для background agents.
- Нет backend-agnostic view layer.
- Нет artifact-aware displays.
- Нет web dashboard.
- Нет IDE integration для visibility.

**Implication для Wolf:**
- Wolf должен иметь **Projection Model**:
  - Trace и process state имеют projections:
    - CLI projection (text-based status, progress bars).
    - Tmux projection (pane per agent, live output).
    - Web dashboard (browser-based monitoring).
    - IDE projection (sidebar panel, inline annotations).
    - MCP projection (status via Model Context Protocol).
    - Log projection (structured logs for SIEM).
  - Projection layer отделена от runtime — одно и то же состояние отображается по-разному.
  - Artifact-aware views: панели показывают не только stdout, но и artifact status, context budget, policy violations.

---

### 8. Imported Skills / Agents Registry

**Из исследования:**
- Awesome Claude Code Subagents — 131+ агентов, 10 категорий, но нет runtime orchestration.
- Superpowers — 13 skills, cross-platform, но нет registry/discovery механизма beyond auto-load.
- opencode-agent-skills — multi-source discovery, но только для OpenCode.
- Нет unified registry с namespace, versioning, dependencies.

**Implication для Wolf:**
- Wolf должен иметь **Imported Skills/Agents Registry**:
  - Unified catalog: skills, agents, commands, workflows из разных источников.
  - Namespace resolution: `superpowers/brainstorming`, `voltagent/core-dev`, `custom/my-skill`.
  - Versioning: semver для skills/agents.
  - Dependency management: skill A зависит от skill B.
  - Search: по description, tags, category.
  - Install from: marketplace, git, local filesystem.
- Registry интегрируется с workflow engine: шаг workflow может ссылаться на skill из registry.

---

### 9. Context Budget / Context Visibility

**Из исследования:**
- Context Analysis Plugin — единственный проект с token visibility (multi-tokenizer, bar charts, tool aggregation).
- Oh My OpenAgent — context-window-monitor, но без proactive alerts.
- OpenAgents Control — MVI principle, но без metrics.
- Большинство проектов полагается на нативное поведение host tool.

**Implication для Wolf:**
- Wolf должен иметь **Context Budget / Context Visibility** как first-class primitive:
  - Token budget per workflow, per step, per agent.
  - Proactive alerts: "80% budget consumed", "step X превышает estimated tokens".
  - Cost estimation перед выполнением.
  - Context compaction recommendations.
  - Historical analytics: тренды token usage по проекту.
- Интеграция с Context Resolver (MVP2): бюджет влияет на context assembly (что загружать, что урезать).

---

### 10. Read-Only Background Delegation by Default

**Из исследования:**
- opencode-background-agents — **только** read-only sub-agents. Write-capable агенты должны использовать native `task`.
- Oh My OpenAgent — Oracle, Librarian, Explore — read-only.
- oh-my-opencode-slim — Observer, Explorer, Librarian — read-only.
- Pattern: background/delegated work по умолчанию read-only.

**Implication для Wolf:**
- Wolf должен иметь policy primitive **"read-only by default"**:
  - Background delegation → read-only автоматически.
  - Write требует explicit approval.
  - Policy может override (например, trusted agent может write без approval).
  - Audit trail: кто, когда, почему изменил read-only constraint.
- Интеграция с background-agents pattern: Wolf может orchestrate read-only background work с persistence результатов в Artifact Store.

---

## New Concepts to Add

### 11. Deterministic Policy, Not Prompt Instruction

**Из исследования:**
- Superpowers имеет strong prompt instructions (TDD, code review), но нет enforcement.
- OpenAgents Control имеет `@approval_gate`, `@stop_on_failure` в markdown — но это prompt instructions, не runtime checks.
- Agentic имеет tool restrictions в frontmatter — но enforcement через host tool, не через Wolf.

**Problem:** Если агент игнорирует instruction, нет fallback. Safety зависит от compliance агента.

**New concept:** Wolf должен иметь **deterministic policy layer**:
- Policies описываются декларативно (YAML), не только в prompts.
- Runtime enforcement: Wolf проверяет policy ПЕРЕД выполнением операции.
- Если policy violated → block, alert, escalate — независимо от того, что "думает" агент.
- Policy checks — deterministic (regex, allowlists, budget checks), не LLM-based.
- Примеры:
  - `bash command matches denylist` → block.
  - `token budget exceeded` → pause, compact, alert.
  - `write to *.env*` → block, require approval.
  - `subagent depth > 3` → block.

---

### 12. Workflow as Skill, Skill as Workflow

**Из исследования:**
- Superpowers имеет skills (brainstorming, TDD, code review) — но нет formal workflow engine.
- Agentic имеет фазы (Research → Plan → Execute) — но нет skill registry.
- Oh My OpenAgent имеет commands (`/init-deep`, `/refactor`) — но они trigger prompt sequences, не executable workflows.

**New concept:** В Wolf **skill и workflow — это одно и то же** на разных уровнях абстракции:
- Skill = reusable behavior (как в Superpowers).
- Workflow = orchestrated sequence of skills (как в Agentic, но executable).
- Skill может быть шагом workflow.
- Workflow может быть экспортирован как skill (reusable pattern).
- Registry содержит и skills, и workflows.

**Example:**
```yaml
# Workflow: code-review-process
steps:
  - skill: request-code-review
    agent: code-reviewer
    model: capable
  - skill: implement-fixes
    agent: implementer
    model: standard
  - skill: verify-completion
    agent: verifier
    model: fast
```

---

### 13. Artifact Contract

**Из исследования:**
- Ни один проект не декларирует "этот шаг должен произвести artifact типа X".
- Нет artifact-based routing.
- Нет validation: "шаг Y завершился, но не создал ожидаемый artifact".

**New concept:** Каждый шаг workflow имеет **artifact contract**:
- Input artifacts: что нужно для выполнения шага.
- Output artifacts: что должен произвести шаг.
- Validation: проверка наличия и корректности output artifacts.
- Routing: следующий шаг выбирается на основе produced artifacts.

**Example:**
```yaml
steps:
  - name: research
    output_artifacts:
      - type: research_doc
        required: true
    on_missing_artifact: retry
  - name: plan
    input_artifacts:
      - type: research_doc
    output_artifacts:
      - type: implementation_plan
        required: true
```

---

## Concepts to Deprioritize

### 14. Hash-Anchored Edit Tool

Oh My OpenAgent имеет Hashline — hash-anchored edit tool, который снижает stale-line ошибки.

**Decision:** Не включать в core Wolf concept.
**Reason:** Это implementation detail для file editing. Wolf оперирует на уровне artifacts и workflows, не file operations. Host tool (Claude Code, Cursor) отвечает за надёжное редактирование файлов. Wolf может рекомендовать Hashline pattern, но не должен implement его.

---

### 15. Embedded MCP Servers

Oh My OpenAgent имеет skill-embedded MCP servers (lazy loading).

**Decision:** Не включать в core Wolf concept как built-in feature.
**Reason:** MCP — это integration protocol, не core primitive. Wolf должен поддерживать MCP как adapter type, но не должен manage MCP servers. Host tool или external infrastructure отвечает за MCP lifecycle.

---

### 16. Delta-Spec Model

OpenSpec имеет отличную delta-spec модель для brownfield разработки:
- ADDED / MODIFIED / REMOVED / RENAMED requirements.
- Изменения первоклассны, а не адаптация полных спеков.

**New concept:** Wolf должен поддерживать **delta-spec artifacts**:
- Артефакт может описывать diff, не только конечное состояние.
- Delta-specs хранятся как typed artifacts с relationships к оригиналу.
- Workflow может применять delta-spec через specialized runner.
- История изменений — first-class primitive (не только git diff).

**Example:**
```yaml
artifact:
  type: delta_spec
  base: specs/architecture.md
  changes:
    - action: ADDED
      section: api.endpoints
      content: "POST /v2/users"
    - action: MODIFIED
      section: db.schema.users
      content: "added column: email_verified"
```

---

### 17. Schema-Driven Artifact Workflows

OpenSpec использует schema-driven dependency graph артефактов:
- `proposal → specs → design → tasks` (customizable).
- `requires` в schema определяет readiness (`ready` / `blocked`).
- Per-artifact rules injection через config.

**New concept:** Wolf должен поддерживать **schema-driven artifact workflows**:
- Artifact types определяются schema (поля, валидация, relationships).
- Workflow steps могут быть привязаны к artifact types.
- Dependency graph между artifacts влияет на workflow execution order.
- Per-artifact policies (разные правила для `spec.md` vs `test.md`).

**Example:**
```yaml
schema:
  artifact_types:
    spec:
      requires: [proposal]
      produces: [design]
      rules: [require-review]
    design:
      requires: [spec]
      produces: [tasks]
      rules: [require-approval]
```

---

### 18. Specs/Changes Separation

OpenSpec разделяет `specs/` (source of truth) и `changes/` (work in progress):
- Specs — текущее состояние системы.
- Changes — предлагаемые модификации.
- Archive — завершённые изменения с полным контекстом.

**New concept:** Wolf должен иметь **Specs/Changes/Archive model** в Artifact Memory:
- **Specs:** Source of truth artifacts (текущая архитектура, API, schema).
- **Changes:** Proposed modifications (delta-specs, task lists, reviews).
- **Archive:** Completed changes с trace (who, when, why, what).
- Git integration: specs commit'ятся в репозиторий, changes — в Wolf Case Store.
- Parallel changes без конфликтов (каждый change — изолированный artifact graph).

**Implication:** Это позволяет Wolf работать как runtime для OpenSpec-подобных workflows: OpenSpec создаёт план, Wolf его выполняет и архивирует.

---

## Summary of Implications

| Concept | Status | Priority |
|---------|--------|----------|
| Wolf as front-agent | Reinforced | Critical |
| Process-level control | Reinforced | Critical |
| Step-level model routing | Reinforced | High |
| Artifact Memory | Reinforced | Critical |
| Host Adapter Layer | Reinforced | Critical |
| Policy Overlay | Reinforced | High |
| Projection Model | New | Medium |
| Imported Skills/Agents Registry | New | Medium |
| Context Budget / Visibility | Reinforced | High |
| Read-only background delegation | Reinforced | High |
| Deterministic policy (not prompt) | New | Critical |
| Workflow as Skill, Skill as Workflow | New | High |
| Artifact Contract | New | High |
| Delta-Spec Model | New (OpenSpec) | High |
| Schema-Driven Artifact Workflows | New (OpenSpec) | High |
| Specs/Changes/Archive Model | New (OpenSpec) | Medium |

**Conclusion:** Исследование подтверждает направление Wolf concept и добавляет 7 новых концепций (Projection Model, Imported Registry, Deterministic Policy, Artifact Contract, Delta-Spec, Schema-Driven Workflows, Specs/Changes/Archive). Ни одна из существующих концепций не опровергнута. OpenSpec усилил Artifact Memory и добавил planning-specific концепции.
