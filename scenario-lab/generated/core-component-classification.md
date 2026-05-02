# Core Component Classification

## Always Core (≥60 scenarios)

| Component | Scenarios | Levels |
|-----------|-----------|--------|
| WolfFacade | 80 | 1, 2, 3, 4, 5 |
| ContextResolver | 72 | 1, 2, 3, 4, 5 |
| AgentRunner | 69 | 1, 2, 3, 4, 5 |
| TraceSystem | 63 | 1, 2, 3, 4, 5 |

## Core for L2+ (≥30 scenarios, all L2+)

| Component | Scenarios | Levels |
|-----------|-----------|--------|

## Core for L3+ (≥15 scenarios, all L3+)

| Component | Scenarios | Levels |
|-----------|-----------|--------|
| PolicyCore | 23 | 4, 5 |

## Core for L4/L5 (≥5 scenarios, all L4+)

| Component | Scenarios | Levels |
|-----------|-----------|--------|
| MCPWrapper | 8 | 4, 5 |
| FileWriteGateWithRollback | 8 | 4, 5 |

## Domain-Specific / Adapter Components

| Component | Scenarios | Levels |
|-----------|-----------|--------|
| ScenarioRouter | 50 | 1, 2, 3, 4, 5 |
| ScenarioRouterLight | 30 | 1, 2, 3 |
| ModelRouter | 8 | 1, 2 |
| AdapterLayer | 4 | 5 |

## Component Noise / Deferred (≤3 scenarios)

| Component | Scenarios | Levels | Verdict |
|-----------|-----------|--------|---------|
| EmergencyPolicy | 1 | 5 | defer |

## Evidence-Based Analysis

**WolfFacade**: present in 80 scenarios (100%). Always core.
**ContextResolver**: present in 72 scenarios. Core from L2+.
**AgentRunner**: present in 69 scenarios. Core from L2+.
**TraceSystem**: present in 63 scenarios. Core from L2+.
**ScenarioRouter / ScenarioRouterLight**: present in 80 scenarios combined. Core for L2+.
**PolicyCore**: present in 23 scenarios. Core for L4/L5.
**ModelRouter**: present in 8 scenarios. Core for L1/L2 fast path.
**MCPWrapper**: present in 8 scenarios. Core for L5 only.
**FileWriteGateWithRollback**: present in 8 scenarios. Core for L4/L5 with file mutations.
**AdapterLayer**: present in 4 scenarios. Domain-specific / adapter.
