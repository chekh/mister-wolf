# Mr. Wolf MVP1A Technical Specification

**Date:** 2026-04-28
**Status:** Draft
**Depends on:** Mr. Wolf Framework Architecture Design v0.1
**Scope:** Sequential Workflow Runner

---

## 1. Goal

Создать минимальный workflow runner, способный:

- Загружать workflow из YAML
- Валидировать структуру
- Исполнять шаги последовательно
- Сохранять состояние и события
- Поддерживать паузу через manual_gate и resume
- Предоставлять CLI для запуска и инспекции

---

## 2. Non-Goals

- LLM/агенты (MVP4+)
- Policy Engine (MVP3)
- Context Resolver (MVP2)
- Parallel execution (MVP1C)
- Conditional steps (MVP1B)
- Retry/fallback (MVP1B)
- Web UI (MVP7+)
- A2A / MCP (MVP8)
- Subworkflows (MVP1C)

---

## 3. Runtime Language and Libraries

```text
Runtime:     TypeScript (Node.js >= 20)
Schema:      Zod + JSON Schema export
Storage:     fs (files) + better-sqlite3 (indexes)
CLI:         Commander.js
YAML:        js-yaml
Events:      synchronous in-process
Testing:     Vitest
```

**Обоснование:**

- TypeScript хорош для CLI/runtime tooling
- Zod удобен для YAML/JSON валидации
- Естественен для MCP/IDE/web adapters (будущее)
- Легче типизировать plugin SDK

---

## 4. CLI Contract

### Commands

```bash
# Создать и запустить новый case
wolf run workflow.yaml [--input input.json]

# Продолжить paused case
wolf resume <case_id>

# Список кейсов
wolf cases list [--status running|paused|completed|failed]

# Инспекция кейса
wolf cases inspect <case_id> [--events]

# Показать event log
wolf events <case_id>

# Список активных gates
wolf gates list [--case <case_id>]

# Approve gate
wolf approve <gate_id>

# Reject gate
wolf reject <gate_id>
```

### Exit Codes

```text
0  — успех
1  — ошибка валидации/исполнения
2  — case paused (gate)
3  — case failed
```

---

## 5. Workflow YAML Schema

### Top-Level Structure

```yaml
id: string # required, kebab-case
version: string # required, semver
name?: string # human-readable
description?: string

steps: StepDefinition[] # required, min 1
```

**Execution Order in MVP1A:**

```text
Шаги исполняются строго в порядке массива steps[].
depends_on НЕ переупорядочивает шаги.
depends_on может ссылаться только на ранее объявленные шаги.
depends_on используется только для валидации (проверка что предыдущие шаги завершены).
Если depends_on указывает на будущий шаг — validation error.
Если шаг из depends_on не был выполнен — runtime error.
```

### StepDefinition

```yaml
id: string # required, unique within workflow
type: builtin # MVP1A: только builtin
runner: echo | shell | manual_gate # required
name?: string
description?: string
input?: object # runner-specific input
output?: string # variable name для сохранения результата
depends_on?: string[] # MVP1A: validation only, no reordering
timeout?: string # e.g. "30s", "5m", default "30s"
```

**Output Variable Semantics:**

```text
Если output указан:
  StepResult.output сохраняется в state.variables[output]
Если output не указан:
  результат сохраняется только в step_results и outputs/
Если output уже существует (duplicate variable name):
  validation error — не создаем case
```

### Input Schemas per Runner

**echo:**

```yaml
input:
  message: string # required
```

**shell:**

```yaml
input:
  command: string # required
  cwd?: string # default: process.cwd()
  env?: Record<string, string>
  timeout?: string # override default
```

**manual_gate:**

```yaml
input:
  message: string # required, shown to user
  title?: string # default: "Approval Required"
```

### Template Interpolation (MVP1A)

```text
MVP1A поддерживает простую Mustache-подстановку из variables:
{{ variables.variable_name }}
```

**Example:**

