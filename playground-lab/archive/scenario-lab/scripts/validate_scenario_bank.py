#!/usr/bin/env python3
"""Validate a Scenario Bank JSONL file."""

import json
import sys
from pathlib import Path

REQUIRED_FIELDS = [
    "id", "title", "domain", "subdomain", "scenario_level", "domain_mode",
    "methodology", "artifact_profile", "interaction_surface", "user_input",
    "user_intent", "wolf_configuration", "expected_visible_behavior",
    "internal_behavior", "artifacts", "capabilities", "policies", "gates",
    "memory", "failure_modes", "analysis_tags", "configuration_effort",
    "new_capabilities_introduced", "concept_questions"
]

VALID_DOMAINS = {
    "software_engineering", "architecture", "office_assistant", "legal_ops",
    "concierge", "research", "product_management", "sales_crm", "finance_ops",
    "hr_recruiting", "education", "security_compliance", "data_analysis",
    "content_marketing", "personal_knowledge"
}

VALID_LEVELS = {1, 2, 3, 4, 5}

CONFIG_MODE_ORDER = {
    "zero_config": 0,
    "generated_config": 1,
    "explicit_config": 2,
    "domain_pack": 3,
    "rule_routing": 3,
    "dynamic_persona": 3,
    "llm_assisted_selection": 3,
    "memory_adapted": 3,
    "user_clarified": 3,
    "nested_autoconfig": 4,
    "custom_workflow": 4,
    "custom_plugin": 5,
}

INCOMPATIBLE_WITH_ZERO_CONFIG = {"explicit_config", "domain_pack", "custom_plugin"}


def load_scenarios(path: str):
    scenarios = []
    with open(path, "r") as f:
        for i, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                scenarios.append(json.loads(line))
            except json.JSONDecodeError as e:
                print(f"ERROR line {i}: invalid JSON - {e}")
                sys.exit(1)
    return scenarios


def validate(scenarios):
    errors = []
    warnings = []
    ids = set()

    for i, s in enumerate(scenarios, 1):
        # Required fields
        for field in REQUIRED_FIELDS:
            if field not in s:
                errors.append(f"[{i}] id={s.get('id','?')} missing field: {field}")

        sid = s.get("id")
        if sid:
            if sid in ids:
                errors.append(f"[{i}] Duplicate id: {sid}")
            ids.add(sid)

        # Domain
        domain = s.get("domain")
        if domain and domain not in VALID_DOMAINS:
            errors.append(f"[{i}] id={sid} invalid domain: {domain}")

        # Level
        level = s.get("scenario_level")
        if level is not None and level not in VALID_LEVELS:
            errors.append(f"[{i}] id={sid} invalid level: {level}")

        # Output artifacts
        artifacts = s.get("artifacts", {})
        outputs = artifacts.get("outputs", [])
        if not outputs:
            warnings.append(f"[{i}] id={sid} has no output artifacts")

        # Failure modes
        if not s.get("failure_modes"):
            warnings.append(f"[{i}] id={sid} has no failure_modes")

        # Config mode
        cfg = s.get("configuration_effort", {})
        if not cfg.get("level"):
            warnings.append(f"[{i}] id={sid} missing configuration_effort.level")

        # NEW: Configuration mode incompatibility
        modes = s.get("wolf_configuration", {}).get("mode", [])
        if "zero_config" in modes:
            incompatible = [m for m in modes if m in INCOMPATIBLE_WITH_ZERO_CONFIG]
            if incompatible:
                errors.append(
                    f"[{i}] id={sid} zero_config incompatible with: {incompatible}"
                )

        # NEW: Configuration mode ordering (skip if zero_config present — it's special)
        if "zero_config" not in modes:
            mode_orders = [CONFIG_MODE_ORDER.get(m) for m in modes if m in CONFIG_MODE_ORDER]
            if mode_orders and max(mode_orders) - min(mode_orders) > 2:
                errors.append(
                    f"[{i}] id={sid} config mode span too large: {modes}"
                )

        # NEW: Gate structure
        gates = s.get("gates", [])
        if gates:
            for g in gates:
                if isinstance(g, dict):
                    if not g.get("severity"):
                        warnings.append(
                            f"[{i}] id={sid} gate '{g.get('gate_name','?')}' missing severity, defaulting to 'block'"
                        )
                    if not g.get("rationale"):
                        warnings.append(
                            f"[{i}] id={sid} gate '{g.get('gate_name','?')}' missing rationale"
                        )
                elif isinstance(g, str):
                    # Legacy string gate — warn about migration
                    warnings.append(
                        f"[{i}] id={sid} gate '{g}' is string format; migrate to object with severity/rationale"
                    )

        # NEW: Observability requirements for L3+ (required only for new-format scenarios)
        if level and level >= 3 and s.get("execution_result"):
            obs = s.get("observability_requirements")
            if not obs:
                errors.append(
                    f"[{i}] id={sid} Level {level} missing observability_requirements"
                )

        # NEW: External capabilities taxonomy
        external_caps = s.get("capabilities", {}).get("external", [])
        for cap in external_caps:
            if isinstance(cap, dict):
                missing_fields = []
                if not cap.get("type"):
                    missing_fields.append("type")
                if not cap.get("trust_level"):
                    missing_fields.append("trust_level")
                if not cap.get("fallback_action"):
                    missing_fields.append("fallback_action")
                if missing_fields:
                    errors.append(
                        f"[{i}] id={sid} external capability '{cap.get('name','?')}' missing: {missing_fields}"
                    )
            elif isinstance(cap, str):
                # Legacy string format — warn about migration
                warnings.append(
                    f"[{i}] id={sid} external capability '{cap}' is string format; migrate to object with type/trust_level/fallback_action"
                )

        # NEW: execution_result recommended for L2+
        if level and level >= 2:
            if not s.get("execution_result"):
                warnings.append(
                    f"[{i}] id={sid} Level {level} missing execution_result (recommended)"
                )

    return errors, warnings


def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <scenarios.jsonl>")
        sys.exit(1)

    path = sys.argv[1]
    scenarios = load_scenarios(path)
    print(f"Loaded {len(scenarios)} scenarios")

    errors, warnings = validate(scenarios)

    if warnings:
        print(f"\nWarnings ({len(warnings)}):")
        for w in warnings:
            print(f"  - {w}")

    if errors:
        print(f"\nErrors ({len(errors)}):")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)

    print("\nValidation passed.")


if __name__ == "__main__":
    main()
