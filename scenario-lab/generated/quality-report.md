# Scenario Lab Quality Report

Generated: 2026-05-02

## Overall Statistics
- Total Scenario Cards: 20
- Total Playthrough Records: 20
- Total Extraction Reports: 20
- Coverage: 100% (all scenarios have playthroughs)

## Domain Coverage
- data_analysis: 1 scenarios
- finance_ops: 2 scenarios
- hr_recruiting: 1 scenarios
- legal_ops: 3 scenarios
- office_assistant: 3 scenarios
- product_management: 2 scenarios
- research: 2 scenarios
- security_compliance: 2 scenarios
- software_engineering: 4 scenarios

## Level Coverage
- Level 1: 2 scenarios
- Level 2: 4 scenarios
- Level 3: 7 scenarios
- Level 4: 5 scenarios
- Level 5: 2 scenarios

## Quality Checks
- [x] All scenarios have required fields
- [x] All IDs are unique
- [x] Controlled vocabulary used
- [x] All scenarios have failure modes
- [x] All scenarios have configuration mode
- [x] All playthroughs ≤ 12 steps
- [x] All playthroughs have matching extraction reports
- [x] All extraction reports have verdict and concept updates

## Gaps Identified
- Level 1 scenarios only in software_engineering and office_assistant
- Level 5 scenarios only in software_engineering and security_compliance
- data_analysis, hr_recruiting lack Level 1, L2, L4, L5
- finance_ops lacks Level 1, L2, L5
- product_management lacks Level 1, L4, L5
- research lacks Level 1, L2, L5

## Recommendations
1. Add more Level 1 scenarios for non-software domains
2. Add Level 5 scenarios for legal_ops, finance_ops, research
3. Add more external capability scenarios for data_analysis, hr_recruiting
4. Add memory-heavy scenarios for domains with 0 memory usage
5. Run expert review pass on aggregated findings
