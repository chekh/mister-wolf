# Wolf: зрелость компонентов

**Дата:** 2026-08-31 · Дополняет канон [concept.md](concept.md) v3.3.1

Зрелость измеряется по двум независимым осям: Implementation (состояние реализации) и Evidence (состояние доказательств). Две оси введены ревизией v3.3.1 по внешней критике: одномерная шкала 0–6 создавала ложную точность, а диапазоны («1–2») объединяли разные компоненты в одной строке. Правила: строка = один компонент = один уровень по каждой оси, диапазоны запрещены; для E3+ обязателен `evidence_id` (стабильные идентификаторы EVD-\* ведёт [evidence.md](evidence.md)). Обновляется при каждом изменении статуса — концепт остаётся стабильным.

## Оси

**Implementation state** — насколько компонент реализован:

| Уровень | Значение                              |
| ------: | ------------------------------------- |
|      I0 | идея                                  |
|      I1 | специфицировано                       |
|      I2 | реализовано                           |
|      I3 | интегрировано (в ежедневном продукте) |

**Evidence state** — чем подтверждён компонент:

| Уровень | Значение             |
| ------: | -------------------- |
|      E0 | нет доказательств    |
|      E1 | тесты                |
|      E2 | PoC                  |
|      E3 | dogfood              |
|      E4 | benchmark            |
|      E5 | внешняя эксплуатация |

Оси независимы: компонент может быть dogfooded без формального PoC или эксплуатироваться без benchmark. Высокий номер по одной оси не является общей оценкой качества.

## Компоненты

