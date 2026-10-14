# Начало работы

Mr. Wolf — постоянная проектная организация из временных AI-агентов: координатор держит цель, исполнитель поставляет, воркеры работают в чистых сессиях — а типизированная память, жалобный контур обучения и накопленная библиотека инструментов переносят организацию от сессии к сессии. Локально, в вашем репозитории, CLI + MCP.

## Требования

- **Node >= 22** (Node 22 или 24).
- **macOS или Linux (glibc)**. Alpine/musl не поддержан в v1; Windows — best-effort, не заявлена.
- npm-пакет называется ровно **`mister-wolf`**. Пакет `mr-wolf` в npm — чужой (work-queue библиотека); `npm install mr-wolf` поставит сторонний код и выполнит его install-скрипты. Проверяйте имя буква-в-букву.

## Установка

Установка — бинарь плюс один из двух явных путей:

```bash
npm install -g mister-wolf   # 1) машина: бинарник wolf
```

```bash
# Путь А — память: минимальный набор
cd my-project && wolf init   # скелет .wolf/ + AGENTS.md; без платформенных конфигов и базового сета
wolf bootstrap               # память: стартовое наполнение из документов проекта

# Путь Б — организация OpenCode: полный базовый набор + MCP
cd my-project && wolf init --full --platform opencode
wolf bootstrap
```

- **Путь А — память:** `wolf init` подключает проект минимально — скелет `.wolf/` и `AGENTS.md`. Чистый запуск печатает `memory skeleton: ensured`, `base set: AGENTS.md created` и id init-отчёта; платформенные конфиги и базовый сет не пишутся. Первый запуск не принимает решений за вас: один вопрос интервью в терминале (назначение проекта — Enter, чтобы пропустить), никакого пиннинга модели (`--model` — opt-in, строки модели опускаются — действует платформенный дефолт). Повторный init на живом проекте показывает план и требует подтверждения (`--yes` применяет без вопросов).
- **Путь Б — организация OpenCode:** `wolf init --full --platform opencode` отрисовывает полный базовый набор — 6 рамок агентов, 19 скиллов, 3 команды, 2 плагина, посев playbook-лиц — и пишет `opencode.json` (`mcp.wolf`, `default_agent=mr-wolf`, `subagent_depth=2`). MCP-конфиги платформ — opt-in: `wolf init --platform opencode,claude` (список заменяет текущий набор). После init, записавшего MCP-конфиги, **перезапустите opencode** — сервер и агент по умолчанию подключаются при старте. Claude Code при первом старте попросит approve project-scope MCP-сервер — это штатно.
- `wolf bootstrap` сканирует проект и создаёт черновую стартовую память: proposed-правила и work-thread.

Init считается завершённым, когда `wolf doctor` на проекте сообщает 0 issues; метрика активации и окно приёмки определены в спеке волны (`docs/superpowers/specs/2026-10-10-wave-2.16-init2-unpin-hygiene-design.md`, §11).

## Быстрый try-out

Без глобальной установки:

```bash
npx mister-wolf init
```

Оговорка: npx-режим создаёт скелет памяти `.wolf/`, но **никогда не пишет ни MCP-конфиги, ни базовый сет** — это try-out. Понравилось — `npm install -g mister-wolf` и повторите `wolf init`.

## Первая сессия

Холодный старт — спросить память о состоянии проекта; `call` инъецирует активное состояние организации: правила, уроки, блокеры:

```bash
wolf call        # холодный старт: активные инъекции для сессии (--for <тема> — по теме)
wolf brief       # сводка состояния по последнему scan + памяти
```

Зафиксировать новое знание:

```bash
wolf add --type lesson --title "Вит-тесты падают от кэша" --body "Запускать vitest с флагом --no-cache в CI" --tags "vitest,ci" --confidence medium
```

Полный набор флагов `wolf add`: `--type` (один из 7 типов: rule, lesson, decision, thread, complaint, tool, note), `--title`, `--body`, `--tags` (через запятую), `--confidence` (low|medium|high), `--importance` (0..1), `--set <k=v>` (доп. поля, повторяемый), `--scope` (для rule: project|global; при записи из linked worktree по умолчанию ставится идентичность копии `worktree:w-<12hex>`, legacy-значения `worktree:<имя>` тоже принимаются, `main` — для универсальных фактов), `--facet` (характер записи: howto|pitfall|context|metric|history|legacy|constraint|proposal; обязателен для note; на остальных core-типах разрешён только `proposal` — сигнальный фасет для `wolf propose`), `--created-by`.

Выбор типа — теперь выбор из **семи** (было 26). Старый вопрос «какой из 26 типов это?» превратился в «это один из шести особых? если нет — note + фасет» (см. [Модель памяти](/ru/guide/memory)).

Пять глаголов памяти:

- `add` — записать объект;
- `get` — прочитать один объект по id;
- `edit` — поменять title/body;
- `search` / `list` — найти объекты;
- `archive` — вывести из оборота.

Полный CLI шире памяти — команды организованы в группы (см. [Справочник CLI](/ru/guide/cli/)).

Итог сессии:

```bash
wolf recap       # сводка активной памяти проекта
```

## Где живут данные

Всё — внутри проекта, в `.wolf/`:

```text
.wolf/
├── config.yaml          # конфиг проекта
├── memory/              # объекты памяти (markdown)
│   ├── threads/         # объекты тредов: threads/<tid>/<subdir>/<id>.md
│   ├── shared/          # общие объекты: shared/<subdir>/<id>.md
│   └── briefs/          # брифы
├── cache/               # cache/index.sqlite — FTS-индекс поиска
└── metrics/             # сигнальный лог самообучения
```

Остальные пути создаются лениво по мере надобности: `memory/events.jsonl`, `memory/relations.jsonl`, `memory/quarantine/`, `thinking/`, `tools/`, `backup/<ts>/`. Work-thread хранится как `memory/threads/<tid>/WORK-THREAD.md`.

## Что дальше

- [Организация и консилиум](/ru/guide/organization) — роли L0/L1/L2, цикл работы, консилиум для спорных решений.
- [Модель памяти](/ru/guide/memory) — семь типов, фасеты, статусы thread, чтение данных до 2.13.
- [Справочник CLI](/ru/guide/cli/) — все команды и подкоманды.
- [Интеграция MCP](/ru/guide/mcp) — 8 инструментов (7 + ping) для агентов.
- [Конфигурация](/ru/guide/configuration) — `.wolf/config.yaml`, словарь фасетов, layout хранения.
- [Решение проблем](/ru/guide/troubleshooting) — частые кейсы и лечение.
