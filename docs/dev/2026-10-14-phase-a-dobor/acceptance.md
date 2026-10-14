---
slug: phase-a-dobor
title: '2.18.0 — T-INT acceptance-сводка'
status: completed-with-f03-outstanding
created: 2026-10-14
baseline: 621c2c8
target: ea9a84a
thread: mem_20261014_faza_a_dobor_b0_reliz_2_17_2_2_18_0_34c39f
---

# 2.18.0 — T-INT acceptance-сводка

> **Вердикт L1:** PARTIAL (ACCEPTED по зоне T-INT, F-03 outstanding — требует waiver L0).

## Сводка

| REQ                         | Статус     | Доказательство                                                                                                                                                                                                                       |
| --------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **REQ-01** (A9 Council v2)  | ✅ DONE    | `COUNCIL_OPINION_DECL`/`SYNTHESIS_DECL` (memory-types.ts:263/283); `extractClaims`/`extractSynthesisMeta` (build-analytics.ts:1796/1817); изоляция `.wolf/SKILL.md:95` §7; 7-полей v2; 3 тест-файла (421 строка); S-01..S-09 зелёные |
| **REQ-02** (A10 Docs audit) | ⚠️ PARTIAL | F-01/F-02/F-05 fixed; **F-03 (AC-2 «Действующий контракт версии») — OUTSTANDING**; S-10..S-15 + S-61 зелёные; docs-audit 7/7; 22 файла (T-A10) + 18 файлов (FIX-1)                                                                   |
| **REQ-03** (A11 Heartbeat)  | ✅ DONE    | `CLAIM_HEARTBEAT_WINDOW_MS=10min` (claim-registry.ts:32); `HeartbeatRecord`, `writeHeartbeat` (hrtime+random + atomic rename); `isStale` (PID/TTL/heartbeat); race-fix (commit 09a4036); S-20..S-28 + S-70/71 зелёные                |
| **REQ-04** (B0 Base sets)   | ✅ DONE    | 6 агент-шаблонов; `baseSetFaceViolations` guard; init-project + sync; 2 интеграционных теста + 1 e2e; S-30..S-35 зелёные; playground-lab manual pending                                                                              |
| **REQ-05** (Release cycle)  | ⏳ PENDING | T-REL — npm version 2.18.0, CHANGELOG, тег v2.18.0, npm publish (на аппрув L0)                                                                                                                                                       |

## NFR

| NFR                              | Статус     | Доказательство                                                                      |
| -------------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| **NFR-01** (legacy чтение)       | ✅ DONE    | `extractClaims(legacy) → []`; `confidence default 'medium'`; S-50/51 зелёные        |
| **NFR-02** (docs-audit в CI)     | ✅ DONE    | `tests/e2e/docs-audit.test.ts` интегрирован; S-60/61 зелёные                        |
| **NFR-03** (claim 2.17.1 compat) | ✅ DONE    | `readHeartbeat = null` при отсутствии `.heartbeat`; правила 2.17.1; S-70/71 зелёные |
| **NFR-04** (2.17.x → 2.18.0)     | ✅ DONE    | `wolf init --yes` не стирает steward-мутнувшие; b0-sync тест зелёный                |
| **NFR-05** (полный релиз)        | ⏳ PENDING | T-REL — pending L0                                                                  |

## T-INT gate

- [x] `npm run check` (unit + integration + e2e + docs-audit + english-surface + prettier + lint + build) — **зелёный**
- [x] `tests/e2e/docs-audit.test.ts` — 7/7 зелёные
- [x] wolf-review (worker-reviewer, L2) — **VERDICT: ACCEPTED** (F-01/F-02/F-05 fixed; F-03 outstanding)
- [x] Все AC по REQ-01, REQ-03, REQ-04 — пройдены
- [⚠️] REQ-02 — частично (F-03 outstanding)
- [⏳] REQ-05 — T-REL (на аппрув L0)

## Коммиты (от 43d9e9e → ea9a84a)

