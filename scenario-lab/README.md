# Scenario Lab — Mr. Wolf Concept Research Workspace

## Overview

This directory contains the **Scenario Lab** for the Mr. Wolf project: a structured, scenario-driven methodology for designing and validating the Mr. Wolf agentic control plane concept.

**Purpose:** Generate Scenario Cards, run playthroughs, simulate expert reviews, and extract artifacts/components/policies/risks to refine the concept before implementation.

**Status:** Ready for experiment start. Initial seed: 20 Scenario Cards, 5 Playthroughs, 5 Extraction Reports.

## Directory Structure

```
scenario-lab/
  SKILL.md                          # Main skill reference
  README.md                         # This file
  references/                       # Schema and methodology docs
    testing-approach.md
    scenario-card-schema.md
    playthrough-schema.md
    agent-execution-plan.md
    vocabularies.md
    examples.md
  vocabularies/                     # Controlled vocabularies (YAML)
    domains.yaml
    tags.yaml
    artifact-types.yaml
    capability-types.yaml
    policy-actions.yaml
    configuration-modes.yaml
  templates/                        # Empty templates for data entry
    scenario-card.yaml
    playthrough.yaml
    extraction-report.yaml
  data/                             # Raw experiment data
    scenarios/
      scenarios.jsonl               # All Scenario Cards
    playthroughs/
      playthroughs.jsonl            # Playthrough Records
    extraction-reports/
      extraction-reports.jsonl      # Extraction Reports
  generated/                        # Aggregated analysis outputs
    coverage-matrix.md
    artifact-catalog.md
    component-demand-map.md
    policy-pattern-catalog.md
    configuration-effort-map.md
    adapter-demand-map.md
    failure-mode-catalog.md
    memory-use-map.md
    mvp-candidates.md
    concept-implications.md
    expert-review-notes.md
    final-summary.md
  scripts/                          # Helper scripts
    validate_scenario_bank.py
    build_coverage_matrix.py
    extract_catalogs.py
```

## How to Start an Experiment

### 1. Generate Scenario Cards

Use the skill or manually create cards following `references/scenario-card-schema.md`.

```bash
# Add new scenarios to the bank
cat new_scenarios.jsonl >> data/scenarios/scenarios.jsonl
```

### 2. Validate the Bank

```bash
python3 scripts/validate_scenario_bank.py data/scenarios/scenarios.jsonl
```

### 3. Run Playthroughs

Select scenarios and simulate User/Wolf/Observer roles per `references/playthrough-schema.md`.

```bash
# Append new playthroughs
cat new_playthroughs.jsonl >> data/playthroughs/playthroughs.jsonl
cat new_reports.jsonl >> data/extraction-reports/extraction-reports.jsonl
```

### 4. Build Coverage Matrix

```bash
python3 scripts/build_coverage_matrix.py \
  --scenarios data/scenarios/scenarios.jsonl \
  --output generated/coverage-matrix.md
```

### 5. Extract Catalogs

```bash
python3 scripts/extract_catalogs.py \
  --scenarios data/scenarios/scenarios.jsonl \
  --reports data/extraction-reports/extraction-reports.jsonl \
  --output-dir generated/
```

## Quality Gates

Before accepting new data:

- [ ] Scenario Cards have all required fields
- [ ] IDs are unique
- [ ] Controlled vocabulary is used
- [ ] Each scenario has at least one output artifact
- [ ] Each scenario has failure modes
- [ ] Playthroughs have ≤12 interaction steps
- [ ] Each playthrough has a matching Extraction Report
- [ ] Extraction Reports have verdict, findings, and concept updates

## Current State

| Metric | Value | Target |
|--------|-------|--------|
| Scenario Cards | 20 | 100–200 |
| Domains | 9 | ≥10 |
| Playthroughs | 5 | 30–60 |
| Extraction Reports | 5 | 30–60 |
| External capability scenarios | 30% | ≥20% |
| Policy/gate scenarios | 60% | ≥20% |
| Memory scenarios | 95% | ≥10% |

## Source of Truth

- **Scenarios:** `data/scenarios/scenarios.jsonl` (JSONL)
- **Playthroughs:** `data/playthroughs/playthroughs.jsonl` (JSONL)
- **Extraction Reports:** `data/extraction-reports/extraction-reports.jsonl` (JSONL)

Markdown renders in `generated/` are for human reading only. Always update JSONL first.

## Git

This directory should be tracked in git. Experiment data is part of the concept development process.

```bash
git add scenario-lab/
git commit -m "scenario-lab: initialize experiment workspace with seed data"
```

## Notes

- Do not write long fictional dialogues in playthroughs.
- Treat external capabilities as untrusted by default.
- Always separate Scenario Card, Playthrough Record, and Extraction Report.
- Do not produce roadmaps unless explicitly asked.
