# Maintaining this documentation

The website is the single current user guide. Its source lives in `docs/site/`; the repository's `docs/README.md` points here and indexes engineering documents. README introduces the product and links to the website. Requirements, designs, research and the roadmap stay in Git as project memory.

## Ownership and timing

The owner of a change updates the affected documentation in the same task. The integrating reviewer checks coverage and examples. Release preparation reviews the core pages even when the release adds no new command. Revisit the explanation when the product's scope, responsibility model, onboarding, feedback or user controls change.

Keep the opening useful: what Wolf does, how it holds the goal, how processes connect skills/tools/rules/memory, how the Steward changes methods, and how a person works with it. First use should not require learning taxonomy or internal report contracts. Explain measured effects where helpful without making benchmarks the entry requirement.

## Coverage checklist

| Change                       | Review                                                                    |
| ---------------------------- | ------------------------------------------------------------------------- |
| Product scope or positioning | README pair, overview, capabilities, homepage and package description     |
| Roles or methods             | Organization, base set, working-with-wolf, affected frames and skills     |
| Memory or document handling  | Memory, bootstrap, configuration and relevant CLI pages                   |
| Learning and mutation        | Feedback, delivery, owner control examples and current limitations        |
| Onboarding or updates        | Getting started, bootstrap, upgrade, troubleshooting and homepage install |
| Command or MCP surface       | Relevant topic, CLI generator, MCP catalog and examples                   |

Compare descriptions with current sources and applicable checks. Do not infer behavior from a changelog entry alone. Label an illustrative dialogue as an example, not a recorded run. Avoid guarantees of clean context, automatic crash recovery or positive learning unless the actual mechanism supports the statement.

## Validate

```bash
npm run docs:check
```

This builds the CLI, regenerates the command reference and changelog mirrors, builds the website, checks local links/anchors and checks EN/RU guide-page parity. It does not certify editorial accuracy or external-service availability. Run project checks and relevant examples too; inspect desktop/mobile and both languages for visual changes.

Run the preview with `npm run docs:preview`. The hosted base path is `/mister-wolf/`. Update source files, not `.vitepress/dist/`. Keep validation results in the existing task test plan.

The PR CI validates the website before integration. Publishing the website remains the existing deployment workflow after authorized integration into `main`; passing a local build does not mean it is published.
