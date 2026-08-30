# Протокол обучения Стюарда (steward learn protocol)

**Версия:** Phase D3 / Ф20–26 (roadmap v3) — контур самообучения замкнут
**Статус:** продукт-минимум; LLM-генерация — протокол вложенного вызова (§5, §9), CLI работает без LLM
**Канон:** спека `docs/superpowers/specs/2026-08-26-self-learning-design.md` §2.3 (кандидаты),
§2.5 (создание ≠ активация), §5 (Sandbox Replay Holdout, STOP-гейт, read-only зоны),
§6 (negative constraints, decay, observability), §3 (GEPA-границы, AFlow-класс).

---

## 0. Полный цикл Ф20–26: кто/что/когда

| Фаза               | Механизм                                                                              | Команда                                           | Лицо/владелец                                                   |
| ------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| Ф20 сигнальный лог | writer'ы CLI пишут `session-metrics.jsonl` (run/complaint/delivery/tool_error)        | — (побочный эффект команд)                        | исполняющий агент (наблюдение, не адаптация)                    |
| Ф21 паттерны       | кластеризация `tool:class` по порогу N≥3                                              | `wolf learn digest` / `status`                    | любой (только факты)                                            |
| Ф22 кандидаты      | propose → Sandbox Replay Holdout → activate (гейт §2.5)                               | `wolf learn propose/validate/activate`            | Стюард-Архивариус                                               |
| Ф23 STOP-гейт      | pressure-сценарии доставки + read-only зоны — барьер автономной адаптации             | `npm run pressure-test` (= `wolf learn gate`)     | человек/координатор запускает; гейт в `activate` автоматический |
| Ф24 GEPA           | эволюция шаблонов: dry-run сравнение кандидат vs текущий по детерминированной метрике | `wolf learn evolve <id> [--write]`                | рефлектор (LLM) готовит, применяет — только человек             |
| Ф25 AFlow          | эвристики глубины ревью — рекомендация flat/review-council                            | `wolf learn route --files N --lines N …`          | координатор решает; эвристики меняет только человек             |
| Ф26 decay          | TTL по пробегу (сессии) → `review_required`-очередь; реактивация доставкой            | `wolf learn decay`; очередь — в `digest`/`status` | Стюард-Архивариус чистит; владелец ревизует                     |

Каденс — event-driven (пороги/триггеры), не календарь (спека §7). A-MEM —
отложено в v2 (триггер переоценки: `recall_delivery < 0.8` при ≥20 events).

## 1. Что это

Конвейер превращения повторяющихся сигналов в активные правила памяти:

```text
сигналы (Ф20) → паттерны N≥3 (Ф21) → draft (propose)
  → Sandbox Replay Holdout (validate) → активация (activate) → доставка (wolf call)
```

Два события разведены жёстко (спека §2.5): **создание** draft'а — без пре-аппрува
человека (`created_by: steward:archivist`, `status: proposed`, запись НЕ
доставляема); **активация** — только после зелёного holdout-вердикта либо явного
человеческого апрува. До активации draft невидим для `wolf call` (доставка
матчит только `status: active`).

## 2. Цикл: как запускать

Владелец цикла — Стюард (режим grow, лицо **Архивариус**: знания памяти).
Координатор/воркер запускает цикл по триггеру: паттерн в `wolf learn digest`
(порог N≥3) либо жалоба/decay-сигнал.

```bash
# 1) посмотреть, что накопилось (паттерны + draft'ы на пост-аудите)
node dist/bootstrap/cli.js learn digest

# 2) создать draft из активного паттерна (механический генератор, без LLM)
node dist/bootstrap/cli.js learn propose bash:timeout
#    анти-правило («никогда не использовать тул целиком»):
node dist/bootstrap/cli.js learn propose bash:timeout --negative

# 3) прогнать Sandbox Replay Holdout (детерминированный, не LLM-as-a-judge)
node dist/bootstrap/cli.js learn validate <draft-id>

# 4) активировать (только после verdict: pass)
node dist/bootstrap/cli.js learn activate <draft-id>
#    текстовый draft (needs_human_review) — только с явным апрувом:
node dist/bootstrap/cli.js learn activate <draft-id> --human-approved
```

