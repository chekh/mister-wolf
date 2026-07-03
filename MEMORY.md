# MEMORY.md — Правила работы с памятью Mr. Wolf

> **Mr. Wolf** — локальный слой семантической памяти проекта для AI coding agents.
> Этот файл описывает, как агенты должны читать, писать и обновлять память.

---

После завершения каждого этапа работы агент обязан обновить проектную документацию: `AGENTS.md`, `README.md`, `MEMORY.md` и любые затронутые документы в `docs/`. Это правило имеет приоритет над спешкой и не может быть пропущено.

---

## 1. Обязанность агента

Каждый агент, работающий с проектом, обязан:

1. **Проверить память перед работой.** Искать по ключевым словам задачи, архитектуры, файлов.
2. **Сохранять значимое.** Уроки, решения, наблюдения, открытые вопросы — если они изменят будущую работу.
3. **Не копировать сырые документы.** Регистрировать их по ссылке, извлекать суть.
4. **Обновлять устаревшее.** При необходимости замещать старые объекты новыми через `supersede`.

---

## 2. Типы объектов памяти

| Тип               | Когда использовать                                   | Пример                                                             |
| ----------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| `lesson`          | Что-то узнали, особенно из ошибки или сюрприза.      | "Vitest не ловит ошибку в `spawnSync`, если не проверить `stderr`" |
| `decision`        | Архитектурное или процессное решение.                | "Не коммитить `.codegraph/` в репозиторий"                         |
| `observation`     | Факт о проекте, который стоит запомнить.             | "Источник правды — markdown-файлы в `.wolf/memory`"                |
| `session-summary` | Итоги агентской сессии.                              | "MVP-A реализован, MVP-B в плане"                                  |
| `open-question`   | Нерешённый вопрос или гипотеза.                      | "Нужна ли инкрементальная индексация?"                             |
| `document`        | Существующий документ, зарегистрированный по ссылке. | Ссылка на `docs/concept-v3.md`                                     |
| `context`         | Скан проекта, снимок состояния.                      | `project-scan-latest`                                              |

---

## 3. Связь документов проекта с памятью

Все текстовые артефакты проекта (документы, заметки, планы, спеки, тест-кейсы) — часть общей памяти. Они остаются на своих местах в файловой системе (например, `docs/`, `specs/`, `plans/`, `notes/`) и регистрируются в памяти **по ссылке**, а не копируются.

### 3.1. Тип `document`

Используй `document` для существующих артефактов, которые важны для агентов:

```bash
node dist/bootstrap/cli.js add --type document --title "Architecture concept v3" --body "Core concept: local-first semantic memory layer. Source: docs/concept-v3.md" --tags architecture,concept
```

Поля объекта:

- `source.kind` = `file`
- `source.path` = путь к документу от корня проекта
- `related.docs` = связанные документы
- `related.files` = связанные файлы кода
- `tags` = ключевые темы для поиска

### 3.2. Что не надо копировать

Не создавай дубликаты содержимого документа в `body`. Сохраняй:

- краткое описание, почему документ важен;
- выжимку ключевых решений или ограничений;
- ссылку на полную версию.

### 3.3. Текущее состояние сканера

Команда `memory scan` (MVP-B) сейчас создаёт объект `context` — технический снимок проекта (файлы, языки, зависимости). Она **ещё не регистрирует** документы как объекты `document` автоматически. Это запланировано на следующую итерацию: сканер будет находить markdown- и текстовые артефакты вне `.wolf/memory` и предлагать зарегистрировать их по ссылке.

Пока агент должен регистрировать важные документы вручную через `memory add --type document`.

---

## 4. Рабочий цикл агента

### Перед началом работы

```bash
node dist/bootstrap/cli.js search "<тема задачи>"
```

Если результаты похожи на устаревшие — перестроить индекс:

```bash
node dist/bootstrap/cli.js rebuild-index
```

### Во время работы

