#!/usr/bin/env python3
"""Extract catalogs from Scenario Cards and Extraction Reports."""

import json
import sys
from pathlib import Path
from collections import defaultdict


def load_jsonl(path: str):
    items = []
    with open(path, "r") as f:
        for line in f:
            line = line.strip()
            if line:
                items.append(json.loads(line))
    return items


def extract_artifacts(scenarios):
    artifact_counts = defaultdict(lambda: defaultdict(int))
    for s in scenarios:
        domain = s["domain"]
        for cat in ["inputs", "intermediate", "outputs", "persisted"]:
            for art in s.get("artifacts", {}).get(cat, []):
                # Handle both old string format and new object format
                if isinstance(art, dict):
                    art_name = art.get("name", "unknown")
                else:
                    art_name = art
                artifact_counts[art_name][domain] += 1
    return artifact_counts


def extract_components(reports):
    counts = defaultdict(int)
    for r in reports:
        for c in r.get("component_findings", {}).get("components_confirmed", []):
            counts[c] += 1
        for c in r.get("component_findings", {}).get("new_components_suggested", []):
            counts[c] += 1
    return counts


def extract_policies(reports):
    counts = defaultdict(int)
    for r in reports:
        for p in r.get("policy_findings", {}).get("required_policies", []):
            counts[p] += 1
        for p in r.get("policy_findings", {}).get("hard_denies", []):
            counts[p] += 1
    return counts


def extract_failure_modes(scenarios):
    counts = defaultdict(int)
    for s in scenarios:
        for fm in s.get("failure_modes", []):
            counts[fm] += 1
    return counts


def extract_config_effort(scenarios):
    counts = defaultdict(int)
    for s in scenarios:
        lvl = s.get("configuration_effort", {}).get("level", "unknown")
        counts[lvl] += 1
    return counts


def render_artifact_catalog(artifacts):
    lines = ["# Artifact Catalog", ""]
    for art in sorted(artifacts.keys()):
        domains = artifacts[art]
        total = sum(domains.values())
        domain_list = ", ".join(f"{d}({c})" for d, c in sorted(domains.items()))
        lines.append(f"- **{art}** — {total} occurrences: {domain_list}")
    lines.append("")
    return "\n".join(lines)


def render_component_demand(components):
    lines = ["# Component Demand Map", ""]
    lines.append("| Component | Confirmations/Suggestions |")
    lines.append("|-----------|---------------------------|")
    for c, count in sorted(components.items(), key=lambda x: -x[1]):
        lines.append(f"| {c} | {count} |")
    lines.append("")
    return "\n".join(lines)


def render_policy_catalog(policies):
    lines = ["# Policy Pattern Catalog", ""]
    for p, count in sorted(policies.items(), key=lambda x: -x[1]):
        lines.append(f"- **{p}** — {count} references")
    lines.append("")
    return "\n".join(lines)


def render_failure_catalog(modes):
    lines = ["# Failure Mode Catalog", ""]
    for m, count in sorted(modes.items(), key=lambda x: -x[1]):
        lines.append(f"- **{m}** — {count} scenarios")
    lines.append("")
    return "\n".join(lines)


def render_config_effort(configs):
    lines = ["# Configuration Effort Map", ""]
    lines.append("| Mode | Scenarios |")
    lines.append("|------|-----------|")
    for mode, count in sorted(configs.items(), key=lambda x: -x[1]):
        lines.append(f"| {mode} | {count} |")
    lines.append("")
    return "\n".join(lines)


def main():
    if "--scenarios" not in sys.argv:
        print(f"Usage: {sys.argv[0]} --scenarios <file.jsonl> --reports <file.jsonl> --output-dir <dir>")
        sys.exit(1)

    scenarios_path = sys.argv[sys.argv.index("--scenarios") + 1]
    reports_path = sys.argv[sys.argv.index("--reports") + 1] if "--reports" in sys.argv else None
    output_dir = Path(sys.argv[sys.argv.index("--output-dir") + 1]) if "--output-dir" in sys.argv else Path(".")

    scenarios = load_jsonl(scenarios_path)
    reports = load_jsonl(reports_path) if reports_path else []

    artifacts = extract_artifacts(scenarios)
    configs = extract_config_effort(scenarios)
    failures = extract_failure_modes(scenarios)

    (output_dir / "artifact-catalog.md").write_text(render_artifact_catalog(artifacts))
    (output_dir / "configuration-effort-map.md").write_text(render_config_effort(configs))
    (output_dir / "failure-mode-catalog.md").write_text(render_failure_catalog(failures))

    if reports:
        components = extract_components(reports)
        policies = extract_policies(reports)
        (output_dir / "component-demand-map.md").write_text(render_component_demand(components))
        (output_dir / "policy-pattern-catalog.md").write_text(render_policy_catalog(policies))

    print(f"Catalogs written to {output_dir}")


if __name__ == "__main__":
    main()
