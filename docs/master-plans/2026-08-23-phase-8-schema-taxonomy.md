# Мастер-план: Phase 8 — Schema-driven taxonomy + оркестрационные типы + надёжность записи

**Дата:** 2026-08-23
**Идея:** Перевести таксономию памяти из hardcoded-кода в `.wolf/config.yaml`, добавить 7 оркестрационных типов, надёжность записи (lockfile, JSONL-валидация, карантин) и одну миграцию layout `objects/ → threads/`.

**Источник требований:** `docs/concept/archive/concept-2026-08-18-v2.0-memory-substrate.md` §1.2, §1.4, §6 (Phase 8), §7 (#11–13).

---

## Стадия 1: Требования

| Параметр  | Значение                                                                                                                                            |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Сложность | рассудительная                                                                                                                                      |
| Модель    | opencode/big-pickle                                                                                                                                 |
| Агент     | requirements-builder                                                                                                                                |
| Вход      | `docs/concept/archive/concept-2026-08-18-v2.0-memory-substrate.md` §1.2, §1.4, §6 Phase 8; `src/domain/memory-types.ts`; `src/domain/governance.ts` |
| Выход     | `docs/superpowers/specs/2026-08-23-phase-8-schema-taxonomy.md`                                                                                      |
| Гейт      | **обязательный** — человек одобряет спеку                                                                                                           |

Ключевые вопросы спеке:

1. Механизм генератора lifecycles (код → config.yaml): команда? build-step? Формат отчёта о расхождениях.
2. Соотношение zod-схем в коде и config.yaml: кто канон для типов полей; валидация самого конфига.
3. Поведение без config.yaml (дефолты из кода).
4. Миграция layout: формат dry-run, dual-read семантика, идемпотентность, DoD.
5. Надёжность записи: lockfile scope, карантин-семантика, `wolf validate` вывод.

Команда:

```bash
opencode run --agent requirements-builder --model opencode/big-pickle --auto \
  "Создай спеку Phase 8 по концепции @docs/concept/archive/concept-2026-08-18-v2.0-memory-substrate.md (§1.2, §1.4, §6 Phase 8). Сверь с реальным доменом @src/domain/memory-types.ts и @src/domain/governance.ts. Обязательно закрой вопросы: генератор lifecycles, канон config-vs-zod, работа без конфига, миграция layout (одна, с document-ref/native), lockfile/карантин/wolf validate. Формат: superpowers/writing-plans."
```

---

## Стадия 2: План реализации

| Параметр  | Значение                                                       |
| --------- | -------------------------------------------------------------- |
| Сложность | структурная                                                    |
| Модель    | opencode/big-pickle                                            |
| Агент     | plan-builder                                                   |
| Вход      | спека стадии 1                                                 |
| Выход     | `docs/superpowers/plans/2026-08-23-phase-8-schema-taxonomy.md` |
| Гейт      | **обязательный** — человек одобряет план                       |

Команда:

```bash
opencode run --agent plan-builder --model opencode/big-pickle --auto \
  "Создай план реализации по спеке @docs/superpowers/specs/2026-08-23-phase-8-schema-taxonomy.md"
```

---

## Стадия 3: Авторефайн

| Параметр   | Значение                                                                               |
| ---------- | -------------------------------------------------------------------------------------- |
| Скрипт     | `./tools/pipeline/autorefine.sh`                                                       |
| Цель       | `docs/superpowers/plans/2026-08-23-phase-8-schema-taxonomy.md`                         |
| Раундов    | 3                                                                                      |
| Проверщики | check-coverage, check-placeholders, check-types (+ check-architecture если >10 тасков) |
| Гейт       | **обязательный** — человек ревьюит изменения                                           |

Команда:

```bash
./tools/pipeline/autorefine.sh docs/superpowers/plans/2026-08-23-phase-8-schema-taxonomy.md 3 \
  check-coverage check-placeholders check-types
```

---

## Стадия 4: Реализация

| Параметр  | Значение                                           |
| --------- | -------------------------------------------------- |
| Сложность | структурная                                        |
| Модель    | opencode/big-pickle                                |
| Агент     | executor                                           |
| Вход      | refined-план стадии 3                              |
| Выход     | изменения в коде + тесты (`npm run check` зелёный) |
| Гейт      | **обязательный** — тесты проходят + человек        |

Порядок внутри фазы (из концепции):

1. Генератор lifecycles (блокер для всего остального)
2. Config-driven taxonomy + обратная совместимость
3. Оркестрационные типы через core pack
4. Надёжность записи (lockfile → JSONL-валидация → карантин → wolf validate)
5. Миграция layout (последней, когда таксономия финальна)

Команда:

```bash
opencode run --agent executor --model opencode/big-pickle --auto \
  "Реализуй план @docs/superpowers/plans/2026-08-23-phase-8-schema-taxonomy.md"
```

---

## Примечания

- Ветка: `feat/phase-8-schema-taxonomy` от `dev` (git-flow), merge обратно в `dev`
- Между стадиями — git commit (идемпотентность, откат)
- Производительность: перед серией вызовов агентов — `opencode serve --port 4096 &`, далее `--attach http://localhost:4096`
- После стадии 4 — обновить AGENTS.md, README.md, MEMORY.md (rule: update project docs after every implementation phase) <!-- MEMORY.md заархивирован 2026-08-25 -> docs/archive/MEMORY.md -->
