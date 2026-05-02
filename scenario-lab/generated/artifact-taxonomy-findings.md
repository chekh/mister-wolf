# Artifact Taxonomy Findings

## Universal Artifacts (≥10 domains)

| Artifact | Occurrences | Domains |
|----------|-------------|---------|

## Development Core Artifacts (SE + Architecture)

- `ADL` — 3 total (SE: 0, Arch: 3)
- `ADR` — 4 total (SE: 1, Arch: 3)
- `ADRReview` — 2 total (SE: 0, Arch: 2)
- `AcceptanceCriteria` — 2 total (SE: 2, Arch: 0)
- `Answer` — 10 total (SE: 2, Arch: 0)
- `ArchitectureDiagram` — 2 total (SE: 1, Arch: 1)
- `CIReport` — 2 total (SE: 2, Arch: 0)
- `CISummary` — 1 total (SE: 1, Arch: 0)
- `ChangeLog` — 2 total (SE: 2, Arch: 0)
- `ComparisonReport` — 1 total (SE: 0, Arch: 1)
- `CompatibilityMatrix` — 2 total (SE: 1, Arch: 1)
- `CoverageReport` — 2 total (SE: 2, Arch: 0)
- `DataModel` — 2 total (SE: 2, Arch: 0)
- `DecisionLog` — 3 total (SE: 1, Arch: 1)
- `ImplementationPlan` — 2 total (SE: 2, Arch: 0)
- `InterfaceContract` — 2 total (SE: 2, Arch: 0)
- `MigrationPlan` — 2 total (SE: 1, Arch: 1)
- `MigrationRoadmap` — 1 total (SE: 0, Arch: 1)
- `MitigationPlan` — 1 total (SE: 0, Arch: 1)
- `NextMVPRecommendation` — 1 total (SE: 1, Arch: 0)
- `OpenAPISpec` — 1 total (SE: 1, Arch: 0)
- `PRDescription` — 1 total (SE: 1, Arch: 0)
- `PolicyDecision` — 1 total (SE: 1, Arch: 0)
- `RefactorReport` — 1 total (SE: 1, Arch: 0)
- `RefactoringRoadmap` — 1 total (SE: 1, Arch: 0)
- `ReleaseChecklist` — 3 total (SE: 3, Arch: 0)
- `ReviewReport` — 2 total (SE: 2, Arch: 0)
- `RiskRegister` — 8 total (SE: 1, Arch: 2)
- `RollbackPlan` — 3 total (SE: 2, Arch: 1)
- `SecurityReviewReport` — 2 total (SE: 1, Arch: 1)
- `SystemDiagram` — 2 total (SE: 0, Arch: 2)
- `TaskList` — 2 total (SE: 2, Arch: 0)
- `TechnicalSpecification` — 2 total (SE: 2, Arch: 0)
- `TestCaseList` — 2 total (SE: 2, Arch: 0)
- `TestPlan` — 2 total (SE: 2, Arch: 0)
- `TestResults` — 3 total (SE: 3, Arch: 0)
- `ThreatModel` — 3 total (SE: 1, Arch: 2)

## Governance Artifacts

- `PolicyDecision` — 1 occurrences
- `DecisionLog` — 3 occurrences
- `RiskRegister` — 8 occurrences

## Domain-Specific Artifacts

- `TestResults` — 3 in software_engineering
- `RemediationPlan` — 3 in security_compliance
- `ReleaseChecklist` — 3 in software_engineering
- `ADL` — 3 in architecture
- `ReviewReport` — 2 in software_engineering
- `MeetingBrief` — 2 in office_assistant
- `ComplianceGapReport` — 2 in security_compliance
- `ADRReview` — 2 in architecture
- `AcceptanceCriteria` — 2 in software_engineering
- `TechnicalSpecification` — 2 in software_engineering
- `DataModel` — 2 in software_engineering
- `InterfaceContract` — 2 in software_engineering
- `TaskList` — 2 in software_engineering
- `TestPlan` — 2 in software_engineering
- `TestCaseList` — 2 in software_engineering
- `CIReport` — 2 in software_engineering
- `ChangeLog` — 2 in software_engineering
- `ImplementationPlan` — 2 in software_engineering
- `CoverageReport` — 2 in software_engineering
- `SystemDiagram` — 2 in architecture

## Artifact Chains (SE + Architecture)

### spec → tasks → implementation → tests

- `TechnicalSpecification` — 2 occurrences
- `TaskList` — 2 occurrences
- `ImplementationPlan` — 2 occurrences
- `TestPlan` — 2 occurrences
- `TestCaseList` — 2 occurrences
- `CoverageReport` — 2 occurrences

### ADR/ADL → decision evolution

- `ADR` — 4 occurrences
- `ADL` — 3 occurrences
- `DecisionLog` — 3 occurrences
- `ArchitectureDiagram` — 2 occurrences
- `SystemDiagram` — 2 occurrences

### release → changelog → notes

- `ReleaseChecklist` — 3 occurrences
- `CIReport` — 2 occurrences
- `ChangeLog` — 2 occurrences
- `ReleaseNotes` — 0 occurrences

### migration → rollback → compatibility

- `MigrationPlan` — 2 occurrences
- `CompatibilityMatrix` — 2 occurrences
- `RollbackPlan` — 3 occurrences
- `RiskRegister` — 8 occurrences

### API contract → implementation → tests

- `OpenAPISpec` — 1 occurrences
- `InterfaceContract` — 2 occurrences
- `DataModel` — 2 occurrences
- `ContractTestPlan` — 0 occurrences

### security review → approval

- `ThreatModel` — 3 occurrences
- `SecurityReviewReport` — 2 occurrences
- `PolicyDecision` — 1 occurrences

## First-Class Artifacts for Concept v2

**Must be first-class:**
- `TechnicalSpecification` — anchor for spec-first flow
- `TaskList` — task breakdown from spec
- `TestPlan` / `TestCaseList` — TDD and quality gates
- `CoverageReport` — TDD gate evidence
- `ADR` / `ADL` — architecture decisions
- `ReleaseChecklist` / `ChangeLog` — release readiness
- `ThreatModel` / `SecurityReviewReport` — security-sensitive changes
- `PolicyDecision` — governance traceability
