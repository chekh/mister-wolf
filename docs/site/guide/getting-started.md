# Start with your first useful task

The full organization is currently OpenCode-first. This path connects Wolf to an existing project, introduces it to the documents, and starts a task in ordinary language. Memory-only use is an additional option below.

## Requirements

- Node.js 22 or 24, macOS or Linux with glibc.
- OpenCode installed and a working model/provider configured for the full organization.
- Alpine/musl is unsupported in this delivery; Windows is best-effort.

## Install and connect

Run in the project you want Wolf to work on — `init` requires a project marker (`package.json`, `.git`, `pyproject.toml`, `go.mod`, `Cargo.toml` or `README.md`), and an empty directory is refused:

```bash
npm install -g mister-wolf
cd my-project
wolf init --full --platform opencode
wolf bootstrap
```

Use exactly **`mister-wolf`**. `mr-wolf` is a different npm package.

`init --full` writes the supplied agents, skills and commands, and configures the Wolf MCP server in `opencode.json`; `mr-wolf` becomes the default agent. Since 3.0.0 the standard set has no mandatory plugins — the two old Wolf plugins are reserved, not installed. Existing files and local changes follow the [initialization/update policy](/guide/upgrade); an existing project may require decisions.

**Restart OpenCode** so the project configuration is loaded. Without an explicit model override, platform defaults apply; initialization does not choose a new provider for you.

## Introduce the project

`bootstrap` scans files and registers document references, proposes initial conventions and opens an onboarding thread. It prepares information; it does not start an LLM or independently complete onboarding.

In OpenCode, ask Wolf:

> Review the bootstrap findings with me. Confirm the project purpose, authoritative documents and required checks; ask about material gaps and help finish onboarding.

You should receive an understandable summary of the conventions, their corrections and remaining questions. You do not need to learn memory types. [Bootstrap](/guide/bootstrap) explains the review and repeated runs.

## Give the first assignment

For example:

> Prepare a concise onboarding guide for a newcomer. Use the existing project documents, include setup and a first useful task, and verify commands where safe. Ask me if a missing decision changes the result.

This is an illustrative request, not a recorded run. The supplied methods direct Wolf to clarify intent and acceptance criteria, have mr-wolf do the work itself or hire bounded wolf-* executors, integrate findings and present the result. You should see the guide or its file location, the verification performed, limitations and any decision still needed from you. Actual behavior depends on the model, harness and project permissions.

If the assignment continues later, ask Wolf to preserve significant state and then name the task in the next session. See [Working with Wolf](/guide/working-with-wolf).

## If something is missing

- No `mr-wolf` agent or MCP tools: check you used `--full --platform opencode`, then restart OpenCode. A bare `wolf init` is intentionally smaller.
- `Not a project root …`: `init` ran outside a project directory — `cd` into the project (see [Troubleshooting](/guide/troubleshooting)).
- Provider/model errors: verify your OpenCode provider setup; Wolf does not supply model credentials.
- Integrity errors: run `wolf doctor`, read the specific issue and use [Troubleshooting](/guide/troubleshooting). A clean doctor result checks integrity, not completion of a task.
- An unresolved project convention: discuss it with Wolf before treating a proposed rule as active.

## Optional: memory without the full organization

```bash
npm install -g mister-wolf
cd my-project
wolf init
wolf bootstrap
```

Bare `init` creates the memory skeleton and the `AGENTS.md` onboarding entry; it does not render the full agent set or write platform MCP configuration. Connect a compatible assistant using [MCP](/guide/mcp), or inspect the state with CLI commands such as `wolf brief` and `wolf search`.

`npx mister-wolf init` is a try-out that writes the memory skeleton without the full set or MCP configs. Optional platform configs (`--platform opencode,claude`) do not establish that the complete organization works identically on both hosts. See [Capabilities](/guide/capabilities).

## Update when needed

```bash
wolf upgrade --check
wolf upgrade
```

Review local differences and protection before resolving an update. [Upgrade guide](/guide/upgrade) covers the full workflow. Memory internals are available in [Memory Model](/guide/memory) when you need to inspect or customize them.
