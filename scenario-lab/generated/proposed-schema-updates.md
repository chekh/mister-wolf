# Proposed Schema Updates

**Source:** Expert review findings, 2026-05-02
**Scope:** Scenario Card schema, Playthrough schema, Controlled vocabularies
**Status:** Proposed, pending approval

---

## 1. Scenario Card Schema Updates

### 1.1 New Field: `execution_result` (optional)

**Rationale:** SolveResult envelope identified as missing in 3 extraction reports. Need explicit output wrapper.

```yaml
execution_result:
  type: object
  properties:
    envelope_type:
      enum: [Answer, Plan, Artifact, Refusal, PartialResult]
    summary: string
    confidence: high | medium | low
    trace_reference: string  # ссылка на CaseTrace
```

**Placement:** sibling to `artifacts`, not inside it.

### 1.2 Update: `wolf_configuration.mode` — restrict order

**Rationale:** Progressive disclosure requirement (zero_config → generated_config → explicit_config).

```yaml
wolf_configuration:
  mode:
    type: array
    items:
      enum: [zero_config, generated_config, explicit_config, domain_pack, rule_routing, dynamic_persona, llm_assisted_selection, memory_adapted]
    # Новое ограничение: mode должен быть ordered от simple к complex
    # Валидация: если zero_config present, не может быть domain_pack или explicit_config
```

**Validation rule:**
```python
if "zero_config" in modes and any(m in ["domain_pack", "explicit_config", "custom_plugin"] for m in modes):
    raise ValidationError("zero_config incompatible with complex config modes")
```

### 1.3 New Field: `gate_severity` (optional, default: block)

**Rationale:** Gate severity levels (silent/notify/block) accepted as compromise between Security и UX.

```yaml
gates:
  - gate_name: string
    severity: silent | notify | block  # новое поле
    rationale: string  # объяснение для user-visible текста
```

**Backward compatibility:** Если `severity` отсутствует, default = `block`.

### 1.4 Update: `artifacts` — add lifecycle state

**Rationale:** Artifact lifecycle state machine partially accepted.

```yaml
artifacts:
  outputs:
    - name: string
      type: string
      lifecycle_state: created | validated | persisted  # новое поле
      domain_specific: boolean  # новое поле: true если artifact уникален для домена
```

### 1.5 New Field: `observability_requirements` (L3+)

**Rationale:** Observability subsystem accepted для L3+.

```yaml
observability_requirements:
  metrics: boolean  # нужны ли метрики
  spans: boolean    # нужен ли execution tracing
  alerts: string[]  # какие alert conditions
```

**Condition:** Required if `scenario_level >= 3`. Optional для L1–L2.

### 1.6 Update: `capabilities.external` — add capability taxonomy

**Rationale:** Capability taxonomy accepted. Need classify external capabilities.

```yaml
capabilities:
  external:
    - name: string
      type: mcp | direct_api | imported_skill | wrapper  # новое поле
      trust_level: trusted | untrusted | sandboxed  # новое поле
      fallback_action: string  # новое поле: что делать при недоступности
```

---

## 2. Playthrough Schema Updates

### 2.1 New Field: `step.gate_explanation`

**Rationale:** Gate explanation accepted — every approval request must include "why".

```yaml
interaction_steps:
  - step: N
    actor: wolf
    type: approval_request
    content: string
    gate_explanation: string  # новое: почему нужен approval
    internal_notes: ...
```

### 2.2 New Field: `runtime_path.circuit_breaker_triggered`

**Rationale:** Circuit breaker accepted для L3+.

```yaml
runtime_path:
  circuit_breaker_triggered: boolean
  circuit_breaker_reason: string  # если triggered
```

### 2.3 Update: `issues_detected` — add severity

**Rationale:** Разделение issues по severity для prioritization.

```yaml
issues_detected:
  - description: string
    severity: critical | major | minor | info  # новое поле
    category: architecture | security | ux | performance | domain  # новое поле
```

---

## 3. Controlled Vocabulary Updates

### 3.1 Domains — no changes

Current 15 domains sufficient для seed. Add при расширении банка.

### 3.2 Analysis Tags — add new tags

```yaml
# Новые execution tags
- fast_path
- emergency_mode
- circuit_breaker_triggered

# Новые observability tags  
- metrics_required
- tracing_required
- alert_triggered

# Новые governance tags
- audit_trail
- policy_override
- emergency_override
```

### 3.3 Configuration Modes — add validation rules

**New constraint:** Configuration modes have implicit ordering:

```yaml
configuration_mode_order:
  zero_config: 0
  generated_config: 1
  explicit_config: 2
  domain_pack: 3
  rule_routing: 3
  dynamic_persona: 3
  llm_assisted_selection: 3
  memory_adapted: 3
  custom_workflow: 4
  custom_plugin: 5
```

**Validation:** `max(mode_order) - min(mode_order) <= 2` для одного сценария.

### 3.4 Artifact Types — add domain-specific markers

Добавить `domain_affinity` для каждого artifact:

```yaml
artifacts:
  EvidenceTable:
    domain_affinity: [legal_ops, research, product_management]
  RiskRegister:
    domain_affinity: [legal_ops, finance_ops, security_compliance]
  EmailDraft:
    domain_affinity: [office_assistant, sales_crm]
```

---

## 4. JSON Schema Updates

### 4.1 `scenario-card.schema.json` — proposed changes

```json
{
  "properties": {
    "execution_result": {
      "$ref": "#/definitions/ExecutionResult"
    },
    "observability_requirements": {
      "$ref": "#/definitions/ObservabilityRequirements"
    }
  },
  "definitions": {
    "ExecutionResult": {
      "type": "object",
      "properties": {
        "envelope_type": {
          "enum": ["Answer", "Plan", "Artifact", "Refusal", "PartialResult"]
        },
        "summary": { "type": "string" },
        "confidence": { "enum": ["high", "medium", "low"] },
        "trace_reference": { "type": "string" }
      },
      "required": ["envelope_type", "summary"]
    },
    "ObservabilityRequirements": {
      "type": "object",
      "properties": {
        "metrics": { "type": "boolean" },
        "spans": { "type": "boolean" },
        "alerts": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

### 4.2 `scenario-playthrough.schema.json` — proposed changes

```json
{
  "properties": {
    "interaction_steps": {
      "items": {
        "properties": {
          "gate_explanation": { "type": "string" }
        }
      }
    },
    "runtime_path": {
      "properties": {
        "circuit_breaker_triggered": { "type": "boolean" },
        "circuit_breaker_reason": { "type": "string" }
      }
    }
  }
}
```

---

## 5. Migration Plan

### Phase 1: Backward-compatible additions
- Add optional fields: `execution_result`, `gate_severity`, `observability_requirements`
- Add new analysis tags
- Не ломает существующие 20 сценариев

### Phase 2: Validation rules
- Implement config mode ordering validation
- Implement gate severity defaults
- Update `validate_scenario_bank.py`

### Phase 3: Schema enforcement
- Make `execution_result` required для новых сценариев L2+
- Make `observability_requirements` required для L3+
- Обновить templates/

---

## 6. Open Questions

1. **SolveResult vs Artifact:** Should `execution_result.envelope_type: Artifact` duplicate `artifacts.outputs` или быть canonical source?
2. **Gate severity granularity:** Silent/notify/block достаточно или нужен spectrum (1–5)?
3. **Observability scope:** Metrics для L3+ only или gradually introduced с L2?
4. **Domain affinity:** Should artifact types be strictly per-domain или shared с affinity scoring?
