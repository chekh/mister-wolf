# CLI Reference

Complete reference for the `wolf` command-line interface.

## Global Options

```bash
wolf [command] [options]
```

| Option | Description |
|--------|-------------|
| `-V, --version` | Show version number |
| `-h, --help` | Show help for command |

## Workflow Commands

### `wolf run`

Execute a workflow YAML file.

```bash
wolf run <workflow.yaml> [options]
```

**Arguments:**
- `workflow` (required): Path to workflow YAML file

**Options:**
- `--config <path>`: Path to `wolf.yaml` project config

**Exit Codes:**
- `0`: Workflow completed successfully
- `1`: Error (validation failed, runtime error)
- `2`: Workflow paused (waiting for gate approval)
- `3`: Workflow failed
- `4`: Workflow cancelled

**Examples:**

```bash
# Basic run
wolf run examples/hello-world.yaml

# With custom config
wolf run workflow.yaml --config ./my-wolf.yaml
```

**Output:**
```
[case_abc123] Created
[case_abc123] PAUSED. Run: wolf approve gate_case_abc123_step_id
# or
[case_abc123] Workflow completed
```

---

### `wolf resume`

Resume a paused workflow case.

```bash
wolf resume <case_id>
```

**Arguments:**
- `case_id` (required): Case ID to resume

**Exit Codes:** Same as `wolf run`

**Example:**

```bash
wolf resume case_abc123
```

**Note:** Resume loads the workflow snapshot from the case directory, not the original file. This ensures the case runs with the exact workflow definition that was used when it was created.

---

### `wolf validate`

Validate a workflow YAML file without executing it.

```bash
wolf validate <workflow.yaml>
```

**Arguments:**
- `workflow` (required): Path to workflow YAML file

**Exit Codes:**
- `0`: Workflow is valid
- `1`: Validation failed

**Example:**

```bash
wolf validate examples/hello-world.yaml
# Output: Workflow is valid.

wolf validate examples/duplicate-output.yaml
# Output: Validation failed:
#   - Duplicate output variable: shared_var
```

**Validation checks:**
- YAML syntax
- Schema compliance (Zod)
- Duplicate step IDs
- Duplicate output variables
- Empty steps array
- Invalid dependency references (MVP1C+)

---

## Case Management Commands

### `wolf cases list`

List all workflow cases.

```bash
wolf cases list [options]
```

**Options:**
- `--status <status>`: Filter by status (`pending`, `running`, `paused`, `completed`, `failed`, `cancelled`)

**Example:**

```bash
# List all cases
wolf cases list

# List only failed cases
wolf cases list --status failed
```

**Output:**
```
CASE_ID         STATUS    UPDATED
 case_abc123    completed  2026-04-28T12:00:00Z
 case_def456    paused     2026-04-28T12:05:00Z
```

---

### `wolf cases inspect`

Inspect a specific case.

```bash
wolf cases inspect <case_id> [options]
```

**Arguments:**
- `case_id` (required): Case ID to inspect

**Options:**
- `--events`: Include event log
- `--json`: Output as JSON

**Examples:**

```bash
# Formatted output
wolf cases inspect case_abc123

# With events
wolf cases inspect case_abc123 --events

# JSON output (useful for scripting)
wolf cases inspect case_abc123 --json

# JSON with events
wolf cases inspect case_abc123 --events --json
```

**Formatted output example:**
```
State:
{
  "case_id": "case_abc123",
  "status": "completed",
  "completed_steps": ["step1", "step2"],
  ...
}
```

---

### `wolf cases cancel`

Cancel a running or paused case.

```bash
wolf cases cancel <case_id>
```

**Arguments:**
- `case_id` (required): Case ID to cancel

**Exit Codes:**
- `0`: Case cancelled successfully
- `1`: Error (case not found, already completed/failed/cancelled)

**Example:**

```bash
wolf cases cancel case_abc123
# Output: Case case_abc123 cancelled.
```

