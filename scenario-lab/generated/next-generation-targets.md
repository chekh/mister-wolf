# Next Generation Targets

**Source:** Expert review findings + coverage gaps analysis
**Date:** 2026-05-02
**Scope:** Targets для следующей волны генерации Scenario Cards и Playthroughs

---

## 1. Coverage Targets

### 1.1 Scenario Count

| Metric | Current | Target Next Gen | Final Target |
|--------|---------|-----------------|--------------|
| Total scenarios | 20 | 60 | 120 |
| Domains | 9 | 12 | 15 |
| Playthroughs | 20 | 40 | 80 |
| Extraction Reports | 20 | 40 | 80 |

### 1.2 Level Coverage by Domain

Каждый домен должен иметь минимум:

```
Level 1: 2 scenarios (simple answer variants)
Level 2: 2 scenarios (context-aware variants)
Level 3: 2 scenarios (plan/dry-run variants)
Level 4: 2 scenarios (governed action variants)
Level 5: 1 scenario (multi-capability/external)
```

**Critical gaps to fill:**

| Domain | Missing Levels | Priority |
|--------|---------------|----------|
| data_analysis | L1, L2, L4, L5 | P0 |
| hr_recruiting | L1, L3, L4, L5 | P0 |
| finance_ops | L1, L2, L5 | P0 |
| product_management | L1, L4, L5 | P0 |
| research | L1, L2, L5 | P0 |
| legal_ops | L1, L5 | P1 |
| office_assistant | L2, L5 | P1 |
| security_compliance | L1, L2, L4 | P1 |
| software_engineering | L3 | P1 |

### 1.3 New Domains to Add

| Domain | Rationale | Target Scenarios |
|--------|-----------|-----------------|
| architecture | ADR/ADL heavy; overlaps with software_engineering but distinct | 4 |
| concierge | Personal assistant scenarios; tests zero-config heavily | 4 |
| sales_crm | CRM integrations; tests external capabilities | 4 |
| education | Curriculum design; tests memory and adaptation | 3 |
| content_marketing | Creative workflows; tests artifact diversity | 3 |

---

## 2. Content Targets

### 2.1 Configuration Mode Distribution

| Mode | Current % | Target % | Rationale |
|------|-----------|----------|-----------|
| zero_config | 10% | 15% | First useful product anchor |
| generated_config | 45% | 35% | Most common, but should not dominate |
| explicit_config | 10% | 15% | Power users, complex domains |
| domain_pack | 30% | 25% | Specialized domains |
| custom_workflow | 0% | 5% | L4–L5 complex scenarios |
| custom_plugin | 5% | 5% | Edge cases only |

### 2.2 Governance Distribution

| Level | Current % | Target % |
|-------|-----------|----------|
| autonomous | 10% | 15% |
| supervised | 55% | 40% |
| gated | 30% | 30% |
| expert_reviewed | 5% | 15% |

### 2.3 External Capability Scenarios

| Capability Type | Current | Target |
|-----------------|---------|--------|
| MCP (GitHub, Calendar, Slack) | 3 | 8 |
| Direct API (ERP, legal DB) | 2 | 5 |
| Imported skill | 0 | 3 |
| Wrapper/Adapter | 1 | 4 |
| **Total external** | **6 (30%)** | **20 (33%)** |

### 2.4 Cross-Domain Scenarios

**New category:** Сценарии, где Wolf переключается между доменами.

| Scenario | Domains | Level |
|----------|---------|-------|
| Legal review of product roadmap | legal_ops + product_management | L4 |
| Security audit of financial system | security_compliance + finance_ops | L4 |
| Research synthesis for sales pitch | research + sales_crm | L3 |
| Architecture decision with compliance check | architecture + security_compliance | L4 |

---

## 3. Quality Targets

### 3.1 Playthrough Depth

| Playthrough Type | Current | Target |
|-----------------|---------|--------|
| UX Play | 20 | 40 |
| Runtime Play | 5 | 20 |
| Failure Play | 3 | 15 |
| Minimality Play | 5 | 15 |

**Rule:**
- L1–L2: UX + Minimality (2 playthroughs per scenario)
- L3: UX + Runtime + Minimality (3 playthroughs)
- L4–L5: All 4 types (4 playthroughs)

### 3.2 Extraction Report Depth

| Finding Category | Current Coverage | Target |
|-----------------|------------------|--------|
| behavior_findings | 100% | 100% |
| artifact_findings | 100% | 100% |
| component_findings | 100% | 100% |
| configuration_findings | 80% | 100% |
| policy_findings | 90% | 100% |
| capability_findings | 70% | 100% |
| memory_findings | 60% | 100% |

---

## 4. Concept Pressure Targets

### 4.1 High Concept Pressure Scenarios

Нужно больше сценариев, которые "ломают" концепцию:

| Pressure Type | Current | Target | Example |
|--------------|---------|--------|---------|
| Memory conflict | 1 | 5 | "Old decision contradicts new context" |
| Policy conflict | 2 | 5 | "Two policies require opposite actions" |
| Domain pack conflict | 0 | 3 | "Legal pack vs Security pack rules collide" |
| Ambiguous intent | 2 | 5 | "User request fits 3 different scenarios" |
| Capability unavailable | 3 | 5 | "Critical MCP tool down during execution" |

### 4.2 First Useful Product Candidates

Идентифицировать сценарии с максимальным value/minimum complexity:

| Scenario | Domain | Level | Value | Complexity | FUP Score |
|----------|--------|-------|-------|------------|-----------|
| Quick NDA review | legal_ops | L2 | High | Low | ★★★★★ |
| Draft follow-up email | office_assistant | L1 | High | Low | ★★★★★ |
| Repo review + next MVP | software_engineering | L2 | High | Low | ★★★★☆ |
| Expense report processing | finance_ops | L4 | Medium | Medium | ★★★☆☆ |
| Incident response | security_compliance | L5 | High | High | ★★☆☆☆ |

**Target:** Generate 10 FUP-candidate scenarios для каждого домена.

---

## 5. Process Targets

### 5.1 Automation

| Task | Current | Target |
|------|---------|--------|
| Validation | Manual script | CI-integrated (pre-commit) |
| Coverage matrix | Manual generation | Auto-generated on each PR |
| Expert review | Simulated | Rotating human experts |
| Concept implications | Manual aggregation | Auto-aggregated from reports |

### 5.2 Review Cadence

| Milestone | Scenarios | Playthroughs | Review Type |
|-----------|-----------|--------------|-------------|
| Seed (current) | 20 | 20 | Self-review |
| Alpha | 60 | 40 | Peer review |
| Beta | 100 | 60 | External expert review |
| v1.0 | 120 | 80 | Final concept freeze |

---

## 6. Anti-Targets (What NOT to Do)

1. **Do not** generate >20 scenarios per domain без deep playthroughs.
2. **Do not** add new domains пока existing gaps не закрыты.
3. **Do not** create L5 scenarios для доменов без L1–L4 coverage.
4. **Do not** invent new artifact types без 3+ сценариев их использования.
5. **Do not** add new configuration modes — current 6 достаточны.
6. **Do not** treat every extraction report suggestion как component demand.
7. **Do not** generate scenarios только для software_engineering.

---

## 7. Next Steps

1. **Immediate (this week):** Generate 20 new scenarios для закрытия level gaps.
2. **Short-term (2 weeks):** Run playthroughs для new scenarios; update coverage matrix.
3. **Medium-term (month):** Add 3 new domains (architecture, concierge, sales_crm).
4. **Long-term (quarter):** Reach 100 scenarios + 60 playthroughs; external expert review.
