# Documentation

**The website is the canonical user documentation:**

- [English](https://chekh.github.io/mister-wolf/guide/overview)
- [Русский](https://chekh.github.io/mister-wolf/ru/guide/overview)
- [First task](https://chekh.github.io/mister-wolf/guide/getting-started)
- [Working with Wolf](https://chekh.github.io/mister-wolf/guide/working-with-wolf)
- [Steward and learning](https://chekh.github.io/mister-wolf/guide/feedback)
- [CLI reference](https://chekh.github.io/mister-wolf/guide/cli/)

Its source is [`site/`](site/). The former `docs/guide/` has been consolidated into the website; previous text remains in Git history. Do not create a parallel user guide in this directory.

## Engineering documents

These remain project-owned memory and development sources, rather than a second user manual:

- [Concept](concept/concept.md), [maturity](concept/maturity.md), [evidence](concept/evidence.md), [coverage](concept/coverage.md): design rationale, implementation boundaries and research history.
- [Active roadmap](dev/roadmap/roadmap-v4.md) and [ledger](dev/roadmap/roadmap-v4-ledger.md).
- [Development documents](dev/INDEX.md): requirements, design, plans and test plans by task.
- [Historical specifications](specs/README.md) and [plans](plans/README.md).
- [Analytics notes](analytics/): internal machine analytics records (opencode session token statistics).
- **opencode-cost** — аналитика стоимости сессий OpenCode: деревья задач, токены по ролям и агентам, top-N задач. Запуск: `npm run opencode-cost -- --days 7`; выходы: `docs/analytics/<дата>-opencode-cost.md` и `.wolf/analytics/<штамп>-opencode-cost.json`; живая база `~/.local/share/opencode/opencode.db` читается только в режиме read-only. Ручной smoke на живой базе: суммы метрик по сессиям = агрегату задачи = totals.
- [Generated CLI source reference](reference/cli.md): generated from the CLI; the website presents the user reference.

See [maintaining documentation](https://chekh.github.io/mister-wolf/guide/documentation) and [Contributing](../CONTRIBUTING.md) for ownership and validation.
