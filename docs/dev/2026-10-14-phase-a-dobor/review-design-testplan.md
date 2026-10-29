---
slug: phase-a-dobor
title: '2.18.0 — T-00 wolf-review: design.md + test-plan.md'
status: accepted
lens: design+testplan
created: 2026-10-14
reviewer: executor-lead (T-00)
baseline: 621c2c8
documents:
  - docs/dev/2026-10-14-phase-a-dobor/design.md
  - docs/dev/2026-10-14-phase-a-dobor/test-plan.md
  - docs/dev/2026-10-14-phase-a-dobor/plan.md
---

# T-00 — wolf-review design + test-plan

## Мандат

- **Линзы:** Requirements ↔ Design, Design ↔ Code, Plan ↔ Design/Test-plan, Test-plan ↔ Requirements.
- **Security/trust линза:** не применена (не затрагивает untrusted input, secrets, install runtime).
- **Бюджет:** 1 раунд; L0 уже утвердил design/plan/test-plan без изменений; T-00 = формальная верификация.
- **Источник:** одобренный L0 пакет (`mem_20261014_otvety_l0_po_oq_01_05_trebovaniya_2_18_0_48611c`).

## Точечные проверки (cross-reference с кодом)

- ✅ `CLAIM_TTL_MS = 24h` в `src/adapters/fs/claim-registry.ts:26` — design §3.3 + ADR-7 ссылаются корректно.
- ✅ `Confidence = 'low' | 'medium' | 'high'` в `src/domain/memory-types.ts:24` — ADR-9 переиспользует, нового не вводит.
- ✅ `Atomics.wait` в `src/adapters/fs/claim-registry.ts:102` — design §3.3 DAP-1 ссылается корректно.
- ✅ `extractVote` в `src/app/use-cases/build-analytics.ts:1783` — design §3.1 сохраняет обратную совместимость (NFR-01).
- ✅ CORE_TAXONOMY_DECLS содержит `council-opinion`/`synthesis` (line 259-261) — design §3.1 корректно ссылается.
- ✅ `playground-lab/` существует — OQ-06 L0-решение применимо.
- ✅ `.wolf/SKILL.md` существует (8.8 KB) — design §3.1 ADR-8 (изоляция как процедура) применимо.
- ✅ Worktree-стратегия в plan §4: write sets изолированы, common shared files = 0.

## Линза 1: Requirements ↔ Design

| REQ              | Design §       | Test-plan            | Покрытие |
| ---------------- | -------------- | -------------------- | -------- |
| REQ-01 (A9)      | §3.1 + ADR-8/9 | S-01..S-09           | ✅       |
| REQ-02 (A10)     | §3.2 + ADR-10  | S-10..S-15 + S-60/61 | ✅       |
| REQ-03 (A11)     | §3.3 + ADR-7   | S-20..S-28 + S-70/71 | ✅       |
| REQ-04 (B0)      | §3.4           | S-30..S-35           | ✅       |
| REQ-05 (Release) | §3.5           | S-40..S-45           | ✅       |

**NFR покрытие:**

| NFR                                 | Test-plan |
| ----------------------------------- | --------- |
| NFR-01 (legacy чтение)              | S-50/51   |
| NFR-02 (docs-audit в CI)            | S-60/61   |
| NFR-03 (claim 2.17.1 совместимость) | S-70/71   |
| NFR-04 (2.17.x → 2.18.0)            | S-80      |
| NFR-05 (полный релиз)               | S-90      |

## Линза 2: Design ↔ Code (статика)

- ✅ ADR-7 (heartbeat-файл) — не противоречит L0 OQ-04; минимально инвазивно (только новые функции, без правки существующего claim-файла).
- ✅ ADR-8 (изоляция — процедура) — соответствует духу roadmap-v3 (governed learning, не trusted runtime); фиксируется в `.wolf/SKILL.md`.
- ✅ ADR-9 (Confidence) — переиспользует существующий enum 2.13, не плодит новый тип.
- ✅ ADR-10 (A10 объём = полный `docs/**`) — соответствует L0 OQ-05.
- ✅ Псевдоконтракты (CouncilOpinionV2, SynthesisV2, HeartbeatRecord) — type-safe; не реализация продукта.
- ✅ Grep-алгоритм (A10) — pseudocode; не дублирует `tests/e2e/docs-audit.test.ts`.

