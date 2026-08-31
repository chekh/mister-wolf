# Mr. Wolf

![Mr. Wolf logo](docs/Mr.%20Wolf.png)

> **«I solve problems.»**
>
> **Память — носитель. Процессы — суть. Агенты — форма. Инструменты — руки.**
> И руки накапливаются: каждый полезный скрипт становится постоянным ресурсом проекта.

**Версия концепта:** 3.0 · Статус: opencode-first, Фазы A–B roadmap v3 реализованы.

## Что такое Wolf

Mr. Wolf — local-first слой памяти, процессов, агентов и инструментов для AI-кодинга: единая точка правды проекта, в которую агенты пишут опыт и из которой получают контекст. Это не оркестратор и не ещё один агент, а субстрат под любого агента. Накопление вместо испарения: решения, уроки, инструменты и процессы остаются в проекте после сессии и делают следующую задачу дешевле. Полная картина — в [концепте v3](docs/concept/concept.md).

## Решаемые проблемы

| №   | Проблема                                    | Проявление                                                                          |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------------- |
| П1  | Контекст теряется между сессиями            | агент начинает с нуля                                                               |
| П2  | Опыт не переиспользуется                    | повторные задачи решаются заново: текстовые рассуждения + новые одноразовые скрипты |
| П3  | Документы проекта живут отдельно от агентов | единая точка правды отсутствует                                                     |
| П4  | Накопленное становится шумом                | память растёт, ценность падает                                                      |

## Installation

> [!WARNING]
> Пакет называется **`mister-wolf`** — именно так. Пакет `mr-wolf` в npm **чужой** (work-queue
> библиотека): `npm install mr-wolf` поставит сторонний код и выполнит его install-скрипты.
> Проверяй имя буква-в-букву перед установкой.

Установка — три команды:

```bash
npm install -g mister-wolf   # 1) машина: бинарь wolf (уровень 0)
cd my-project && wolf init   # 2) проект: скелет .wolf/ + MCP-конфиги платформ
wolf bootstrap               # 3) память: стартовое наполнение из документов проекта
```

После `wolf init` **перезапусти агентскую платформу** — MCP-сервер Wolf подключается при старте.
Claude Code при первом старте попросит approve project-scope MCP-сервер — это штатно.

- **Попробовать без установки:** `npx mister-wolf init` — создаст память проекта, но никогда
  не пишет MCP-конфиги (try-out). Понравилось — `npm install -g mister-wolf` и повтори `wolf init`.
- **Платформы v1:** opencode, Claude Code. Детект автоматический; явно:
  `wolf init --platform opencode,claude` (список заменяет текущий набор). Нет маркеров платформы —
  init честно предупредит и подскажет `--platform`.
- **ОС/рантайм:** macOS и Linux (glibc) на Node 22/24. Alpine/musl не поддержан в v1;
  Windows — best-effort, не заявлена. Нативная зависимость better-sqlite3 ставится из пребилдов —
  это поведение зависимости, у mister-wolf нет своих install-скриптов.
- **Если установка падает на better-sqlite3 — две разные ситуации:**
  `prebuild-install ... no prebuilt binary found (musl)` — для вашей платформы пребилды не
  выпускаются (Alpine/musl) — **не поддерживается в v1**, используйте glibc-дистрибутив;
  `gyp ERR!` / `node-gyp` / сборка из исходников упала — пребилда под ваш Node нет или не
  скачалась, поставь node-gyp prerequisites (python3, make, C++ toolchain) и повтори
  `npm rebuild better-sqlite3` — это лечится, в отличие от musl.
- **Dev-путь (из клонированного репо):** `npm install && npm run build`, затем
  `alias wolf="node dist/bootstrap/cli.js"`. При одновременно установленном глобальном
  `mister-wolf` помни о PATH-shadowing: какой `wolf` запустится — определяется порядком каталогов
  в PATH. В npm есть и чужой пакет `wolf` (Wolfram CLI) — глобальная установка обоих конфликтует
  за имя бинаря, разрешается тем же порядком PATH.

Подключение агента — одна команда: `wolf scaffold agent <name>` создаёт тонкую рамку в `.opencode/agents/<name>.md`, playbook-объект в памяти и relation между ними. Доставку playbook'а в сессию выполняет плагин `.opencode/plugins/wolf-router.ts` — см. [Интеграции](#интеграции).