Добавлять объект памяти при:

- принятии архитектурного решения (`decision`);
- обнаружении неочевидного поведения (`lesson`);
- фиксации важного факта (`observation`);
- обнаружении незавершённого вопроса (`open-question`).

```bash
node dist/bootstrap/cli.js add --type lesson --title "..." --body "..."
```

### В конце сессии

Создать `session-summary` автоматически или вручную:

```bash
wolf session wrap-up --title "Результаты сессии: ..." --tags tag1,tag2
```

Сессионные сводки также автоматически создаются после ключевых событий жизненного цикла:
- разрешение блокера (`wolf blocker resolve <id>`);
- терминальный transition (`archived`, `completed`, `accepted`, `resolved`, `obsolete`);
- замещение объекта (`wolf supersede <old-id> <new-id>`);
- создание решения (`wolf decision add ...`);
- создание статьи (`wolf article add ...`).

Если работа касалась структуры проекта или важных решений — обновить `agent brief`:

```bash
wolf brief
```

---

## 5. Правила записи

- **Не пиши всё подряд.** Каждый объект должен отвечать хотя бы на один вопрос:
  - меняет понимание проекта?
  - объясняет решение или ограничение?
  - предотвращает повтор ошибки?
  - связывает документы/код/решения?
- **review_state агента — `proposed` по умолчанию.** Если объект явно подтверждён пользователем — `accepted`.
- **confidence и importance** должны отражать реальную уверенность и значимость.
- **related** заполнять для связи с файлами, документами и решениями.
- **Не копировать документы целиком.** Сохранять ссылку `source.path` и краткую выжимку.

---

## 6. Thread / Info Request / Article Flow

For long-running work that spans sessions:

1. Create a work thread:
   ```bash
   node dist/bootstrap/cli.js thread create --title "..." --goal "..."
   ```

2. When a side question would derail the main session, create an info request:
   ```bash
   node dist/bootstrap/cli.js info-request create --title "..." --thread <thread-id> --question "..." --detour-reason "..." --expected-answer "..."
   ```

3. In another session, answer the request with an article:
   ```bash
   node dist/bootstrap/cli.js article add --title "..." --thread <thread-id> --summary "..." --body "..." --answers <info-request-id>
   ```

4. At session start, read the thread brief:
   ```bash
   node dist/bootstrap/cli.js thread brief <thread-id>
   ```

This keeps the main session clean while preserving reusable project knowledge.

---

## 7. Anti-patterns

- Не делать Mr. Wolf оркестратором — это слой памяти.
- Не считать SQLite источником правды — источником правды являются markdown-файлы.
- Не перестраивать индекс на каждый поиск — только при запросе или массовых изменениях.
- Не копировать пользовательские документы в `.wolf/memory` — только ссылки и извлечённые объекты.

---

## 8. Важные команды

```bash
# Поиск
wolf search "..."

# Добавление
wolf add --type lesson --title "..." --body "..."

# Скан проекта
wolf scan

# Генерация / обновление брифа
wolf brief

# Замещение устаревшего объекта
wolf supersede <old-id> <new-id>

# Перестроить индекс
wolf rebuild-index

# Ручная сводка сессии
wolf session wrap-up --title "..." --tags tag1,tag2
```

---

## 9. Rules

### Rules

Rules are behavioral guardrails. They require explicit user request:

```bash
wolf rule add --title "Never run migrations without rollback plan" \
  --body "Always have a rollback plan reviewed by the team." \
  --scope project \
  --applies-to "src/migrations/*" \
  --trigger "when creating migrations"
```

Agents cannot create rules proactively.

---

## 10. Источники

- Архитектура и концепция: `docs/concept-v3.md`
- Схемы объектов памяти: `src/domain/schemas/memory-object-schema.ts`
- Write protocol: `src/domain/policies/write-protocol.ts`
- Скрипты и команды: `package.json`, `src/adapters/cli/`
