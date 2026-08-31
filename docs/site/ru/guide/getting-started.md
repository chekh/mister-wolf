# Начало работы

## Требования

- **Node >= 22** (Node 22 или 24).
- **macOS или Linux (glibc)**. Alpine/musl не поддержан в v1; Windows — best-effort, не заявлена.
- npm-пакет называется ровно **`mister-wolf`**. Пакет `mr-wolf` в npm — чужой (work-queue библиотека); `npm install mr-wolf` поставит сторонний код и выполнит его install-скрипты. Проверяйте имя буква-в-букву.

## Установка

Три команды — машина, проект, память:

```bash
npm install -g mister-wolf   # 1) машина: бинарь wolf
cd my-project && wolf init   # 2) проект: скелет .wolf/ + MCP-конфиги платформ
wolf bootstrap               # 3) память: стартовое наполнение из документов проекта
```

- `wolf init` идемпотентен и неинтерактивен: создаёт `.wolf/` и MCP-конфиги платформ (opencode, Claude Code — детект автоматический).
- После `wolf init` **перезапустите агентскую платформу** — MCP-сервер Wolf подключается при старте. Claude Code при первом старте попросит approve project-scope MCP-сервер — это штатно.
- Явно задать платформы: `wolf init --platform opencode,claude` (список заменяет текущий набор).
- `wolf bootstrap` сканирует проект и создаёт черновую стартовую память: proposed-правила, document-ref'ы, work-thread.

## Быстрый try-out

Без глобальной установки:

```bash
npx mister-wolf init
```

Оговорка: npx-режим создаёт память проекта, но **никогда не пишет MCP-конфиги** — это try-out. Понравилось — `npm install -g mister-wolf` и повторите `wolf init`.

## Первая сессия

Холодный старт — спросить память о состоянии проекта:

```bash
wolf call        # активные инъекции: правила, уроки, блокеры (--for <тема> — по теме)
wolf brief       # сводка состояния по последнему scan + памяти
```

Зафиксировать новое знание:

```bash
wolf add --type lesson --title "Вит-тесты падают от кэша" --body "Запускать vitest с флагом --no-cache в CI" --tags "vitest,ci" --confidence medium
```

Полный набор флагов `wolf add`: `--type`, `--title`, `--body`, `--tags` (через запятую), `--confidence` (low|medium|high), `--importance` (0..1), `--set <k=v>` (доп. поля, повторяемый), `--scope` (для rule: project|global), `--created-by`.

Итог сессии:

```bash
wolf recap       # сводка активной памяти: правила, треды, блокеры, вопросы, решения
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

- [Основные концепции](/ru/guide/core-concepts) — типы памяти, lifecycle, governance, инъекции.
- [Справочник CLI](/ru/guide/cli) — все команды и подкоманды.
- [Интеграция MCP](/ru/guide/mcp) — 21 инструмент для агентов.
- [Конфигурация](/ru/guide/configuration) — `.wolf/config.yaml` и свои типы памяти.
- [Решение проблем](/ru/guide/troubleshooting) — частые кейсы и лечение.