```yaml
steps:
  - id: check_env
    runner: shell
    input:
      command: 'pwd'
    output: current_directory

  - id: show_dir
    runner: echo
    input:
      message: 'Current dir is {{ variables.current_directory }}'
```

**Rules:**

- Только прямая подстановка переменных
- Если переменная не найдена — runtime error
- Нет expression evaluation, conditions, filters
- Полноценный expression engine — MVP1B+

### Example Workflow

```yaml
id: hello_world
version: '0.1.0'
name: 'Hello World'
description: 'Minimal MVP1A workflow'

steps:
  - id: greet
    type: builtin
    runner: echo
    input:
      message: 'Starting Mr. Wolf workflow'
    output: greet_result

  - id: check_env
    type: builtin
    runner: shell
    input:
      command: 'pwd'
    output: current_directory

  - id: confirm_continue
    type: builtin
    runner: manual_gate
    input:
      title: 'Continue?'
      message: 'Proceed to final step?'

  - id: finish
    type: builtin
    runner: echo
    input:
      message: 'Workflow completed!'
    output: finish_result
    depends_on:
      - confirm_continue
```

---

## 6. State Directory Layout

```text
.wolf/
  state/
    wolf.sqlite            # index: cases, gates, events
    cases/
      case_abc123/
        case.yaml              # case metadata
        workflow.yaml          # resolved workflow snapshot
        state.json             # current execution state
        events.jsonl           # append-only event log
        outputs/               # step outputs
          greet.stdout.txt
          check_env.stdout.txt
          check_env.stderr.txt
          finish.stdout.txt
```

**SQLite Index:**

```text
Files are source of truth.
SQLite is query index for list/search operations.

Tables:
  cases(id, workflow_id, status, created_at, updated_at, path)
  gates(id, case_id, step_id, status, requested_at, responded_at)
  events_index(id, case_id, type, step_id, timestamp)
```

**Immutability:**

```text
workflow.yaml внутри директории case — неизменяемый snapshot.
Если исходный workflow файл изменится, resume использует snapshot, а не новый файл.
Это критично для воспроизводимости.
```

### case.yaml

```yaml
case_id: case_abc123
workflow_id: hello_world
workflow_version: '0.1.0'
title: 'Hello World'
status: running | paused | completed | failed | cancelled
created_at: '2026-04-28T10:00:00Z'
updated_at: '2026-04-28T10:00:05Z'
```

### state.json

```json
{
  "case_id": "case_abc123",
  "workflow_id": "hello_world",
  "status": "paused",
  "current_step_id": "confirm_continue",
  "completed_steps": ["greet", "check_env"],
  "failed_steps": [],
  "step_results": {
    "greet": {
      "status": "success",
      "output": "Starting Mr. Wolf workflow",
      "started_at": "2026-04-28T10:00:01Z",
      "completed_at": "2026-04-28T10:00:01Z"
    },
    "check_env": {
      "status": "success",
      "output": "/home/user/project",
      "started_at": "2026-04-28T10:00:02Z",
      "completed_at": "2026-04-28T10:00:02Z"
    }
  },
  "variables": {
    "greet_result": "Starting Mr. Wolf workflow",
    "current_directory": "/home/user/project"
  },
  "gates": {
    "gate_def456": {
      "step_id": "confirm_continue",
      "status": "pending",
      "requested_at": "2026-04-28T10:00:03Z"
    }
  },
  "started_at": "2026-04-28T10:00:00Z",
  "updated_at": "2026-04-28T10:00:03Z"
}
```

---

## 7. Event Types

### Event Envelope

```json
{
  "id": "evt_abc123",
  "type": "workflow.started",
  "case_id": "case_abc123",
  "workflow_id": "hello_world",
  "step_id": null,
  "timestamp": "2026-04-28T10:00:00Z",
  "actor": {
    "type": "system",
    "id": "workflow_engine"
  },
  "payload": {},
  "correlation_id": "corr_xyz789",
  "parent_event_id": null
}
```

### MVP1A Event Types

