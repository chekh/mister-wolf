# Руководство пользователя Mr. Wolf

**Версия:** соответствует Phase 2 (work-thread, info-request, article, decision, blocker)  
**Статус:** активно развивается

---

## 1. Что такое Mr. Wolf

Mr. Wolf — это локальная память проекта для работы с AI-ассистентами. Он не заменяет агентов, OpenCode, документацию или тесты. Он сохраняет важные артефакты проекта — решения, вопросы, ответы, правила — так, чтобы их можно было найти и использовать в следующей сессии.

Вся память хранится в файлах Markdown с YAML frontmatter внутри `.wolf/memory/`. Это значит, что вы можете читать и редактировать её обычными инструментами.

---

## 2. Основные сущности Phase 2

### 2.1. Work Thread (Рабочий тред)

**Что это:** долгоживущая линия работы, которая объединяет несколько сессий.

**Когда создавать:**

- Когда вы начинаете работу, которая займёт больше одной сессии.
- Когда хотите, чтобы новая сессия могла быстро войти в контекст.
- Когда появляются связанные вопросы, статьи и решения.

**Пример:**

```bash
node dist/bootstrap/cli.js thread create \
  --title "Переход на schema-driven memory" \
  --goal "Сделать Mr. Wolf конфигурируемым движком памяти" \
  --current-state "Завершена Phase 1" \
  --next-steps "Phase 2: decisions и blockers"
```

**Что хранится в треде:**

- `title` — название
- `goal` — цель
- `current_state` — текущее состояние (обновляется вручную)
- `next_steps` — следующие шаги
- `status` — `active`, `paused`, `completed`, `archived`

### 2.2. Info Request (Запрос на информацию)

**Что это:** отложенный побочный вопрос, ответ на который должен стать частью проектной памяти.

**Когда создавать:**

- Вопрос требует большого отступления от основной темы сессии.
- Ответ будет полезен не только сейчас, но и в будущем.
- Вы можете дать предварительный ответ, но нужна глубокая проверка.

**Не создавайте info-request:**

- для обычных TODO;
- чтобы избежать размышления;
- для вопросов, которые можно ответить прямо сейчас.

**Пример:**

```bash
node dist/bootstrap/cli.js info-request create \
  --title "Где хранить relations?" \
  --thread <thread-id> \
  --question "Должны ли связи между артефактами храниться в relations.jsonl или в SQLite?" \
  --detour-reason "Сравнение хранилищ отвлечёт от проектирования поведения" \
  --expected-answer "Сравнение вариантов с рекомендацией" \
  --preliminary-answer "Скорее всего, relations.jsonl для MVP."
```

**Обязательные поля:**

- `title` — название запроса
- `question` — вопрос
- `detour_reason` — почему откладываем
- `expected_answer` — какой ответ ожидается
- `thread` — к какому треду относится

### 2.3. Article (Статья)

**Что это:** переиспользуемый ответ на info-request или самостоятельная заметка о проекте.

**Когда создавать:**

- Вы подготовили ответ на info-request.
- Нужно зафиксировать объяснение, которое будут читать другие сессии.
- Хотите собрать знание в структурированном виде.

**Пример:**

```bash
node dist/bootstrap/cli.js article add \
  --title "Хранение relations в Mr. Wolf" \
  --thread <thread-id> \
  --summary "Используем relations.jsonl как canonical source, SQLite индексирует связи." \
  --body '## Ответ\n\nrelations.jsonl — canonical source of truth для связей. SQLite перестраивается при необходимости.' \
  --answers <info-request-id>
```

**Рекомендуемые разделы тела статьи:**

- Summary
- Context
- Answer
- Options Considered
- Recommendation
- Evidence
- When To Revisit

### 2.4. Decision (Решение)

**Что это:** зафиксированный выбор, который влияет на архитектуру, поведение или процесс проекта.

**Когда создавать:**

- Вы выбрали подход, библиотеку, формат или соглашение и хотите, чтобы будущие сессии знали, почему.
- Нужно отменить или заменить предыдущее решение.
- Решение связано с тредом и должно отображаться в его контексте.

**Пример:**