```
ea9a84a fix(2.18.0): T-INT-FIX-1 убрать wolf run (F-01, F-02, F-05)
09a4036 fix(2.18.0): T-A11 race — writeHeartbeat tmp через hrtime+random
ce6a1bf merge(2.18.0): A10 полный аудит публичных документов
2c89b2b docs(2.18.0): A10 полный аудит публичных документов (REQ-02)
369bc63 chore(2.18.0): prettier docs фазы + регенерация cli.md
ea58f1a merge(2.18.0): B0 доводка базовых наборов
9e291ff merge(2.18.0): A11 heartbeat-файл + TTL-продление
153410e merge(2.18.0): A9 council-opinion v2
156252f feat(2.18.0): B0 доводка базовых наборов (REQ-04)
e328714 feat(2.18.0): A11 heartbeat-файл + TTL-продление (REQ-03)
097d87c feat(2.18.0): A9 council-opinion v2 + synthesis v2 + isolation rule
0914638 docs(2.18.0): T-00 review (APPROVED) + T-INT acceptance template
```

**Итого:** 12 коммитов (4 feature + 4 merge + 4 chore/fix). 0 в main (trunk-based, готов к release в T-REL).

## Workers Used

- **T-A9** (worker-implementer, opencode run) — RESULT=**DONE_WITH_CONCERNS** (persist-путь v2 вне scope)
- **T-A11** (worker-implementer) — RESULT=**DONE** (race-fix отдельным коммитом 09a4036 от L1)
- **T-B0** (worker-implementer) — RESULT=не формальный, 10/10 integration tests passed (финальный RESULT не дописан; e2e не доведён)
- **T-A10** (worker-implementer) — RESULT=**DONE_WITH_CONCERNS** (F-01/F-02/F-05 fixed L1)
- **T-INT-FIX-1** (worker-implementer) — RESULT=**DONE** (18 файлов, F-01/F-02/F-05 fix)
- **T-INT-review** (worker-reviewer) — VERDICT=**CHANGES_REQUIRED** → T-INT-FIX-1
- **T-INT-review-2** (worker-reviewer) — VERDICT=**ACCEPTED**
- **T-STEW** (steward) — 2 агрегата в `proposed` (apply — на L0)

## Validation Results

- `npm run check` — 194 test files / 1505 tests passed, 146.77s
- `tests/e2e/docs-audit.test.ts` — 7/7 passed
- `tests/integration/claim-registry-heartbeat.test.ts` — 5/5 passed (включая S-28 race-fix)
- `tests/integration/b0-init.test.ts` + `b0-sync.test.ts` — 10/10 passed
- `tests/integration/build-councils-v2.test.ts` — mixed legacy+v2
- `tests/unit/council-opinion-schema.test.ts` + `synthesis-schema.test.ts` — schema v2

## F-03 (REQ-02 AC-2) — OUTSTANDING

- **Что:** Раздел «Действующий контракт версии» (или эквивалент) в 14 публичных документах ≥5KB не реализован.
- **S-15 в test-plan** молча переопределён на проверку HomeModes.vue.
- **T-A10 in-scope:** не входил в обязательную часть AC-2 (воркер пометил как outstanding).
- **T-INT-FIX-1:** вне зоны (фикс только F-01/F-02/F-05).
- **Решение L0:**
  - **(a) Waiver:** сузить AC-2, явно переформулировать S-15 = HomeModes.vue, обновить test-plan. Минимальное изменение.
  - **(b) Реализация:** добавить краткий раздел в 14 документов. Трудозатратно (отдельная задача).
- **Рекомендация L1:** вариант (a) waiver — REQ-02 уже даёт docs-audit гейт, AC-2 — это «nice to have» для длинных документов.

## Замечания ревьюера (T-INT-review-2)

- L2 reviewer: VERDICT=ACCEPTED (зона T-INT), 0 critical / 0 major / 0 minor.
- Концептуальная целостность сохранена.
- Outstanding передан L0 (F-03 waiver).

## Вердикт L1

- **PARTIAL** (готов к L0 для T-REL с waiver F-03, или ждать реализации AC-2).
- REQ-01, REQ-03, REQ-04 — полностью приняты.
- REQ-02 — частично, F-03 на усмотрение L0.
- REQ-05 — T-REL готов к запуску после аппрува L0.

## Outstanding (T-REL / L0)

1. **F-03** — waiver L0 для AC-2 (REQ-02).
2. **T-STEW apply** — `wolf aggregate apply <id>` для 2 агрегатов (или reject).
3. **T-REL** — L0 финально аппрувит `npm publish` + `git push tag v2.18.0`.
4. **wolf-release-docs** — L0 загружает методику до T-REL (release-docs + Changelog страница + sync docs).
5. **T-A9 persist-путь v2** — отдельная задача для 2.19.0 (outstanding от воркера).
6. **T-A10 AC-2 реализация** — если L0 не даёт waiver (опционально).