```text
case.created
workflow.started
workflow.completed
workflow.failed
step.started
step.completed
step.failed
gate.requested
gate.approved
gate.rejected
```

### Event Payload Examples

**case.created:**

```json
{
  "type": "case.created",
  "payload": {
    "workflow_id": "hello_world",
    "workflow_version": "0.1.0",
    "request": { "raw": "wolf run workflow.yaml" }
  }
}
```

**step.started:**

```json
{
  "type": "step.started",
  "step_id": "check_env",
  "payload": {
    "runner": "shell",
    "input": { "command": "pwd" }
  }
}
```

**step.completed:**

```json
{
  "type": "step.completed",
  "step_id": "check_env",
  "payload": {
    "status": "success",
    "output_variable": "current_directory",
    "duration_ms": 150
  }
}
```

**gate.requested:**

```json
{
  "type": "gate.requested",
  "step_id": "confirm_continue",
  "payload": {
    "gate_id": "gate_def456",
    "title": "Continue?",
    "message": "Proceed to final step?"
  }
}
```

**gate.approved:**

```json
{
  "type": "gate.approved",
  "step_id": "confirm_continue",
  "payload": {
    "gate_id": "gate_def456",
    "approved_by": "user"
  }
}
```

---

## 8. Step Runner Behavior

### Step Runner Interface

```typescript
interface StepRunner {
  type: string;
  run(step: StepDefinition, ctx: ExecutionContext): Promise<StepResult>;
}

interface ExecutionContext {
  case_id: string;
  workflow_id: string;
  variables: Record<string, unknown>;
  config: unknown;
}

interface StepResult {
  status: 'success' | 'failure' | 'gated';
  output?: unknown;
  error?: {
    type: string;
    message: string;
    retryable: boolean;
  };
}
```

### echo Runner

```typescript
// Input: { message: string }
// Output: message string
// Behavior:
//   1. Log "echo: {message}"
//   2. Return { status: "success", output: message }
//   3. Write output to outputs/{step_id}.stdout.txt
```

### shell Runner

```typescript
// Input: { command: string, cwd?: string, env?: Record<string, string>, timeout?: string }
// Output: stdout string
// Behavior:
//   1. Validate: command is non-empty
//   2. Validate: command does not contain blocked commands (sudo, su, ssh, vim, nano, less, more, top, watch)
//   3. Execute with child_process.spawn(command, { shell: true })
//   4. stdin is closed immediately
//   5. Timeout: default 30s, max 5m
//   6. Capture stdout, stderr (max 1 MB each)
//   7. Write stdout to outputs/{step_id}.stdout.txt
//   8. Write stderr to outputs/{step_id}.stderr.txt
//   9. If exit code !== 0: return failure with stderr
//   10. Return { status: "success", output: stdout }
//   11. Log command and exit code to events

// Security (MVP1A):
//   - Executes in current working directory only (cwd must stay within project root)
//   - stdin closed (no interactive commands)
//   - Denylist: sudo, su, ssh, vim, nano, less, more, top, watch
//   - No sudo escalation
//   - Timeout enforced
//   - stdout/stderr max size: 1 MB each
//   - Note: string command is temporary simplification. Future: cmd + args array.
```

### manual_gate Runner

```typescript
// Input: { message: string, title?: string }
// Output: none (gated)
// Behavior:
//   1. Generate gate_id (глобально уникальный)
//   2. Create gate_request object
//   3. Write gate.requested event
//   4. Save gate to state.json и SQLite gates table
//   5. Set ExecutionState.status = "paused"
//   6. Return { status: "gated" }
//   7. Workflow stops execution
//   8. On resume: повторно запускает manual_gate runner
//      - runner видит gate.status = approved → возвращает success
//      - runner видит gate.status = rejected → возвращает failure
//      - step result превращается из gated в success/failure
//      - workflow продолжается со следующего шага
```

**Resume Semantics:**

```text
Если текущий step = manual_gate и gate.status = approved:
  runner returns success
  engine marks step completed
  engine continues to next step

Если gate.status все еще pending:
  runner returns gated
  workflow остается paused
```