`bootstrap` завершается вызовом Стюарда для свёртки черновиков стартовой памяти — протокол: [docs/guide/steward-bootstrap.md](docs/guide/steward-bootstrap.md).

## Versioning

- Единственный источник истины версии — `package.json`; версия меняется только командой `npm version X.Y.Z` (semver, вручную).
- Тег `v*` — релиз-триггер: CI прогоняет `check`+`e2e` и публикует пакет (trusted publishing, provenance).
- История изменений — [CHANGELOG.md](CHANGELOG.md); запись в него при релизе обязательна.

## Архитектура

Четыре слоя ([концепт §2](docs/concept/concept.md)):

| Слой            | Содержание                                                                                        | Состояние                                |
| --------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Память**      | Единая точка правды: решения, уроки, правила, документы, процессы, инструменты; supersede-цепочки | зрел: CLI + MCP, таксономия, FTS-поиск   |
| **Процессы**    | Протоколы работы: bootstrap, cold-start, complain-канал, checkpoint/wrap-up, обработка знаний     | частично в продукте, частично в практике |
| **Агенты**      | Тонкие рамки (персона) + playbook'и (методика в памяти); доставка в платформы                     | доказано PoC #1–4                        |
| **Инструменты** | CLI и MCP — руки, приводящие память и процессы в действие                                         | зрел                                     |

Слои — не стопка, а **петля**: агенты исполняют процессы; процессы читают и пишут память; инструменты приводят всё в действие; результаты возвращаются в память как новые знания и инструменты.

Подробно: [docs/guide/architecture.md](docs/guide/architecture.md) · [концепт v3](docs/concept/concept.md).

## Возможности

### Память

Всё есть память: 25 типов объектов (24 активных + 1 deprecated), версии, связи, атрибуция.

```bash
wolf add --type lesson --title "..." --body "..." --tags "vitest,ci" --confidence medium
wolf get mem_001 --latest          # до актуального в supersede-цепочке
wolf list --type decision --stale  # не обновлялись 30 дней
wolf search "supersede" --type rule --hide-superseded
wolf supersede mem_001 mem_002     # mem_001 заменён mem_002
wolf transition mem_002 accepted   # смена статуса жизненного цикла
wolf relation add mem_001 supports mem_002
```

- `wolf taxonomy show|sync` — эффективная таксономия и её регенерация из кода.
- `wolf validate [--fix]` — целостность хранилища, карантин битых объектов.
- FTS-поиск по SQLite-индексу (`wolf rebuild-index` — перестройка).

### Процессы

Протоколы работы агентов как продукт.

```bash
wolf bootstrap                                    # подключение к проекту: скан → черновики правил, document-ref'ы, work-thread
wolf call                                         # cold-start: активные injections для сессии (--for <topic> — по теме)
wolf brief                                        # сводка состояния по последнему scan + памяти
wolf complain --about skill:apprentice --text "…" # жалоба на поведение агента → hot-signal Стюарду
wolf session checkpoint --thread <id>             # точка свёртки прогресса
wolf session wrap-up --title "…"                  # session-summary завершения
wolf solve "битые relation-ссылки" --save         # solve pack для проблемы памяти
wolf think start --goal "…"                       # последовательность: goal → мысли → решение
```

### Агенты

- `wolf scaffold agent|skill|command <name>` — рамка платформы + playbook в памяти + relation одной командой; `--persona` и `--model` для агентов, `--from-playbook <id>` — переиспользовать существующий playbook.
- Доставка playbook'ов — плагин-инжекция в system-промпт (слой доставки №1): `.opencode/plugins/wolf-router.ts`.
- **Стюард** — фоновый агент контура с лицами: **Наставник** (методики, по жалобам), **Библиотекарь** (инструменты), **Архивариус** (знания). Новое лицо = новый playbook, не новый агент.

### Инструменты

Tool-библиотекарь: удачный скрипт кристаллизуется в постоянный ресурс (search-before-write).

```bash
wolf tool register scripts/check.sh --name check --contract-in "нет" --contract-out "exit 0/1"
wolf tool list --status active
wolf tool use check          # +1 к usage_count, напоминание контракта
wolf tool stats              # счётчики + экономика переиспользования из run-log
wolf tool expose check       # (пере)генерировать .opencode/skills/check/SKILL.md
wolf tool deprecate check --reason "заменён линтером"
wolf tool revive check       # deprecated → active
```