Атрибуция: propose/activate пишут `created_by` из `--created-by` > env
`WOLF_ACTOR` > `steward:archivist`. Откат — одна операция: `wolf supersede`
или `wolf transition <id> archived`.

## 3. Вердикты validate

| Draft                                  | Что проверяется                                                                                                                               | Вердикт                                           |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| механический (из `tool:class`)         | повторение кластера на событиях лога ПОСЛЕ создания draft (holdout — данные, не участвовавшие в генерации)                                    | `pass` (повторилось ≥1) / `fail` (не повторилось) |
| анти-правило (`--negative`)            | обратная логика: покрывает все ошибки тула, любой класс; в note — классы повторений + предупреждение о нелогируемых легитимных использованиях | `pass` / `fail`                                   |
| текстовый (complaint/delivery-паттерн) | механический replay невозможен — честный статус, не фейк-зелёный                                                                              | `needs_human_review`                              |

Вердикт фиксируется в объекте (`holdout_verdict`, `holdout_prevented`,
`holdout_checked`, `holdout_ts`); повторный validate пересчитывает по новому
логу. Draft несёт манифест правки (§5 спеки): `predicted_effect`,
`regression_risks`, `blast_radius`, `risk_level`.

## 4. Обязанности сторон

- **Координатор/воркер** — запускает цикл по триггеру (digest показывает
  паттерн с N≥3); сам правила не пишет.
- **Стюард (Архивариус)** — владелец цикла propose→validate→activate; вносит
  rule/lesson от своего имени с пост-аудитом; одно изменение за итерацию.
- **Владелец** — ревизует накопленное пост-аудитом: `learn digest` (секция
  `drafts (post-audit)`), отмена/правка задним числом (`supersede`/`transition`).
