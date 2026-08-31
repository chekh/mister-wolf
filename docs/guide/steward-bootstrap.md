# Steward Bootstrap: протокол свёртки стартовой памяти

**Версия:** Phase B5 roadmap v3 (концепт §7 «Bootstrap — подключение к проекту»)
**Статус:** активно развивается

---

## 1. Что здесь происходит

`wolf init` создаёт скелет памяти, а `wolf bootstrap` — план наполнения: скан проекта, 2-3 черновика правил (status `proposed`), document-ref'ы на найденные документы и work-thread «Bootstrap: наполнение стартовой памяти».

Черновики выведены из фактов скана и **не действуют**, пока Стюард их не свернёт. Этот протокол — инструкция для Стюарда (рамка `.opencode/agents/steward.md`).

## 2. Входные точки

```bash
# Что создал bootstrap (заголовок «# Bootstrap brief» в stdout последнего запуска)
# Черновики правил:
node dist/bootstrap/cli.js list --type rule --status proposed
# Контекст скана:
node dist/bootstrap/cli.js get project-scan-latest
```

## 3. Протокол свёртки

### Шаг 1. Прочитай черновики

Каждый черновик — правило с tag `bootstrap`, confidence `low`. Заголовки вида `Стек: …`, `Проверка проекта: …`, `Документация: …` — это факты скана, а не готовые конвенции.

### Шаг 2. Проверь по фактам проекта

Сверь каждый черновик с реальностью: стек и версии (package.json, tsconfig, pyproject), команду проверки, полноту документов. Правь title/body прямо в файле `.wolf/memory/shared/rules/<id>.md` (frontmatter не трогай). Похожие черновики объединяй в один, лишние отклоняй.

### Шаг 3. Переведи статусы

```bash
# Принять:
node dist/bootstrap/cli.js transition <rule-id> accepted
# Отклонить (не соответствует проекту):
node dist/bootstrap/cli.js transition <rule-id> rejected
```

Правило в `accepted` — принято, но ещё не действует; когда конвенция подтверждена в работе, переведи в `active` (тем же `transition`).

### Шаг 4. Проверь document-ref'ы

```bash
node dist/bootstrap/cli.js list --type document-ref
```

- Лишний ref (файл не является проектным документом) — `node dist/bootstrap/cli.js transition <ref-id> stale`.
- Недостающий документ — положи файл в `docs/` и перезапусти `node dist/bootstrap/cli.js scan`.

### Шаг 5. Закрой work-thread

```bash
node dist/bootstrap/cli.js transition <thread-id> completed
```

id треда — в bootstrap brief (строка `Work-thread: …`) или `node dist/bootstrap/cli.js list --type work-thread`.

### Шаг 6. Зафиксируй решение

```bash
node dist/bootstrap/cli.js decision add \
  --title "Стартовые конвенции проекта" \
  --body "Принятые правила: <список id и суть>. Команда проверки: <команда>. Документы: <список>."
```

## 4. Критерии готовности

- Не осталось правил в `proposed` (`list --type rule --status proposed` пуст).
- Каждый document-ref `active` или `stale` — ни одного непроверенного.
- Work-thread в `completed`, решение записано.
- Следующая сессия начинает с принятых конвенций, а не с черновиков.