```bash
node dist/bootstrap/cli.js decision add \
  --title "Хранить связи в relations.jsonl" \
  --thread <thread-id> \
  --body "Источник правды для связей — relations.jsonl. SQLite-индекс перестраивается при необходимости."
```

**Что хранится в решении:**

- `title` — название решения
- `body` — обоснование и детали
- `thread` — к какому треду относится (опционально)
- `status` — `active`, `superseded`, `rejected`, `obsolete`

### 2.5. Blocker (Препятствие)

**Что это:** проблема, которая останавливает или замедляет работу, с описанием влияния и возможного обходного пути.

**Когда создавать:**

- Работа не может продолжаться, пока не решена внешняя или внутренняя проблема.
- Нужно зафиксировать риск и его влияние на тред.
- Вы нашли обходной путь, но хотите отслеживать первопричину.

**Пример:**

```bash
node dist/bootstrap/cli.js blocker add \
  --title "Нет доступа к production API" \
  --thread <thread-id> \
  --impact "Невозможно проверить интеграцию с платёжным шлюзом" \
  --workaround "Использовать мок-сервер и тестовые учётные данные"
```

**Что хранится в препятствии:**

- `title` — название проблемы
- `impact` — как именно это мешает работе
- `workaround` — возможный обходной путь (опционально)
- `thread` — к какому треду относится (опционально)
- `status` — `active`, `resolved`, `obsolete`

Чтобы отметить препятствие решённым:

```bash
node dist/bootstrap/cli.js blocker resolve <blocker-id>
```

### 2.6. Thread Brief (Бриф треда)

**Что это:** собранный контекст для старта новой сессии.

**Что показывает:**

- цель и текущее состояние треда;
- открытые info-request;
- статьи;
- отвеченные запросы;
- `next_steps` — следующие шаги;
- `decisions` — принятые решения;
- `blockers` — активные препятствия.

**Когда использовать:**

- В начале новой сессии, чтобы вспомнить, где остановились.
- Перед тем как продолжить работу после перерыва.

```bash
node dist/bootstrap/cli.js thread brief <thread-id>
```

---

## 3. Связи между сущностями

```text
work-thread
  ├── info-request
  │     └── answered_by article
  ├── article
  │     └── may support future decision
  ├── decision
  └── blocker
```

- `info-request` всегда привязан к `work-thread`.
- `article` привязан к `work-thread` и может отвечать на один или несколько `info-request`.
- `decision` и `blocker` могут быть привязаны к `work-thread` или существовать независимо.

---

## 4. Типичный рабочий процесс

### Сессия A: основная работа

```bash
# Создать тред
node dist/bootstrap/cli.js thread create \
  --title "Название задачи" \
  --goal "Чего хотим достичь"

# В процессе работы возникает отложенный вопрос
node dist/bootstrap/cli.js info-request create \
  --title "Вопрос" \
  --thread <thread-id> \
  --question "..." \
  --detour-reason "..." \
  --expected-answer "..." \
  --preliminary-answer "..."
```

### Сессия B: ответ на вопрос

```bash
# Посмотреть открытые запросы
node dist/bootstrap/cli.js info-request list --thread <thread-id>

# Написать статью-ответ
node dist/bootstrap/cli.js article add \
  --title "Ответ на вопрос" \
  --thread <thread-id> \
  --summary "..." \
  --body "..." \
  --answers <info-request-id>
```

### Сессия C: продолжение основной работы

```bash
# Получить контекст
node dist/bootstrap/cli.js thread brief <thread-id>
```

---

## 5. Статусы артефактов

**Work thread:**

- `active` — в работе
- `paused` — приостановлен
- `completed` — завершён
- `archived` — в архиве

**Info request:**

- `open` — открыт
- `answered` — отвечен
- `rejected` — отклонён
- `obsolete` — устарел
- `archived` — в архиве

**Article:**

- `proposed` — предложен агентом
- `accepted` — принят
- `stale` — устарел
- `superseded` — замещён
- `archived` — в архиве

**Decision:**

- `active` — действует
- `superseded` — замещено новым решением
- `rejected` — отклонено
- `obsolete` — устарело

**Blocker:**

- `active` — активно мешает
- `resolved` — решено
- `obsolete` — устарело

---

