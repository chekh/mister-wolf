# Протокол обучения Стюарда (steward learn protocol)

**Версия:** Phase D2 / Ф22 (roadmap v3) — `wolf learn propose|validate|activate`
**Статус:** продукт-минимум; LLM-генерация — протокол вложенного вызова (§5), CLI работает без LLM
**Канон:** спека `docs/superpowers/specs/2026-08-26-self-learning-design.md` §2.3 (кандидаты),
§2.5 (создание ≠ активация), §5 (Sandbox Replay Holdout), §6 (negative constraints).

---

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

## 6. Инварианты

1. Создание ≠ активация: доставляемость — только после вердикта (гейт §2.5).
2. Вердикт детерминированный (реплей лога), не LLM-as-a-judge (§5).
3. Дедуп: один открытый draft на паттерн; повторный propose блокируется.
4. Все артефакты — файлы (объекты, логи, relations): git даёт откат;
   delivery_event активации пишется в сигнальный лог (mechanism `call`).
5. LLM — только опциональный адаптер за DraftGenerator (§9).
