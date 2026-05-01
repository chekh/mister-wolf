#!/usr/bin/env python3
"""Build coverage matrix from Scenario Bank."""

import json
import sys
from pathlib import Path
from collections import defaultdict


def load_scenarios(path: str):
    scenarios = []
    with open(path, "r") as f:
        for line in f:
            line = line.strip()
            if line:
                scenarios.append(json.loads(line))
    return scenarios


def build_matrix(scenarios):
    # Domain x Level
    domain_level = defaultdict(lambda: defaultdict(int))
    domain_mode = defaultdict(lambda: defaultdict(int))
    domain_artifact = defaultdict(lambda: defaultdict(int))
    domain_config = defaultdict(lambda: defaultdict(int))
    domain_gov = defaultdict(lambda: defaultdict(int))
    domain_external = defaultdict(int)
    domain_memory = defaultdict(int)

    for s in scenarios:
        d = s["domain"]
        domain_level[d][s["scenario_level"]] += 1
        domain_mode[d][s.get("domain_mode", "unknown")] += 1
        for ap in s.get("artifact_profile", []):
            domain_artifact[d][ap] += 1
        cfg = s.get("configuration_effort", {}).get("level", "unknown")
        domain_config[d][cfg] += 1
        gov = s.get("wolf_configuration", {}).get("autonomy", "unknown")
        domain_gov[d][gov] += 1
        if s.get("capabilities", {}).get("external"):
            domain_external[d] += 1
        if s.get("memory", {}).get("read") or s.get("memory", {}).get("write_candidates"):
            domain_memory[d] += 1

    return {
        "domain_level": dict(domain_level),
        "domain_mode": dict(domain_mode),
        "domain_artifact": dict(domain_artifact),
        "domain_config": dict(domain_config),
        "domain_gov": dict(domain_gov),
        "domain_external": dict(domain_external),
        "domain_memory": dict(domain_memory),
    }


def render_markdown(matrix, scenarios):
    lines = []
    lines.append("# Scenario Bank Coverage Matrix")
    lines.append("")
    lines.append(f"Total scenarios: {len(scenarios)}")
    lines.append("")

    # Domain x Level
    lines.append("## Domain × Scenario Level")
    lines.append("")
    headers = ["Domain", "L1", "L2", "L3", "L4", "L5", "Total"]
    lines.append("| " + " | ".join(headers) + " |")
    lines.append("|" + "|".join(["---" for _ in headers]) + "|")

    domain_level = matrix["domain_level"]
    for domain in sorted(domain_level.keys()):
        counts = domain_level[domain]
        row = [domain]
        total = 0
        for lvl in range(1, 6):
            c = counts.get(lvl, 0)
            row.append(str(c))
            total += c
        row.append(str(total))
        lines.append("| " + " | ".join(row) + " |")
    lines.append("")

    # Domain x Config Mode
    lines.append("## Domain × Configuration Mode")
    lines.append("")
    all_configs = sorted({c for d in matrix["domain_config"].values() for c in d})
    headers = ["Domain"] + all_configs + ["Ext", "Mem"]
    lines.append("| " + " | ".join(headers) + " |")
    lines.append("|" + "|".join(["---" for _ in headers]) + "|")

    for domain in sorted(matrix["domain_config"].keys()):
        counts = matrix["domain_config"][domain]
        row = [domain]
        for cfg in all_configs:
            row.append(str(counts.get(cfg, 0)))
        row.append(str(matrix["domain_external"].get(domain, 0)))
        row.append(str(matrix["domain_memory"].get(domain, 0)))
        lines.append("| " + " | ".join(row) + " |")
    lines.append("")

    # Gaps
    lines.append("## Coverage Gaps")
    lines.append("")
    for domain, levels in sorted(domain_level.items()):
        missing = [f"L{i}" for i in range(1, 6) if levels.get(i, 0) == 0]
        if missing:
            lines.append(f"- **{domain}**: missing {', '.join(missing)}")
    lines.append("")

    return "\n".join(lines)


def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} --scenarios <scenarios.jsonl> [--output <file.md>]")
        sys.exit(1)

    scenarios_path = sys.argv[sys.argv.index("--scenarios") + 1]
    output_path = None
    if "--output" in sys.argv:
        output_path = sys.argv[sys.argv.index("--output") + 1]

    scenarios = load_scenarios(scenarios_path)
    matrix = build_matrix(scenarios)
    md = render_markdown(matrix, scenarios)

    if output_path:
        with open(output_path, "w") as f:
            f.write(md)
        print(f"Coverage matrix written to {output_path}")
    else:
        print(md)


if __name__ == "__main__":
    main()