**Behavior:**
- Sets case status to `cancelled`
- Marks all remaining steps as `skipped`
- Emits `case.cancelled` event
- Resume is not allowed after cancellation

---

## Gate Management Commands

### `wolf gates list`

List all pending gates.

```bash
wolf gates list [options]
```

**Options:**
- `--case <case_id>`: Filter by case ID

**Example:**

```bash
# List all gates
wolf gates list

# Gates for specific case
wolf gates list --case case_abc123
```

**Output:**
```
GATE_ID                    CASE_ID       STEP_ID   STATUS   REQUESTED_AT
gate_case_abc123_approval  case_abc123   approval  pending  2026-04-28T12:00:00Z
```

---

### `wolf approve`

Approve a pending gate.

```bash
wolf approve <gate_id>
```

**Arguments:**
- `gate_id` (required): Gate ID to approve

**Exit Codes:**
- `0`: Gate approved
- `1`: Error (gate not found, already responded)

**Example:**

```bash
wolf approve gate_case_abc123_approval
# Output: Gate gate_case_abc123_approval approved.
```

**After approval:**
- Gate status changes to `approved`
- Resume the case: `wolf resume case_abc123`

---

### `wolf reject`

Reject a pending gate.

```bash
wolf reject <gate_id>
```

**Arguments:**
- `gate_id` (required): Gate ID to reject

**Exit Codes:**
- `0`: Gate rejected
- `1`: Error (gate not found, already responded)

**Example:**

```bash
wolf reject gate_case_abc123_approval
# Output: Gate gate_case_abc123_approval rejected.
```

**After rejection:**
- Gate status changes to `rejected`
- Case status changes to `failed`
- Resume is not useful (case is already failed)

---

## Event Inspection Commands

### `wolf events`

List events for a case.

```bash
wolf events <case_id> [options]
```

**Arguments:**
- `case_id` (required): Case ID

**Options:**
- `--type <event_type>`: Filter by event type

**Example:**

```bash
# All events for case
wolf events case_abc123

# Only retrying events
wolf events case_abc123 --type step.retrying

# Only skipped events
wolf events case_abc123 --type step.skipped
```

**Output:**
```
EVENT_ID    TYPE          STEP_ID  TIMESTAMP
 evt_1      step.started  step1    2026-04-28T12:00:00Z
 evt_2      step.completed step1   2026-04-28T12:00:01Z
```

---

## Common Workflows

### Gate Approval Workflow

```bash
# 1. Run workflow with a gate
wolf run workflow-with-gate.yaml
# Output: [case_abc123] PAUSED. Run: wolf approve gate_case_abc123_approval_step

# 2. Approve the gate
wolf approve gate_case_abc123_approval_step

# 3. Resume the case
wolf resume case_abc123
# Output: [case_abc123] Workflow completed
```

### Cancel Running Case

```bash
# 1. Start a workflow (or it pauses at a gate)
wolf run long-workflow.yaml

# 2. List cases to find the case ID
wolf cases list

# 3. Cancel it
wolf cases cancel case_abc123

# 4. Verify
wolf cases list
# Output: case_abc123  cancelled  ...
```

### Validate Before Run

```bash
# Check workflow is valid before executing
wolf validate my-workflow.yaml

# If valid, run it
wolf run my-workflow.yaml
```

### Inspect with JSON for Tooling

```bash
# Get case state as JSON for processing with jq or other tools
wolf cases inspect case_abc123 --json | jq '.status'
# Output: "completed"

wolf cases inspect case_abc123 --json | jq '.completed_steps | length'
# Output: 3
```

---

## Files

| File | Description |
|------|-------------|
| `wolf.yaml` | Project configuration (optional) |
| `.wolf/state/` | Default state storage directory |
| `.wolf/state/cases/<case_id>/` | Case-specific files |
| `.wolf/state/wolf.sqlite` | SQLite index (optional, created on first use) |