| Компонент                                                           | Impl | Evid | Обоснование (факты)                                                                                               | evidence_id          | Впереди                                            |
| ------------------------------------------------------------------- | :--- | :--- | ----------------------------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------- |
| Иерархия L0/L1/L2 (оркестрация по брифам)                           | I3   | E3   | Догфудинг в собственном репо: диспетчеризация и приёмка по брифам (сессии 2026-08-24…31)                          | EVD-ORCH-1           | Количественное сравнение с одиночным агентом — E1a |
| Council: memory schema (council-question/opinion/synthesis)         | I2   | E1   | Типы реализованы в таксономии памяти, покрыты тестами                                                             | —                    | Контракт v2 — A9                                   |
| Council: invocation policy                                          | I1   | E0   | Протокол вызова спроектирован в каноне                                                                            | —                    | A9                                                 |
| Council: independent opinion isolation                              | I1   | E0   | Правило процесса в каноне; механизма изоляции контекстов нет                                                      | —                    | A9                                                 |
| Council: synthesis with dissent                                     | I1   | E0   | Спроектировано; сохранение несогласия не реализовано                                                              | —                    | A9                                                 |
| Council runtime                                                     | I1   | E0   | Протокол спроектирован; исполнение не реализовано                                                                 | —                    | A9                                                 |
| CLI/MCP core                                                        | I3   | E3   | Стабильный surface; dogfood-активность отслеживается на effectiveness-панели                                      | EVD-EFF-1            | Ревизия surface — в плане                          |
| Кросс-платформенная переносимость                                   | I2   | E2   | Архитектура vendor-neutral; эксплуатационно подтверждён один адаптер (opencode), второго нет                      | —                    | Второй адаптер                                     |
| Память: store (типы, lifecycle, supersede, governance)              | I3   | E3   | CLI + MCP, таксономия, lifecycle-статусы, supersede-цепочки, governance                                           | EVD-EFF-1            | —                                                  |
| Память: поиск (FTS5)                                                | I3   | E3   | FTS-поиск в продукте                                                                                              | EVD-EFF-1            | —                                                  |
| Память: decay/revalidation                                          | I1   | E0   | Спроектировано, не реализовано                                                                                    | —                    | Ф26 (Фаза D roadmap-v3)                            |
| Память: кластеризация паттернов                                     | I0   | E0   | Идея в контуре самообучения                                                                                       | —                    | Ф21 (Фаза D roadmap-v3)                            |
| Tool registry (Библиотекарь)                                        | I1   | E2   | Исследование tools-as-skills: 6/6 сценариев; типа `tool` в памяти нет                                             | EVD-RES-2            | Тип `tool` в памяти, реестр в продукте, E1e        |
| Доставка лиц/методик (plugin-inject/pull/bake-in)                   | I2   | E2   | Доставка 3/3 в PoC #1–2                                                                                           | EVD-POC-1, EVD-POC-2 | —                                                  |
| Роутинг моделей                                                     | I2   | E2   | PoC #4: смена модели на лету (glm-5.3-flash → glm-5.2) в одной сессии                                             | EVD-POC-4            | —                                                  |
| Bootstrap: скелет `wolf init`                                       | I2   | E2   | Скелет памяти создаётся и применяется                                                                             | —                    | —                                                  |
| Bootstrap: адаптивное наполнение Стюардом                           | I1   | E0   | Спроектировано                                                                                                    | —                    | Фаза B roadmap-v3                                  |
| Мутация по жалобе (Наставник)                                       | I2   | E2   | PoC #3: жалоба → атрибутированная версия playbook (v3→v4) → поведение следующей сессии изменено персистентно (H4) | EVD-POC-3            | Положительный эффект — E1d                         |
| Steward invocation policy (сигнальный путь)                         | I1   | E2   | Путь «жалоба → сигнал → Наставник» проверен PoC #3; policy runtime нет                                            | EVD-POC-3            | Policy runtime (канон v3.3.1)                      |
| Конвейер активации: универсальный порядок                           | I2   | E2   | draft→проверка→активация→аудит проверен PoC #3                                                                    | EVD-POC-3            | —                                                  |
| Конвейер активации: type-specific валидаторы                        | I1   | E0   | Специфицируются                                                                                                   | —                    | —                                                  |
| Измеренное положительное обучение                                   | I1   | E0   | Определение и спека: `docs/superpowers/specs/2026-08-26-self-learning-design.md`                                  | —                    | Измерение эффекта — Фаза D+, E1d                   |
| Evidence model (сквозная структура)                                 | I1   | E0   | Канон §3 v3.3.1: evidence как проверяемая связь claim↔основание; в модели данных не реализовано                   | —                    | First-class поддержка в памяти и приёмке           |
| Acceptance package                                                  | I1   | E0   | Частичная практика в отчётах executor'ов; канонического формата нет                                               | —                    | B9 (roadmap-v3)                                    |
| Independent review                                                  | I2   | E3   | Ревьюер воркеров в dogfood-сессиях собственного репо                                                              | EVD-ORCH-1           | Формализация через acceptance package              |
| Checkpoint/recap                                                    | I2   | E3   | Completion-checkpoint (recap) в ежедневном употреблении; внутренние триггеры — канон v3.3.1, не реализованы       | EVD-ORCH-1           | Внутренние триггеры checkpoint                     |
| Semantic resume                                                     | I2   | E3   | Продолжение работы в новой сессии по recap + work-thread                                                          | EVD-ORCH-1           | E1b                                                |
| Owner override                                                      | I2   | E2   | Ручной supersede/rollback в CLI                                                                                   | —                    | —                                                  |
| Complain как продуктовый workflow                                   | I1   | E2   | Механизм доказан PoC #3; продуктовой формы `wolf complain` нет                                                    | EVD-POC-3            | B3 (roadmap-v3)                                    |
| Actor assignment by runtime                                         | I1   | E0   | Сейчас `user:cli`; назначение актора runtime'ом — канон v3.3.1                                                    | —                    | W1 (Фаза A roadmap-v3)                             |
| Knowledge scope (область применимости знания)                       | I1   | E0   | Каноническое требование concept; поля в схеме памяти нет                                                          | —                    | Схема + валидация при активации                    |
| Invalidation (инвалидация зависимых знаний при изменении источника) | I1   | E0   | Спроектировано в lifecycle; механики нет, только ручной supersede                                                 | —                    | Фаза D roadmap-v3                                  |
| Trust/provenance enforcement                                        | I1   | E0   | Канон v3.3.1; enforcement не реализован                                                                           | —                    | —                                                  |
| Generated imprint verification                                      | I1   | E0   | Генерация отпечатков доказана (EVD-POC-2); верификации соответствия отпечатка канону нет                          | —                    | Верификация в конвейере активации                  |
| Security: provenance validation                                     | I1   | E0   | Нормативное требование (concept, Security); enforcement отсутствует                                               | —                    | —                                                  |
| Security: trust_level enforcement                                   | I1   | E0   | Нормативное требование (concept, Security); enforcement отсутствует                                               | —                    | —                                                  |
| Security: prompt-injection isolation                                | I1   | E0   | Нормативное требование (concept, Security); enforcement отсутствует                                               | —                    | —                                                  |
| Security: capability_scope                                          | I1   | E0   | Нормативное требование (concept, Security); enforcement отсутствует                                               | —                    | —                                                  |
| Security: sandbox permissions                                       | I1   | E0   | Нормативное требование (concept, Security); enforcement отсутствует                                               | —                    | —                                                  |
| Security: source invalidation                                       | I1   | E0   | Нормативное требование (concept, Security); enforcement отсутствует                                               | —                    | —                                                  |

