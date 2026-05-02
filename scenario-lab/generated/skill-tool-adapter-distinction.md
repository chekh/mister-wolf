# Skill / Tool / Adapter / Workflow / Agent / Domain Pack Distinction

## Definitions

### Tool
- Low-level capability: file read/write, shell exec, HTTP request, MCP invoke.
- Stateless (mostly).
- Trust level: `native` → `wrapped` → `mcp` → `direct_api`.
- Examples: `context.read`, `file.write`, `shell.exec`, `mcp.invoke`, `http.request`.
- Evidence: 80 scenarios use tools; `context.read` is most common (60+).

### Skill
- Domain-specific logic: combines tools + prompts + validation.
- Can be native (built-in) or imported (OpenClaw, OpenCode, external).
- Examples: `software.project_review`, `legal.contract_analysis`, `software.tdd`.
- Evidence: 60+ scenarios reference skills; imported skills marked as `untrusted` until policy applied.

### Workflow
- Multi-step orchestration with conditional logic, gates, artifact passing.
- Defined declaratively (YAML), not as code.
- Examples: full spec-first flow, TDD workflow, release readiness workflow.
- Evidence: L4/L5 scenarios (30 of 80) imply workflow behavior; 5 scenarios explicitly use `custom_workflow` config mode.

### Agent
- Persona + skill set + policy scope.
- Selected by ModelRouter based on scenario.
- Examples: `software_architect`, `security_reviewer`, `qa_engineer`.
- Evidence: 70+ scenarios specify agents; 15+ distinct agent personas.

### Adapter
- Translation layer between Wolf and external system.
- Handles auth, schema mapping, error translation.
- Examples: `salesforce_adapter`, `vuln_scanner_adapter`.
- Evidence: appears in 3 extraction reports; marked as `required_adapters`.

### Wrapper
- Policy-enforcing decorator around external capability.
- Adds trust check, logging, fallback.
- Examples: `github_mcp_wrapper`, `mcp_wrapper`.
- Evidence: appears in 5 extraction reports; `MCPWrapper` confirmed for L5.

### Domain Pack
- Bundled configuration: skills + tools + artifacts + policies + personas + workflows for a domain.
- Loaded on demand based on scenario routing.
- Examples: `software-engineering`, `legal-ops`, `security-compliance`.
- Evidence: 60+ scenarios use `domain_pack` mode; 12 distinct domain packs referenced.

## Trust and Policy Overlay

Wolf applies policy overlay to all external capabilities:

1. **Capability discovery** — what does it do?
2. **Trust scoring** — native > wrapped > MCP > imported_skill > direct_api.
3. **Policy check** — does current scenario allow this action?
4. **Gate application** — block/notify/silent based on risk.
5. **Fallback activation** — if capability unavailable, use fallback_action.
6. **Audit logging** — trace every external invocation.

Evidence: all L5 scenarios with `external` capabilities specify `trust_level: untrusted` and `fallback_action`.
