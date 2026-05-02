# Documentation Cleanup Report

**Date:** 2026-05-05
**Branch:** `docs/concept-v2-cleanup`
**Scope:** Clean up documentation after publishing Concept v2

---

## Canonical Documents (kept as current)

| Document | Status |
|----------|--------|
| `README.md` | Updated links |
| `docs/concept-v2.md` | Canonical concept document |
| `docs/concept-v2-summary.md` | Canonical summary |
| `docs/concept-v2-open-questions.md` | Canonical open questions |
| `docs/getting-started.md` | Updated link to concept-v2 |
| `docs/development.md` | Kept as-is |
| `docs/cli-reference.md` | Kept as-is |
| `docs/workflow-syntax.md` | Kept as-is |
| `docs/README.md` | New: documentation index |

## Archived Documents

| Original Path | Archived Path | Reason |
|---------------|---------------|--------|
| `docs/concept.md` | `docs/archive/concept-v1.md` | Superseded by Concept v2 |

## Updated Links

| File | Before | After |
|------|--------|-------|
| `README.md` | `docs/concept.md` | `docs/archive/concept-v1.md` (archived) |
| `docs/getting-started.md` | `../concept.md` | `../concept-v2.md` |
| `docs/discussions/index.md` | — | Added note: canonical concept is `docs/concept-v2.md` |

## Historical Documents (kept as-is)

| Document | Reason |
|----------|--------|
| `docs/discussions/adaptive-agent-design.md` | Historical architecture discussion |
| `docs/discussions/memory-subsystem-architecture.md` | Historical architecture discussion |
| `docs/discussions/research-and-declarative-architecture.md` | Historical architecture discussion |
| `docs/discussions/tool-system-and-a2a.md` | Historical architecture discussion |
| `docs/discussions/discussions-summary.md` | Historical discussion summary |
| `docs/superpowers/specs/*` | MVP technical specs |
| `docs/superpowers/plans/*` | MVP implementation plans |

## Untouched Directories

| Directory | Reason |
|-----------|--------|
| `scenario-lab/data/**` | Source of truth for Scenario Lab |
| `scenario-lab/references/**` | Scenario Lab references |
| `scenario-lab/templates/**` | Scenario Lab templates |
| `scenario-lab/vocabularies/**` | Scenario Lab vocabularies |
| `examples/**` | Example workflows |

## Open Questions Remaining

See `docs/concept-v2-open-questions.md` for the full list:

1. ArtifactStore for Source Artifacts — separate store or foreign key?
2. ExecutionArtifact vs TraceEvent threshold — heuristic for MVP, formal decision tree deferred.
3. Conversation promotion detection — explicit signal for MVP, intent classification deferred.
4. SessionTrace retention — session-scoped for MVP, long-term deferred.
5. Domain-specific receipt taxonomy — domain pack level for MVP, controlled vocabulary deferred.

## Safety Checks

| Check | Status |
|-------|--------|
| Scenario Lab JSONL data not changed | ✅ Confirmed |
| Schemas/templates/vocabularies not changed | ✅ Confirmed |
| Concept v2 content not rewritten | ✅ Confirmed |
| No roadmap added | ✅ Confirmed |
| Historical docs not deleted without archiving | ✅ Confirmed |

---

*Report generated after documentation cleanup pass.*