### Самообучение

Контур Ф20–26 поверх сигнального лога (`.wolf/metrics/session-metrics.jsonl`).

```bash
wolf learn digest                    # активные паттерны (N≥3) + post-audit draft'ы
wolf learn propose <pattern-key>     # draft урока/правила из паттерна (без LLM)
wolf learn validate <draft-id>       # Sandbox Replay Holdout на реальных событиях
wolf learn activate <draft-id>       # активация (гейт: holdout pass или --human-approved)
wolf learn gate                      # STOP-гейт: pressure-сценарии доставки + read-only probe
wolf learn decay --dry-run           # чистка знаний по пробегу (сессии)
wolf learn status                    # здоровье сигнального лога: объёмы, метрики, drift
```

### Эффективность

- `wolf effectiveness` — панель: rules holdout, tool economy, доставка, шум, роутинг (агрегация, без LLM).
- `wolf insights [--type lessons|decisions|technical_debt|…] [--topic <t>]` — эвристический анализ памяти (Level 1, без LLM).
- Бенчмарки: `scripts/bench/` (b1-repeat-debug, b2-bootstrap, b3-retrospective).

## Демо

Самопроверяющиеся сценарии: `bash scripts/demo/scenario-N.sh`.

| №   | Сценарий                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------ |
| 1   | Подключение Wolf к новому проекту (self-checking, PASS/FAIL-точки)                                     |
| 2   | Жизнь знания: рождение, устаревание (supersede), чтение актуального                                    |
| 3   | Новый агент = одна команда (scaffold: playbook + рамка + связь)                                        |
| 4   | Жалоба владельца — hot-signal контура самообучения                                                     |
| 5   | Скрипт становится ресурсом — tool-цикл Библиотекаря                                                    |
| 6   | Самообучение: 3 ошибки → паттерн → draft → Sandbox Replay → активация                                  |
| 7   | Гигиена контура: learn status, целостность памяти, decay по пробегу                                    |
| 8   | wolf run: модель из routing-объекта памяти, расход в run-log (**один реальный LLM-вызов, ~30–60 сек**) |

## Интеграции

### MCP-сервер

`wolf mcp` — запуск MCP-сервера (stdio): вся память и процессы доступны агентам любой MCP-совместимой платформы. Список тулов и конфигурация — в [спеке MCP-интеграции](docs/superpowers/specs/2026-07-01-mcp-server-integration-design.md).

### opencode-плагины

- `.opencode/plugins/wolf-router.ts` — инжекция актуального playbook в system-промпт (слой доставки №1); `wolf search` — fallback.
- `.opencode/plugins/wolf-session-start.js` — стартовый контекст сессии.
- Рамки агентов — `.opencode/agents/` (создаются `wolf scaffold`).

### WOLF_ACTOR

Атрибуция мутаций: каждый объект памяти имеет автора. Приоритет: флаг `--created-by <actor>` > env `WOLF_ACTOR` > fallback (`user:cli` для CLI-команд, `steward:<лицо>` для контура Стюарда).

## Ограничения и roadmap

- **opencode-first**: мультиплатформенность — архитектурный принцип (концепт §6.6), но нити других платформ — после зрелости Уровней 1–2.
- **Что не делает Wolf** (концепт §10): редактирование кода как проектная функция · IDE-интеграция · веб-интерфейс · распределённая работа · оркестрация общего назначения (только протоколы, доказанные практикой).
- План: [roadmap-v3](docs/superpowers/plans/roadmap-v3.md) — фазы A–E.

## Документация

- [Концепция v3](docs/concept/concept.md) — четыре слоя, конвейер активации, Стюард, УТП
- [Roadmap v3](docs/superpowers/plans/roadmap-v3.md) — фазы A–E, статус и основания
- [User guide](docs/guide/user-guide.md) — базовые команды и workflow
- [CLI reference](docs/reference/cli.md) — полный справочник команд
- [Architecture](docs/guide/architecture.md) — устройство системы
- [Индекс документации](docs/README.md)

## Разработка

TypeScript (strict, ESM), Node 22, vitest. Верификация: `npm run check` (format + lint + test + build); e2e-набор: `npm run e2e`. Архитектура — ports & adapters: `src/domain` · `src/app/use-cases` · `src/adapters` · `src/ports`.
