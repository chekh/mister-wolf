#!/usr/bin/env python3
"""Migrate legacy Scenario Lab data to new schema format."""

import json
import sys
from pathlib import Path
from collections import defaultdict

# External capability type inference
EXTERNAL_CAP_TYPES = {
    "github.mcp": {"type": "mcp", "fallback": "draft PR description locally without CI polling"},
    "slack.mcp": {"type": "mcp", "fallback": "log notification to CaseTrace without sending"},
    "jira.api": {"type": "direct_api", "fallback": "log issue locally without ticket creation"},
    "confluence.api": {"type": "direct_api", "fallback": "draft doc locally without publishing"},
    "google_calendar.api": {"type": "mcp", "fallback": "propose slots without calendar update"},
    "openclaw.skill_import": {"type": "imported_skill", "fallback": "use built-in skill without import"},
    "opencode.skill_import": {"type": "imported_skill", "fallback": "use built-in skill without import"},
    "external_legal_db.api": {"type": "direct_api", "fallback": "use internal precedent memory without external query"},
    "erp.api": {"type": "direct_api", "fallback": "process expense locally without ERP sync"},
    "pagerduty.api": {"type": "direct_api", "fallback": "log incident to CaseTrace without PagerDuty alert"},
    "arxiv.api": {"type": "direct_api", "fallback": "use cached search results without live query"},
    "semantic_scholar.api": {"type": "direct_api", "fallback": "use cached search results without live query"},
}

# Artifact type inference
ARTIFACT_TYPES = {
    "ReviewReport": {"type": "report", "domain_specific": False},
    "NextMVPRecommendation": {"type": "recommendation", "domain_specific": False},
    "RefactorReport": {"type": "report", "domain_specific": False},
    "TestResults": {"type": "report", "domain_specific": False},
    "PRDescription": {"type": "description", "domain_specific": False},
    "CISummary": {"type": "summary", "domain_specific": False},
    "RiskRegister": {"type": "register", "domain_specific": False},
    "NDASummary": {"type": "summary", "domain_specific": True},
    "EvidenceTable": {"type": "table", "domain_specific": True},
    "CounterProposalDraft": {"type": "draft", "domain_specific": True},
    "ComplianceReport": {"type": "report", "domain_specific": False},
    "EmailDraft": {"type": "draft", "domain_specific": False},
    "MeetingBrief": {"type": "brief", "domain_specific": False},
    "ExecutiveSummary": {"type": "summary", "domain_specific": False},
    "RescheduleConfirmation": {"type": "confirmation", "domain_specific": False},
    "ResearchSummary": {"type": "summary", "domain_specific": False},
    "ExperimentPlan": {"type": "plan", "domain_specific": False},
    "MetricsDefinition": {"type": "definition", "domain_specific": False},
    "ScenarioPlan": {"type": "plan", "domain_specific": False},
    "ExpenseReportReview": {"type": "review", "domain_specific": False},
    "PrioritizedBacklog": {"type": "backlog", "domain_specific": False},
    "CapacityRiskSummary": {"type": "summary", "domain_specific": False},
    "ResearchSynthesis": {"type": "synthesis", "domain_specific": True},
    "ComplianceGapReport": {"type": "report", "domain_specific": False},
    "RemediationPlan": {"type": "plan", "domain_specific": False},
    "IncidentReport": {"type": "report", "domain_specific": False},
    "ContainmentLog": {"type": "log", "domain_specific": False},
    "ScreeningReport": {"type": "report", "domain_specific": True},
    "RankedCandidateList": {"type": "list", "domain_specific": True},
    "AnalysisReport": {"type": "report", "domain_specific": False},
    "ForecastModel": {"type": "model", "domain_specific": False},
}

# Execution result inference by scenario level
EXECUTION_RESULT_TYPES = {
    1: "Answer",
    2: "Artifact",
    3: "Plan",
    4: "Artifact",
    5: "Artifact",
}