## 6. Связи между артефактами (Phase 4)

Mr. Wolf хранит явные связи между артефактами в `.wolf/memory/relations.jsonl`. Каноническое хранилище — этот файл; frontmatter остаётся только для читаемости.

Автоматические связи:

- `article` с `--answers <ireq-id>` → `article answers info-request` и обратная `info-request answered_by article`.
- `decision` с `--based-on <artifact-id>` → `decision based_on article` и `article basis_for decision`.
- `blocker` с `--thread <thread-id>` → `blocker blocks work-thread`.
- `blocker resolve <id> --by <artifact-id>` → `artifact resolves blocker`.

Пример:

```bash
node dist/bootstrap/cli.js article add \
  --title "Хранение relations" \
  --thread <thread-id> \
  --summary "..." \
  --body "..." \
  --answers <info-request-id>
```

## 7. Session checkpoints и thread diff (Phase 4)

`session-checkpoint` — снимок состояния треда в момент завершения сессии. Он фиксирует `current_state` и список связанных артефактов.

Создать чекпоинт:

```bash
node dist/bootstrap/cli.js session checkpoint --thread <thread-id>
```

Посмотреть, что изменилось с момента чекпоинта:

```bash
node dist/bootstrap/cli.js thread diff <thread-id> --since <checkpoint-id>
```

Вывод показывает:

- изменение `current_state`;
- добавленные и удалённые связанные артефакты;
- новые relations.

---

## 8. Важные правила

1. **Не копируйте документы целиком.** Регистрируйте их по ссылке и добавляйте выжимку.
2. **Не используйте info-request как TODO.** Это для знаний, а не задач.
3. **Давайте предварительный ответ.** Перед созданием info-request скажите, что вы думаете сейчас.
4. **Обновляйте current_state треда.** В конце сессии кратко опишите, что изменилось.
5. **Используйте thread brief в начале сессии.** Это экономит контекст.
6. **Создавайте session checkpoint перед перерывом.** Это позволит потом сделать `thread diff`.
7. **Явно связывайте артефакты.** Relations помогают понять, почему появилось решение или статья.

---

## 9. Что будет дальше

Следующие фазы:

- **Phase 3:** регистрация документов и внешних артефактов из проекта — **завершена**.
- **Phase 4:** явные связи между артефактами и session checkpoints — **завершена**.
- **Phase 5:** улучшения поиска и ранжирования.
- **Phase 6:** governance: memory_class, truth_role, lifetime.

---

## 10. Обновление документации

> **Правило:** после завершения каждой фазы Mr. Wolf необходимо обновлять пользовательскую документацию.

Это руководство должно отражать актуальные сущности, команды и рабочий процесс. При появлении новых типов артефактов, команд или шаблонов поведения — дополняйте этот файл.

Если документация отстаёт от кода, агенты и пользователи будут теряться в реальном поведении системы.

---

## 11. Быстрая шпаргалка команд

```bash
# Треды
node dist/bootstrap/cli.js thread create --title "..." --goal "..."
node dist/bootstrap/cli.js thread list
node dist/bootstrap/cli.js thread brief <thread-id>
node dist/bootstrap/cli.js thread diff <thread-id> --since <checkpoint-id>

# Info requests
node dist/bootstrap/cli.js info-request create --title "..." --thread <id> --question "..." --detour-reason "..." --expected-answer "..."
node dist/bootstrap/cli.js info-request list --thread <id>

# Статьи
node dist/bootstrap/cli.js article add --title "..." --thread <id> --summary "..." --body "..." --answers <ireq-id>
node dist/bootstrap/cli.js article list --thread <id>

# Решения
node dist/bootstrap/cli.js decision add --title "..." --body "..." --thread <id> --based-on <artifact-id>
node dist/bootstrap/cli.js decision list --thread <id>

# Препятствия
node dist/bootstrap/cli.js blocker add --title "..." --impact "..." --workaround "..." --thread <id>
node dist/bootstrap/cli.js blocker list --thread <id>
node dist/bootstrap/cli.js blocker resolve <blocker-id> --by <artifact-id>

# Session checkpoints
node dist/bootstrap/cli.js session checkpoint --thread <thread-id>
```
