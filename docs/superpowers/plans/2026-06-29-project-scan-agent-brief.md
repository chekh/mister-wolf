# План: MVP-B — Project Scan + Agent Brief

**Статус:** черновик плана  
**Связанные документы:**

- [Concept v3](../concept-v3.md)
- [Core Design Spec](../specs/2026-06-29-project-semantic-memory-core-design.md)
- [MVP-A Plan](./2026-06-29-project-semantic-memory-mvp-a.md)

## Цель

Дать Mr. Wolf способность «увидеть» проект: собрать структурированный слепок репозитория (Project Scan) и на его основе сгенерировать краткий бриф для агента (Agent Brief), который агент может прочитать перед началом работы.

## Границы MVP-B

**Входит:**

- Сканирование файловой структуры проекта.
- Извлечение базовой метаинформации: языки, зависимости, entry points, конфиги.
- Сохранение слепка как memory-объекта типа `context`.
- Генерация Agent Brief — markdown-документа с кратким описанием проекта, архитектуры, ключевых файлов и открытых вопросов.
- CLI-команды: `wolf scan` и `wolf brief`.

**Не входит:**

- Полный AST-анализ или семантический поиск по коду.
- Автоматическое извлечение уроков из истории коммитов.
- Интеграция с внешними LLM (только локальные эвристики и шаблоны).
- Интерактивное редактирование brief в CLI.

## Архитектура

```text
src/
├── app/use-cases/
│   ├── scan-project.ts          # оркестрация сканирования
│   ├── generate-agent-brief.ts  # генерация brief из scan + memory
│   └── list-project-scans.ts    # список сохранённых слепков
├── domain/policies/
│   └── project-scan-policy.ts   # правила фильтрации и безопасности
├── domain/services/
│   └── project-scanner.ts       # чистая функция сканирования
├── ports/
│   ├── project-scanner.port.ts  # абстракция сканера
│   └── file-system.port.ts      # чтение файлов и директорий
└── adapters/fs/
    ├── fs-file-system.ts        # реализация file-system.port
    └── heuristic-project-scanner.ts
```

## Новые доменные объекты

### ProjectScan

```typescript
export const projectScanSchema = z.object({
  id: z.string(),
  type: z.literal('context'),
  title: z.string(),
  body: z.string(),
  repository: z.object({
    root: z.string(),
    branch: z.string().optional(),
    commit: z.string().optional(),
  }),
  summary: z.object({
    languages: z.array(z.string()),
    entryPoints: z.array(z.string()),
    configFiles: z.array(z.string()),
    dependencies: z.array(z.string()),
    topLevelDirectories: z.array(z.string()),
    fileCount: z.number(),
    totalLinesOfCode: z.number().optional(),
  }),
  generatedAt: z.string().datetime(),
});
```

Скан сохраняется как markdown-файл в `.wolf/memory/context/` и как событие `scan-created` в `events.jsonl`.

## Правила сканирования

- Игнорировать `node_modules/`, `.git/`, `dist/`, `coverage/`, `.wolf/`, `.codegraph/`, `.worktrees/`.
- Игнорировать файлы по `.gitignore`.
- Не читать бинарные файлы и файлы больше 1 МБ.
- Не сохранять содержимое файлов — только метаданные, пути и ключевые строки.
- Не логировать secrets, API-ключи, `.env`.

## Agent Brief

Формат: markdown-файл `.wolf/brief.md` или memory-объект типа `context` с id `agent-brief-latest`.

Структура:

```markdown
# Agent Brief: {projectName}

## Project Snapshot

- Root: {root}
- Branch: {branch}
- Commit: {commit}
- Generated: {timestamp}

## What This Project Is

{2-3 предложения на основе README и package metadata}

## Technology Stack

{языки, фреймворки, key dependencies}

## Key Files & Entry Points

{список с пояснениями}

## Architecture Notes

{heuristics: ports/adapters pattern, monorepo signals, etc.}

## Active Memory

{3-5 последних memory-объектов}

## Open Questions

{выводимые из memory типа question или пустой раздел}

## Recommended First Steps

{для нового агента}
```

## CLI

```bash
# Просканировать текущий проект и сохранить слепок
node dist/bootstrap/cli.js wolf scan

# Сгенерировать/обновить Agent Brief
node dist/bootstrap/cli.js wolf brief

# Показать последний brief
node dist/bootstrap/cli.js wolf brief --show

# Список сохранённых слепков
node dist/bootstrap/cli.js wolf scan --list
```

## Этапы реализации

### Этап 1 — File-system port и базовый сканер

- Создать `ports/file-system.port.ts`.
- Реализовать `adapters/fs/fs-file-system.ts`.
- Реализовать `domain/services/project-scanner.ts` с обходом директорий.
- Добавить политику фильтрации `domain/policies/project-scan-policy.ts`.
- Написать unit-тесты на сканер.

### Этап 2 — Use case scan-project

- Создать `app/use-cases/scan-project.ts`.
- Сохранять результат как memory-объект `context`.
- Добавить CLI-команду `wolf scan`.
- Написать интеграционный тест.

### Этап 3 — Генерация Agent Brief

- Создать `app/use-cases/generate-agent-brief.ts`.
- Брать последний scan + последние memory-объекты.
- Формировать markdown по шаблону.
- Сохранять как `context/agent-brief-latest.md` и/или `.wolf/brief.md`.
- Добавить CLI-команду `wolf brief`.

### Этап 4 — Интеграция и документация

- Обновить `AGENTS.md`: новые команды и статус MVP-B.
- Обновить `README.md`: добавить `wolf scan` / `wolf brief`.
- Обновить `docs/concept-v3.md`: отметить MVP-B в разработке.
- Написать end-to-end тест workflow.

## Критерии приёмки

- `npm run check` проходит без ошибок.
- `wolf scan` создаёт валидный memory-объект `context`.
- `wolf brief` создаёт markdown-файл с заполненными секциями.
- Игнорируются `node_modules`, `.git`, `.wolf`, бинарные файлы.
- Тесты покрывают сканер, use case и CLI-команду.

## Риски и допущения

- Эвристики stack detection могут быть неточны для нестандартных проектов.
- Большие репозитории (>10k файлов) могут сканироваться медленно; в MVP-B не делаем инкрементальное сканирование.
- Не пытаемся парсить AST; только метаданные файлов.

## Следующая фаза (MVP-C — Case Learning)

- Извлечение уроков из типовых сценариев работы агента.
- Шаблоны memory-объектов для повторяющихся задач.
- Автоматическое предложение memory на основе частоты поиска.
