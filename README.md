# Mr. Wolf

![Mr. Wolf logo](docs/Mr.%20Wolf.png)

> **«I solve problems.»**
>
> **Память — носитель. Процессы — суть. Агенты — форма. Инструменты — руки.**
> И руки накапливаются: каждый полезный скрипт становится постоянным ресурсом проекта.

**Версия концепта:** 3.0 · Статус: opencode-first, Фаза A–B roadmap v3 реализована.

## Что такое Wolf

Mr. Wolf — local-first слой памяти и процессов для AI-агентов: единая точка правды проекта, в которую агенты пишут опыт и из которой получают контекст. Это не оркестратор и не ещё один агент, а субстрат: тонкие рамки агентов (персона) + playbook'и методик в памяти + инструменты CLI/MCP, приводящие всё в действие. Накопление вместо испарения: решения, уроки, инструменты и процессы остаются в проекте после сессии и делают следующую задачу дешевле.

## Быстрый старт

```bash
npm install && npm run build
alias wolf="node dist/bootstrap/cli.js"

wolf init          # скелет памяти: .wolf/, индекс, таксономия
wolf bootstrap     # стартовое наполнение: document-ref'ы, черновики правил (proposed), work-thread + бриф
wolf add --type decision --title "Решение" --body "Что и почему"
wolf brief         # сводка состояния проекта для агента/владельца
wolf call          # активные injections и правила для сессии
```

Bootstrap завершается вызовом Стюарда (рамка `.opencode/agents/steward.md`) для свёртки черновиков — протокол: [docs/guide/steward-bootstrap.md](docs/guide/steward-bootstrap.md).

## Минимальный словарь CLI

- **Память:** `add` · `get` (`--latest` — до актуального в supersede-цепочке) · `list` · `search` · `supersede` · `relation` · `transition`
- **Сессия и состояние:** `brief` · `call` · `recap` · `scan` · `insights` · `solve` · `think` · `council`
- **Процессы как продукт:** `scaffold agent|skill|command` (рамка + playbook + relation одной командой) · `complain` (жалоба на поведение агента → расследует Стюард → новая версия playbook) · `run` (запуск opencode-агента с моделью из routing-объекта, лог weighted-цены в `.wolf/run-log.jsonl`) · `bootstrap`
- Полный список: `wolf --help`; базовый workflow: [docs/guide/user-guide.md](docs/guide/user-guide.md)

## Агенты и платформы

Статус платформ: **opencode-first** (фазы A–D roadmap v3); мультиплатформенность — архитектурный принцип (концепт §6.6), нити других платформ — после зрелости Уровней 1–2.

Схема «канон/экспозиция» (концепт §3.3): методика живёт в памяти как объект `playbook` (steps, owner_skill, version), рамка в `.opencode/agents/<name>.md` — тонкая персона с маркером `agent-id` в теле. Доставка — плагин `.opencode/plugins/wolf-router.ts`: инжекция актуального playbook в system-промпт (слой доставки №1, спека самообучения §13); `wolf search` — fallback. Создание рамок — `wolf scaffold`, эволюция методик — `wolf complain` + Стюард.

## Документация

- [Концепция v3](docs/concept/concept.md) — четыре слоя, конвейер активации, Стюард, УТП
- [Roadmap v3](docs/superpowers/plans/roadmap-v3.md) — фазы A–E, статус и основания
- [Спека самообучения (Ф20–26)](docs/superpowers/specs/2026-08-26-self-learning-design.md)
- Гайды: [user-guide](docs/guide/user-guide.md) · [протокол жалоб](docs/guide/complaint-protocol.md) · [протокол Стюарда bootstrap](docs/guide/steward-bootstrap.md)
- [Индекс документации](docs/README.md)

## Разработка

TypeScript (strict, ESM), Node 22, vitest. Верификация: `npm run check` (format + lint + test + build); e2e-набор: `npm run e2e`. Архитектура — ports & adapters: `src/domain` · `src/app/use-cases` · `src/adapters` · `src/ports`.