# Gate severity inference
GATE_SEVERITY = {
    "file_write_approval": ("block", "File modifications can alter project state. Approval required."),
    "test_coverage_gate": ("block", "Code changes below coverage threshold need explicit override."),
    "external_action_approval": ("block", "External actions may affect third-party systems. Approval required."),
    "mcp_capability_gate": ("block", "MCP invocation may trigger side effects. Approval required."),
    "legal_advice_disclaimer": ("notify", "This is not legal advice. Please consult a licensed attorney."),
    "expert_gate_legal_advice": ("block", "Legal advice requires expert review before delivery."),
    "external_database_query_approval": ("block", "External database queries may incur costs. Approval required."),
    "pii_handling_gate": ("block", "PII handling requires explicit confirmation for compliance."),
    "experiment_plan_approval": ("block", "Experiment plan affects user experience. Approval required."),
    "calendar_mutation_approval": ("block", "Calendar changes affect scheduling. Approval required."),
    "external_notification_approval": ("block", "External notifications may be irreversible. Approval required."),
    "expense_approval_gate": ("block", "Expense processing involves financial liability. Approval required."),
    "compliance_check_gate": ("block", "Compliance exceptions need explicit sign-off."),
    "secrets_handling_gate": ("block", "Secrets detected in inputs. Review required before processing."),
    "emergency_action_approval": ("block", "Emergency actions may have irreversible effects. Approval required."),
}

# Observability requirements by domain/level
OBSERVABILITY_RULES = {
    ("security_compliance", 3): {"metrics": True, "spans": True, "alerts": ["secrets_detected", "compliance_gap_high"]},
    ("security_compliance", 5): {"metrics": True, "spans": True, "alerts": ["incident_escalation", "emergency_override"]},
}

def migrate_artifacts_outputs(outputs):
    """Migrate list of strings to list of objects."""
    result = []
    for name in outputs:
        meta = ARTIFACT_TYPES.get(name, {"type": "artifact", "domain_specific": False})
        result.append({
            "name": name,
            "type": meta["type"],
            "lifecycle_state": "created",
            "domain_specific": meta["domain_specific"],
        })
    return result

def migrate_external_caps(caps):
    """Migrate list of strings to list of objects."""
    result = []
    for name in caps:
        meta = EXTERNAL_CAP_TYPES.get(name, {"type": "direct_api", "fallback": "disable capability and notify user"})
        result.append({
            "name": name,
            "type": meta["type"],
            "trust_level": "untrusted",
            "fallback_action": meta["fallback"],
        })
    return result

def migrate_gates(gates):
    """Migrate list of strings to list of objects."""
    result = []
    for g in gates:
        if isinstance(g, dict):
            result.append(g)
            continue
        severity, rationale = GATE_SEVERITY.get(g, ("block", f"Gate '{g}' requires explicit approval."))
        result.append({
            "gate_name": g,
            "severity": severity,
            "rationale": rationale,
        })
    return result

def infer_execution_result(scenario):
    level = scenario.get("scenario_level", 1)
    visible = scenario.get("expected_visible_behavior", [])
    behavior_text = " ".join(visible).lower()
    
    # Determine envelope type
    envelope = EXECUTION_RESULT_TYPES.get(level, "Artifact")
    
    # Determine if refusal
    if "refus" in behavior_text or "denied" in behavior_text:
        envelope = "Refusal"
    elif "partial" in behavior_text:
        envelope = "PartialResult"
    
    # Get output artifacts for summary
    outputs = scenario.get("artifacts", {}).get("outputs", [])
    if isinstance(outputs, list) and len(outputs) > 0:
        if isinstance(outputs[0], dict):
            output_names = [o["name"] for o in outputs]
        else:
            output_names = outputs
        summary = f"{envelope}: " + ", ".join(output_names)
    else:
        summary = f"{envelope}: no artifacts"
    
    # Infer confidence from ambiguity
    ambiguity = scenario.get("user_intent", {}).get("ambiguity", "medium")
    confidence = "high" if ambiguity == "low" else "medium" if ambiguity == "medium" else "low"
    
    return {
        "envelope_type": envelope,
        "summary": summary,
        "confidence": confidence,
        "trace_reference": "CaseTrace",
    }

def infer_observability(scenario):
    level = scenario.get("scenario_level", 1)
    if level < 3:
        return None
    
    domain = scenario.get("domain", "")
    key = (domain, level)
    if key in OBSERVABILITY_RULES:
        return OBSERVABILITY_RULES[key].copy()
    
    # Default based on level
    if level == 3:
        return {"metrics": False, "spans": False, "alerts": []}
    elif level == 4:
        return {"metrics": True, "spans": False, "alerts": ["gate_triggered"]}
    else:  # level 5
        return {"metrics": True, "spans": True, "alerts": ["gate_triggered", "external_capability_failure"]}