## Профили опор (concept §8)

Опоре не присваивается один уровень — только профиль составляющих (сводка; детализация — в таблице выше):

| Опора                                   | Профиль                                                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Pillar 1 — Persistent Organization**  | L0/L1/L2 **I3/E3** · Council schema **I2/E1** · Council runtime **I1/E0**                                                               |
| **Pillar 2 — Institutional Continuity** | storage **I3/E3** · typed process state **I2/E2** · resume workflow **I2/E3** · revalidation **I1/E0** · measured continuity **I0/E0**  |
| **Pillar 3 — Accumulated Capabilities** | tool registry **I1/E2** · экономика переиспользования **I0/E0** · доставка **I2/E2**                                                    |
| **Pillar 4 — Governed Learning**        | мутация по жалобе **I2/E2** · конвейер активации **I2/E2** · steward invocation policy **I1/E2** · measured positive learning **I1/E0** |

## Перенесено из концепта (быстроустаревающие детали)

- **Ф20–26** — контур самообучения: сигнальный лог → паттерны → полный Стюард → STOP → GEPA → AFlow → decay; номера и названия фаз — Фаза D roadmap-v3.
- **B3** — продуктовая форма `wolf complain` + Наставник в продукте — Фаза B roadmap-v3.
- **B7** — demo «Correct your agent once» полного мутационного цикла (терминальная запись 10–15 сек) — Фаза B roadmap-v3.
- **A9** — консилиум-контракт v2 (кворум, сохранение несогласия) — Фаза A roadmap-v3.
- **E1a–E1e** — программа benchmark-подтверждения ([evidence.md](evidence.md)): E1a Hierarchy · E1b Continuity · E1c Council · E1d Governed Learning · E1e Capabilities — Фаза E roadmap-v3.

## Впереди

Главные пробелы (ни один компонент не достиг E4/E5):

- **Программа E1a–E1e** — количественное подтверждение всех четырёх опер (benchmark, ablation).
- **Decay/revalidation** и **кластеризация паттернов** — контур самообучения памяти (Фаза D).
- **Tool registry** — тип `tool` в памяти и реестр в продукте (Pillar 3).
- **Council контракт v2** (A9) — runtime, кворум, dissent.
- **Второй адаптер** — переносимость выше одного подтверждённого адаптера.
- **Security-enforcement** — шесть нормативных требований Security без реализации.

---

Источник фактов: concept.md v3.3.1 (канон) · [evidence.md](evidence.md) (реестр EVD-\*) · roadmap-v3.