- **Наставник** (лицо жалобы, `complain` → мутация playbook) — другой контур,
  уже работает (PoC #3), этим протоколом не трогается.

## 5. Роль LLM (Analyzer-Worker)

CLI propose работает в механическом режиме: детерминированный шаблон из
таксономии классов ошибок (`src/domain/mechanical-advice.ts`), инвариант
local-first — запись и валидация никогда не требуют LLM (спека §7, §9).

LLM-режим — Analyzer-Worker (спека §4: фронтирная модель, M22-02), за
интерфейсом `DraftGenerator` (`src/app/use-cases/propose-draft.ts`). Протокол
вложенного вызова (как B3/complaint-protocol):

```bash
# Стюард (grow) вызывает Analyzer-рамку headless — рамке нужен mode:all
opencode run --agent <analyzer-frame> "кластер <key>, N=<count>, evidence=<refs>;
  верни draft по контракту GeneratedDraft (JSON): type/title/body/
  triggerKeywords/mechanical/polarity/constraint/manifest"
```

Стюард вносит полученный draft через use-case `proposeDraft` с кастомным
генератором (моки в тестах — прецедент без LLM). Analyzer создаёт только
draft, никогда не активирует (спека §4); bounded proposal context и negative
constraints передаются в промпт до генерации. Реальный LLM-вызов в юнит- и
e2e-тестах запрещён.

## 6. Ф23: STOP-гейт и read-only зоны

Барьер перед любой автономной адаптацией (спека §5, §3): автономная активация
draft'а (`learn activate` без `--human-approved`) проходит давление
pressure-сценария, построенного из самого draft'а: mock-агент обязан получить
знание через call-injection ПО ДЕЙСТВИЕМ (premature action — провал) и
воздержаться от `constraint_tool`. Кривые `trigger_keywords` → гейт красный.

Полный прогон по проекту (вне `npm run check` — отдельный npm-script):

```bash
npm run pressure-test          # = wolf learn gate
# вывод: вердикты сценариев, layer4-метрики, read-only зоны N/N enforced
```

Read-only зоны (M23-01): логи (`events.jsonl`, `relations.jsonl`,
`session-metrics.jsonl`, `patterns.jsonl`), код гейтов/валидаторов
(`src/domain/gates/`, `src/domain/policies/`), скелет (`.opencode/`,
`AGENTS.md`). Мутация зоны из контура → `UserFacingError` механически
(`src/domain/policies/read-only-zones.ts`); append сигналов наблюдения —
единственное исключение (§3 L0). Integrity-давление (массовые записи,
supersede-цепочки, битые relations/логи) — секции `wolf validate`
(`supersede`, `signal log`).

## 7. Ф26: decay по пробегу

Единица жизни знания — ПРОБЕГ (сессии по `session-metrics.jsonl`), не календарь.
Объект, не срабатывавший TTL сессий, получает `review_state: review_required`
(это НЕ lifecycle-статус: объект остаётся active, попадает в очередь
`learn digest`). Срабатывание = delivery-событие (`wolf call` штампует
доставку каждого объекта) — реактивация автоматическая.

TTL [ВА] §16 (override: `learning.decay_ttl` в `.wolf/config.yaml`, сессии):
session-summary 30 / lesson, rule, playbook 90 / decision 180.

```bash
node dist/bootstrap/cli.js learn decay          # прогон (или --dry-run)
node dist/bootstrap/cli.js learn status         # drift: decayShare, silentRules, newErrorClasses
```

Досрочный review: молчащее правило (ноль доставок за 30 сессий при ≥20
delivery в логе) → `decay_reason: rule_utilization`. Консолидация — дедуп,
не суммаризация (M26-02).

## 8. Ф24: эволюция шаблонов (GEPA-минимум)

Шаблоны брифов — файлы `.wolf/templates/<id>.md` (≤1500 символов, M24-03).
`wolf learn evolve <id>` строит пул 20–100 примеров из ошибок лога (M24-02),
рефлектор готовит кандидата, детерминированная метрика (доля предотвращённых
ошибок пула) сравнивает ревизии Парето-по-инстансам:

```bash
node dist/bootstrap/cli.js learn evolve brief           # dry-run: только сравнение
node dist/bootstrap/cli.js learn evolve brief --write   # кандидат-файл; активация — только человек
```

LLM-рефлектор (фронтирный, M24-01) — за интерфейсом `TemplateReflector`
(`src/app/use-cases/template-evolve.ts`); CLI-дефолт — детерминированный
механический рефлектор (avoid-указания по топ-тулам пула). Протокол
вложенного вызова — как у Analyzer-Worker (§5 выше), с constraint-блоком
`reflectorConstraints()` против утечки примеров (M24-04). Только задачи с
детерминированной метрикой (§3); открытые/субъективные — гейт человека без
GEPA-скоринга.

## 9. Ф25: глубина ревью (AFlow-минимум)

`wolf learn route --files N --lines N --blast-radius 0.7 [--touches-read-only]
[--security] [--type experiment] [--metricless]` — детерминированная таблица
эвристик (M25-01): рекомендация `flat`/`review-council` + обоснования.
Решение принимает координатор/человек (S25-02); изменение эвристик — класс
«структура», только человек (§3). Валидация роутинга — pressure-тестами Ф23.

## 10. Инварианты

1. Создание ≠ активация: доставляемость — только после вердикта (гейт §2.5);
   автономный путь — дополнительно через STOP-гейт Ф23.
2. Вердикт детерминированный (реплей лога), не LLM-as-a-judge (§5).
3. Дедуп: один открытый draft на паттерн; повторный propose блокируется.
4. Все артефакты — файлы (объекты, логи, relations): git даёт откат;
   delivery_event активации пишется в сигнальный лог (mechanism `call`).
5. LLM — только опциональный адаптер за интерфейсами DraftGenerator /
   TemplateReflector (§9); в тестах — моки.
6. Read-only зоны неизменяемы для контура (§5); decay — НЕ удаление,
   а очередь пересмотра (§6).