---

## 9. Gate Lifecycle

### States

```text
pending   → gate создан, ждет решения
approved  → пользователь approved, workflow продолжится
rejected  → пользователь rejected, workflow fail
expired   → (MVP1B+) timeout превышен
```

### Gate Request Model

```yaml
gate_request:
  id: gate_<uuid>
  case_id: case_<uuid>
  step_id: string
  type: user_approval
  title: string
  message: string
  status: pending | approved | rejected
  requested_at: timestamp
  responded_at?: timestamp
  responded_by?: string
  response?: approve | reject
```

### CLI Interaction

```bash
# During execution
$ wolf run workflow.yaml
[case_abc123] Created
[case_abc123] Step 'greet' completed
[case_abc123] Step 'check_env' completed
[case_abc123] Gate 'confirm_continue' requested: "Proceed to final step?"
[case_abc123] PAUSED. Run: wolf approve gate_def456

# In another terminal
$ wolf gates list
case_abc123  gate_def456  confirm_continue  pending  "Proceed to final step?"

$ wolf approve gate_def456
Gate gate_def456 approved.

# Back to first terminal, or run:
$ wolf resume case_abc123
[case_abc123] Resumed
[case_abc123] Step 'finish' completed
[case_abc123] Workflow completed
```

**Approve/Reject Behavior:**

```text
approve approved gate   → success (idempotent, no-op)
approve rejected gate   → error
approve missing gate    → error
approve gate from completed/failed case → error

reject pending gate     → success, case fails
reject rejected gate    → error (already rejected)
reject missing gate     → error
```

**Exit Codes:**

```text
wolf run workflow.yaml → success (0) или paused (2) или failed (3)
wolf resume case_id    → success (0) или paused (2) или failed (3)
wolf approve gate_id   → success (0) или error (1)
wolf reject gate_id    → success (0) или error (1)
```

---

## 10. Error Handling

### Error Types

```text
ValidationError    — workflow YAML не прошел валидацию
StepFailed         — runner вернул ошибку
ShellError         — shell команда вернула non-zero exit code
GateRejected       — пользователь отклонил gate
TimeoutError       — шаг превысил timeout
UnknownRunner      — указан неизвестный runner
MissingDependency  — depends_on ссылается на несуществующий шаг
```

### Error Handling Strategy (MVP1A)

```yaml
strategy:
  ValidationError: fail immediately, no case created
  StepFailed: fail case, save error to state
  ShellError: fail case, save stdout/stderr
  GateRejected: fail case, save rejection reason
  TimeoutError: fail case, save timeout info
  UnknownRunner: fail immediately
  MissingDependency: fail immediately
```

**MVP1A: нет retry, нет fallback.** Любая ошибка = fail case.

### Atomic Writes Requirement

```text
state.json writes must be atomic:
  1. Write to state.json.tmp
  2. fsync if possible
  3. Rename state.json.tmp → state.json

events.jsonl:
  - Append one JSON object per line
  - Flush after each append

outputs/:
  - Write output files after step result
  - Then update state.json
```

### Error Format in State

```json
{
  "step_results": {
    "check_env": {
      "status": "failure",
      "error": {
        "type": "ShellError",
        "message": "Command failed with exit code 1",
        "retryable": false,
        "details": {
          "command": "invalid_command",
          "exit_code": 1,
          "stderr": "command not found"
        }
      }
    }
  }
}
```

---

## 11. Acceptance Criteria

MVP1A считается готовым, если выполняются все пункты:

1. `wolf run workflow.yaml` создает новый case и возвращает case_id.
2. Workflow YAML валидируется по схеме перед исполнением.
3. Выполняются builtin runners: `echo`, `shell`, `manual_gate`.
4. Все события пишутся в `.wolf/state/cases/{case_id}/events.jsonl`.
5. Текущее состояние пишется в `state.json` после каждого шага.
6. Выходы шагов сохраняются в `outputs/`.
7. `manual_gate` ставит case в `paused`.
8. `wolf approve <gate_id>` сохраняет approval и позволяет resume.
9. `wolf reject <gate_id>` сохраняет rejection и ставит case в `failed`.
10. `wolf resume <case_id>` продолжает workflow с текущего шага.
11. `wolf cases list` показывает список кейсов с статусами.
12. `wolf cases inspect <case_id>` показывает статус, текущий шаг, последние события.
13. Ошибки пишутся в state и event log.
14. Shell runner имеет timeout и блокирует интерактивные команды.
15. Несколько кейсов могут существовать одновременно.
16. Resume работает после process restart (state persisted).

---

## 12. Test Cases

### TC1: Happy Path

```bash
wolf run examples/hello-world.yaml
# Expected: case created, all steps execute, workflow completed
```

### TC2: Gate Approve

```bash
wolf run examples/gate-workflow.yaml
# workflow pauses at gate
wolf approve <gate_id>
wolf resume <case_id>
# Expected: workflow completes
```

### TC3: Gate Reject

```bash
wolf run examples/gate-workflow.yaml
wolf reject <gate_id>
# Expected: case status = failed
```

### TC4: Shell Error

```bash
wolf run examples/shell-error.yaml
# Expected: case status = failed, stderr captured
```

### TC5: Resume After Restart

```bash
wolf run examples/gate-workflow.yaml
# kill process
wolf resume <case_id>
# Expected: workflow continues from gate
```

### TC6: Invalid Workflow

```bash
wolf run examples/invalid-workflow.yaml
# Expected: validation error, no case created, exit code 1
```

### TC7: Cases List

```bash
wolf run examples/workflow-a.yaml
wolf run examples/workflow-b.yaml
wolf cases list
# Expected: shows 2 cases with statuses
```

### TC8: Case Inspect

```bash
wolf cases inspect <case_id>
# Expected: shows status, current step, last 10 events
```

### TC9: Resume Without Approval

```bash
wolf run examples/gate-workflow.yaml
wolf resume <case_id>
# Expected: still paused, message says gate pending
```

### TC10: Duplicate Output Variable

```bash
wolf run examples/duplicate-output.yaml
# Expected: validation error, no case created
```

---

## 13. Files to Create

```text
src/
  kernel/
    event-bus.ts
    plugin-lifecycle.ts
  config/
    loader.ts
    validator.ts
    schema.ts
  workflow/
    engine.ts
    runner-registry.ts
    runners/
      echo.ts
      shell.ts
      manual-gate.ts
  state/
    store.ts
    case-store.ts
  cli/
    commands/
      run.ts
      resume.ts
      cases.ts
      gates.ts
    index.ts
tests/
  workflow-engine.test.ts
  runners.test.ts
  cli.test.ts
examples/
  hello-world.yaml
  gate-workflow.yaml
  shell-error.yaml
```

---

## 14. Dependencies

```json
{
  "dependencies": {
    "commander": "^12.0.0",
    "js-yaml": "^4.1.0",
    "zod": "^3.23.0",
    "better-sqlite3": "^9.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "@types/node": "^20.0.0",
    "@types/js-yaml": "^4.0.0"
  }
}
```

---

## 15. Risks and Mitigations

| Risk                  | Impact | Mitigation                                                   |
| --------------------- | ------ | ------------------------------------------------------------ |
| Shell runner security | High   | Block interactive commands, enforce timeout, run in cwd only |
| State corruption      | Medium | Atomic writes, backup state.json before update               |
| Resume complexity     | Medium | Clear state machine, explicit gate handling                  |
| YAML schema changes   | Low    | Version lock workflow schema in MVP1A                        |

---

## 16. Out of Scope for MVP1A

- Multi-workflow orchestration
- External plugin loading (Step Runner Registry is in-process only in MVP1A)
- Database migrations
- Web UI
- Authentication
- Distributed execution
- LLM integration
- Policy engine
- Model router
- A2A protocol
- Artifact validation
- Expression language / when conditions