## Линза 3: Plan ↔ Design/Test-plan

- ✅ 8 чекбокс-задач: T-00, T-A9, T-A11, T-B0, T-A10, T-INT, T-REL, T-STEW.
- ✅ Граф зависимостей: T-00 → {T-A9, T-A11, T-B0} → T-A10 → T-INT → T-REL; T-STEW независим.
- ✅ Параллелизм: A9/A11/B0 — write sets изолированы (см. §4 плана), common files = 0.
- ✅ T-INT — 5 шагов (rebase → merge → full check → ACCEPTANCE → wolf-review).
- ✅ T-REL — зависит от T-INT; L0 финально аппрувит npm publish (L0-решение).
- ✅ T-STEW — отдельный контур, фон; не блокирует основной план.
- ✅ Risk register — 6 рисков с митигацией.

## Линза 4: Test-plan ↔ Requirements

- ✅ 90 сценариев S-01..S-90 с явным Given/When/Then (или manual procedure).
- ✅ Каждый сценарий имеет: oracle, уровень, путь к тесту.
- ✅ S-20..S-28 (A11) — heart of the change; полное покрытие (write/read/stale/heartbeat/parallel/legacy compat).
- ✅ S-70/71 (NFR-03) — обратная совместимость 2.17.1.
- ✅ S-60/61 (NFR-02) — docs-audit в CI.

## Находки

### F-01 (minor) — design §3.3 `CLAIM_FLOCK_TIMEOUT_MS`

- **Где:** `docs/dev/2026-10-14-phase-a-dobor/design.md` §3.3 — `export const CLAIM_FLOCK_TIMEOUT_MS = 30 * 1000;`
- **Проблема:** В коде (`src/adapters/fs/claim-registry.ts:101-102`) такого параметра нет. `sleepMs(10)` через `Atomics.wait` — это in-flight окно (10ms × 60 attempts = 600ms максимум). 30-секундная величина из брифа относится к другому контексту (L0: «30s — это таймаут file lock на операцию записи, не TTL»). В design объявлена константа, которая в коде отсутствует — может ввести в заблуждение T-A11.
- **Влияние:** low — T-A11 должен решить, нужна ли такая константа (опциональный future-proof), или удалить.
- **Рекомендация:** в T-A11 уточнить с фактическим `sleepMs`/`Atomics.wait` поведением; если константа не нужна — удалить из design (T-A11 сам решит).
- **Блокирует:** нет.

### F-02 (minor) — plan.md T-A10 «≥ 30 файлов»

- **Где:** `docs/dev/2026-10-14-phase-a-dobor/plan.md` §2 T-A10 AC.
- **Проблема:** «≥ 30 файлов в `docs/specs/`» — оценка; реальный счёт зависит от того, какие файлы фактически описывают удалённые команды.
- **Влияние:** low — оценка; T-A10 уточнит на старте.
- **Рекомендация:** T-A10 первым шагом — `find docs/specs -name '*.md' | xargs grep -l 'wolf learn\|Sandbox Replay\|STOP-гейт' | wc -l` для точного числа.
- **Блокирует:** нет.

## SUMMARY

0 critical / 0 major / 2 minor

## VERDICT

**APPROVED**

L0-утверждённый пакет design/plan/test-plan прошёл формальную веригикацию. Все REQ-01..05 + NFR-01..05 покрыты. ADR-7..10 не противоречат L0-решениям. Write sets для параллельных T-A9/T-A11/T-B0 изолированы. Сценарии S-01..S-90 даны с oracle. Risk register полный. Минорные находки F-01/F-02 не блокируют старт реализации.

## Дальнейшие шаги

1. **T-A9 / T-A11 / T-B0** — запуск воркеров-имплементеров в 3 worktree'ах (`.worktrees/2.18.0-a9`, `.worktrees/2.18.0-a11`, `.worktrees/2.18.0-b0`).
2. **T-STEW** — запуск Стюарда в фоне для агрегации 4 зрелых уроков.
3. **T-A10** — после T-A9 + T-B0.
4. **T-INT** — после всех 4 задач; L1 + reviewer.
5. **T-REL** — после T-INT; L0 финально аппрувит npm publish.

Минорные находки F-01/F-02 — для исполнителей T-A11/T-A10 (уточнение на старте задачи).