def migrate_scenario(scenario):
    changes = []
    
    # execution_result
    level = scenario.get("scenario_level", 1)
    if level >= 1:
        scenario["execution_result"] = infer_execution_result(scenario)
        changes.append("execution_result")
    
    # gates
    gates = scenario.get("gates", [])
    if gates and any(isinstance(g, str) for g in gates):
        scenario["gates"] = migrate_gates(gates)
        changes.append("gates")
    
    # external capabilities
    external = scenario.get("capabilities", {}).get("external", [])
    if external and any(isinstance(c, str) for c in external):
        scenario["capabilities"]["external"] = migrate_external_caps(external)
        changes.append("external_capabilities")
    
    # artifacts.outputs
    outputs = scenario.get("artifacts", {}).get("outputs", [])
    if outputs and any(isinstance(o, str) for o in outputs):
        scenario["artifacts"]["outputs"] = migrate_artifacts_outputs(outputs)
        changes.append("artifacts_outputs")
    
    # observability_requirements
    obs = infer_observability(scenario)
    if obs:
        scenario["observability_requirements"] = obs
        changes.append("observability_requirements")
    
    return changes

def migrate_playthrough(pt):
    changes = []
    
    # gate_explanation for approval_request steps
    for step in pt.get("interaction_steps", []):
        if step.get("type") == "approval_request" and "gate_explanation" not in step:
            step["gate_explanation"] = "Approval required for this action."
            changes.append("gate_explanation")
    
    # circuit_breaker in runtime_path
    runtime = pt.get("runtime_path", {})
    if "circuit_breaker_triggered" not in runtime:
        runtime["circuit_breaker_triggered"] = False
        runtime["circuit_breaker_reason"] = ""
        changes.append("circuit_breaker")
    
    # issues_detected structured
    issues = pt.get("issues_detected", [])
    if issues and any(isinstance(i, str) for i in issues):
        new_issues = []
        for desc in issues:
            # Infer severity and category
            severity = "minor"
            category = "ux"
            desc_lower = desc.lower()
            if any(w in desc_lower for w in ["critical", "emergency", "security", "breach", "leak"]):
                severity = "critical"
                category = "security"
            elif any(w in desc_lower for w in ["missing", "need explicit", "should be"]):
                severity = "major"
                category = "architecture"
            elif any(w in desc_lower for w in ["gate", "policy", "approval", "fallback"]):
                severity = "major"
                category = "security"
            elif any(w in desc_lower for w in ["user", "confusion", "unclear", "understand"]):
                severity = "minor"
                category = "ux"
            
            new_issues.append({
                "description": desc,
                "severity": severity,
                "category": category,
            })
        pt["issues_detected"] = new_issues
        changes.append("issues_detected")
    
    return changes

def main():
    stats = defaultdict(int)
    
    # Migrate scenarios
    scenarios = []
    with open("data/scenarios/scenarios.jsonl", "r") as f:
        for line in f:
            line = line.strip()
            if line:
                scenarios.append(json.loads(line))
    
    for s in scenarios:
        changes = migrate_scenario(s)
        for c in changes:
            stats[f"scenario_{c}"] += 1
    
    with open("data/scenarios/scenarios.jsonl", "w") as f:
        for s in scenarios:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")
    
    print(f"Migrated {len(scenarios)} scenarios")
    
    # Migrate playthroughs
    playthroughs = []
    with open("data/playthroughs/playthroughs.jsonl", "r") as f:
        for line in f:
            line = line.strip()
            if line:
                playthroughs.append(json.loads(line))
    
    for pt in playthroughs:
        changes = migrate_playthrough(pt)
        for c in changes:
            stats[f"playthrough_{c}"] += 1
    
    with open("data/playthroughs/playthroughs.jsonl", "w") as f:
        for pt in playthroughs:
            f.write(json.dumps(pt, ensure_ascii=False) + "\n")
    
    print(f"Migrated {len(playthroughs)} playthroughs")
    
    # Print stats
    print("\n=== MIGRATION STATS ===")
    for k, v in sorted(stats.items()):
        print(f"  {k}: {v}")
    
    return stats

if __name__ == "__main__":
    main()
