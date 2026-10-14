---
slug: phase-a-dobor
title: '2.18.0 — Фаза A добор + B0 — план задач'
status: review
created: 2026-10-14
requirements: docs/dev/2026-10-14-phase-a-dobor/requirements.md
design: docs/dev/2026-10-14-phase-a-dobor/design.md
test-plan: docs/dev/2026-10-14-phase-a-dobor/test-plan.md
review: pending
---

# 2.18.0 — Фаза A добор + B0 — план задач

> **Методика:** `wolf-plan`. План готов к исполнению после утверждения design/test-plan через wolf-review.
> **Параллелизм (L0):** A9, A11, B0 — параллельно в worktrees; A10 — после A9/B0; REQ-05 — финал.

## 1. Сводная таблица (чеклист)

| # | task_id | Что | Статус | Зависимости | Worktree | Трудозатраты |
|---|---|---|---|---|---|---|
| 0 | T-00 | wolf-review design.md + test-plan.md | TODO | — | `.worktrees/2.18.0` | 1 цикл ревью |
| 1 | T-A9 | REQ-01 — A9 Council-контракт v2 | TODO | T-00 | `.worktrees/2.18.0-a9` | L2 worker ×1 |
| 2 | T-A11 | REQ-03 — A11 Heartbeat-файл | TODO | T-00 | `.worktrees/2.18.0-a11` | L2 worker ×1 |
| 3 | T-B0 | REQ-04 — B0 Доводка базовых наборов | TODO | T-00 | `.worktrees/2.18.0-b0` | L2 worker ×1 |
| 4 | T-A10 | REQ-02 — A10 Аудит документов | TODO | T-A9, T-B0 (нужны финальные формулировки в README/concept) | `.worktrees/2.18.0-a10` | L2 worker ×1 |
| 5 | T-INT | Интеграция + полный прогон + wolf-review | TODO | T-A9, T-A10, T-A11, T-B0 | `.worktrees/2.18.0` | L1 + L2 reviewer |
| 6 | T-REL | REQ-05 — Релизный цикл (L0 wolf-release-docs) | TODO | T-INT | `.worktrees/2.18.0` | L0 + L1 support |
| 7 | T-STEW | Фон: Стюард агрегирует 4 зрелых урока | TODO | — | main | отдельный (L0) |

**Параллельная фаза:** T-A9, T-A11, T-B0 — три worktree'а, разные write sets, общий wolf-память только через `wolf promote` (не в этой поставке).

**Точка синхронизации:** T-INT объединяет результаты и запускает полный прогон (`npm run check` + `tests/e2e/**`).

## 2. TASK-карточки (using-skills)

### T-00 — wolf-review design + test-plan

- **Цель:** независимый L2-ревьюер (worker-reviewer) проверяет design.md и test-plan.md против approved requirements.md; вердикт по контракту `VERDICT/SUMMARY`.
- **AC:**
  - Все REQ-01..05 покрыты компонентами (design §2) и сценариями (test-plan §2).
  - ADR-7..10 не противоречат L0-решениям.
  - NFR-01..05 имеют сценарии (S-50..S-90).
  - Калибровка heartbeat-окна (10 мин) и `CLAIM_TTL_MS` (24h) явно зафиксированы.
  - Worktree-стратегия и параллелизм — безопасно.
- **baseline:** 621c2c8.
- **cwd/worktree:** `.worktrees/2.18.0`.
- **allowlist записи:** `docs/dev/2026-10-14-phase-a-dobor/review-*.md`.
- **Зависимости:** —
- **Ссылки:** design.md, test-plan.md, requirements.md.
- **Проверки:** review-отчёт по `VERDICT/SUMMARY`.
- **Ожидаемый RESULT:** `VERDICT: ACCEPTED` или `CHANGES_REQUIRED` (с finding IDs).

### T-A9 — REQ-01 (A9 Council-контракт v2)

- **Цель:** расширить `council-opinion` (7 полей) и `synthesis` (5 полей); изоляция — правило процесса.
- **AC:**
  - `src/domain/memory-types.ts` обновлён: `claims` required min 1 для `council-opinion`; `accepted_claims` required min 1 для `synthesis`.
  - `Confidence` (`low|medium|high`) использован для `confidence` в обоих типах.
  - `src/app/use-cases/build-analytics.ts`: `extractClaims`, `extractSynthesisMeta`; legacy fallback `[]` / `'medium'`.
  - `.wolf/SKILL.md`: добавлен §X «Изоляция формирования мнений».
  - `templates/base/skills/wolf-brainstorm/SKILL.md` (если применимо): обновлён формат.
  - Тесты S-01..S-09 (test-plan §3) — все зелёные.
- **baseline:** 621c2c8.
- **cwd/worktree:** `.worktrees/2.18.0-a9` (от `feature/2.18.0` после T-00 → rebase).
- **allowlist записи:** `src/domain/memory-types.ts`, `src/app/use-cases/build-analytics.ts`, `tests/unit/council-opinion-schema.test.ts`, `tests/unit/synthesis-schema.test.ts`, `tests/integration/build-councils-v2.test.ts`, `.wolf/SKILL.md`, `templates/base/skills/wolf-brainstorm/SKILL.md`.
- **Зависимости:** T-00.
- **Ссылки:** design.md §3.1 + ADR-8, ADR-9; test-plan S-01..S-09.
- **Проверки:** `npm run test:unit` (новые тесты), `npm run test:integration`, manual grep `.wolf/SKILL.md`.
- **Ожидаемый RESULT:** DONE + tests зелёные + diff в указанном allowlist.

### T-A11 — REQ-03 (A11 Heartbeat-файл)

- **Цель:** heartbeat-файл продлевает жизнь claim; обратная совместимость с 2.17.1.
- **AC:**
  - `src/adapters/fs/claim-registry.ts`: `heartbeatFilePath`, `readHeartbeat`, `writeHeartbeat`, расширенный `isStale(rec, hb, deps)`.
  - `CLAIM_HEARTBEAT_WINDOW_MS = 10 * 60 * 1000` (новый export).
  - `acquireClaim` использует расширенный `isStale`; `requireClaim` — без изменений в семантике (проверяет stale + ownership).
  - `src/app/use-cases/claim-artifact.ts`: `heartbeatArtifactClaim(deps, artifact)` (use-case).
  - `src/adapters/cli/commands/claim.ts` (или новый): `wolf claim heartbeat <artifact>` (опционально, для ручного продления).
  - Тесты S-20..S-28 (test-plan §3) — все зелёные.
  - NFR-03 подтверждён (S-70, S-71).
- **baseline:** 621c2c8.
- **cwd/worktree:** `.worktrees/2.18.0-a11`.
- **allowlist записи:** `src/adapters/fs/claim-registry.ts`, `src/app/use-cases/claim-artifact.ts`, `src/adapters/cli/commands/claim.ts` (или новый `wolf-claim-heartbeat.ts`), `tests/unit/claim-heartbeat.test.ts`, `tests/integration/claim-registry-heartbeat.test.ts`.
- **Зависимости:** T-00.
- **Ссылки:** design.md §3.3 + ADR-7; test-plan S-20..S-28, S-70, S-71.
- **Проверки:** `npm run test:unit`, `npm run test:integration`.
- **Ожидаемый RESULT:** DONE + tests зелёные + diff в allowlist.

### T-B0 — REQ-04 (B0 Доводка базовых наборов)

- **Цель:** довести базовые наборы до публикации; проверить `owner_skill`; совместимость с 2.17.x.
- **AC:**
  - `templates/base/agents/*.md` синхронизированы с реальной ролью (mode/model/tools).
  - `src/app/use-cases/init-project.ts`: проверка `face_owner_skill === agent_id` (тест или runtime-assert).
  - `src/app/use-cases/sync-base-set.ts`: гарантия «не перезаписывать локальные мутации» (NFR-04).
  - `src/app/use-cases/scaffold-agent.ts`: создаёт лицо с `owner_skill === <agent_id>`.
  - E2E на playground-lab (S-33) — зелёный.
  - Smoke на 2.17.x → 2.18.0 (S-35) — без потерь.
  - Тесты S-30..S-32, S-34 — все зелёные.
- **baseline:** 621c2c8.
- **cwd/worktree:** `.worktrees/2.18.0-b0`.
- **allowlist записи:** `templates/base/**`, `src/app/use-cases/init-project.ts`, `src/app/use-cases/sync-base-set.ts`, `src/app/use-cases/scaffold-agent.ts`, `tests/integration/b0-init.test.ts`, `tests/e2e/b0-playground.test.ts`.
- **Зависимости:** T-00.
- **Ссылки:** design.md §3.4; test-plan S-30..S-35, S-80.
- **Проверки:** `npm run test:integration`, `npm run test:e2e` (с реальным playground-lab).
- **Ожидаемый RESULT:** DONE + tests зелёные + diff в allowlist.

### T-A10 — REQ-02 (A10 Аудит публичных документов)

- **Цель:** docs-audit-тест в CI + правки 4 ключевых файлов + frontmatter в спецификациях.
- **AC:**
  - `tests/e2e/docs-audit.test.ts` создан; S-10..S-15, S-60, S-61 — зелёные.
  - `README.md`, `README.ru.md`, `docs/concept/concept.md`, `docs/README.md` — вычищены ссылки на удалённые команды.
  - Счётчик «25 типов» заменён на «8 core + расширения».
  - `docs/concept/concept.md` — добавлен раздел «Действующий контракт v2.18.0» в начало.
  - `docs/superpowers/specs/*.md` (≥ 30 файлов) — frontmatter `historical: true` (только описывающие удалённые команды).
  - `docs/superpowers/plans/roadmap-v2.md` и аналогичные — frontmatter `historical: true`.
- **baseline:** merge T-A9 + T-A11 + T-B0 → T-A10 стартует от интегрированного state.
- **cwd/worktree:** `.worktrees/2.18.0-a10` (после интеграции промежуточных результатов).
- **allowlist записи:** `tests/e2e/docs-audit.test.ts`, `README.md`, `README.ru.md`, `docs/concept/concept.md`, `docs/README.md`, `docs/superpowers/specs/*.md` (только frontmatter), `docs/superpowers/plans/*.md` (только frontmatter), `docs/dev/INDEX.md`.
- **Зависимости:** T-A9, T-B0 (нужны финальные формулировки A9-полей и B0-агентов, чтобы корректно отразить в README/concept).
- **Ссылки:** design.md §3.2; test-plan S-10..S-15, S-60, S-61.
- **Проверки:** `npm run check` (включает docs-audit), `npm run test:e2e` (S-10..S-15).
- **Ожидаемый RESULT:** DONE + docs-audit-тест в CI зелёный + manual S-15 пройден.

### T-INT — Интеграция + полный прогон

- **Цель:** объединить T-A9/T-A10/T-A11/T-B0 в `feature/2.18.0`; полный прогон проверок; ревью интеграции.
- **AC:**
  - Все 4 ветки влиты в `feature/2.18.0` через rebase + merge; конфликты разрешены по смыслу.
  - `npm run check` (unit + integration + e2e + docs-audit) — все зелёные.
  - `wolf doctor` — зелёный на текущем репозитории.
  - Acceptance-сводка по каждому REQ-01..04 с evidence.
  - wolf-review независимым reviewer: соответствие (requirements ↔ реализация) + качество (code review, безопасность, NFR).
- **Порядок:**
  1. Rebase каждой worktree-ветки на `feature/2.18.0` (L1).
  2. Merge в `feature/2.18.0` (порядок: A9 + A11 + B0 → A10 → INT).
  3. Прогон полного check.
  4. ACCEPTANCE-сводка (L1).
  5. wolf-review (worker-reviewer, независимый от исполнителей T-A9/T-A11/T-B0).
- **Зависимости:** T-A9, T-A10, T-A11, T-B0.
- **allowlist записи:** merge commits, `docs/dev/2026-10-14-phase-a-dobor/acceptance.md`, `CHANGELOG.md` (черновик секции `## 2.18.0`).
- **Проверки:** full test run, `wolf doctor`, `npm run build`, `tsc --noEmit`.
- **Ожидаемый RESULT:** ACCEPTED-by-L1 (для передачи L0).

### T-REL — REQ-05 (Релизный цикл 2.18.0)

- **Цель:** полный релизный цикл по wolf-release-docs.
- **AC:**
  - S-40..S-45 (test-plan §3) — все manual пройдены.
  - `package.json` = `2.18.0`; `git tag v2.18.0`; `npm publish` — успешно.
  - Сайт собран + задеплоен; страница Changelog синхронизирована.
  - `CHANGELOG.md` — секция `## 2.18.0`.
  - `docs/superpowers/plans/roadmap-v3.md` — обновлён.
  - L0 принимает по ACCEPTANCE.
- **Зависимости:** T-INT.
- **Процедура:** L0 грузит wolf-release-docs (правило `mem_20261013_podgotovka_versii_wolf_k_vypusku_snachal_ce1a8f`); L1 — исполнитель шагов.
- **Ожидаемый RESULT:** релиз 2.18.0 опубликован.

### T-STEW — Фон: агрегация 4 зрелых уроков (Стюард)

- **Цель:** Стюард агрегирует 4 зрелых урока (см. `mem_20261014_styuard_fonovyy_zapusk_agregatsii_4_zrel_7a8608`); если найдёт конфликты с A9/A11 — возвращает наверх.
- **AC:**
  - Запуск: `opencode run --agent steward --input '<id-уроков>'` или эквивалент (вне worktree).
  - Отчёт Стюарда зафиксирован в Wolf (decision или note).
  - Конфликты с A9/A11 — отдельный thread/blocker, не правится молча.
- **Параллельность:** может идти в фоне параллельно с T-A9..T-B0 (отдельная ветка/сессия).
- **Зависимости:** — (тред Стюарда — отдельный контур).
- **Ожидаемый RESULT:** агрегация завершена; если есть конфликты — уведомление L0.

## 3. Зависимости (граф)

```
T-00 (review)
   │
   ├─ T-A9  ──┐
   ├─ T-A11 ──┤
   └─ T-B0  ──┤
              │
              └─ T-A10  (зависит от A9 + B0)
                    │
                    └─ T-INT (все 4)
                          │
                          └─ T-REL

T-STEW — независимая ветка.
```

## 4. Параллелизм и безопасность

- **Изоляция write sets:**
  - T-A9 — `src/domain/memory-types.ts`, `src/app/use-cases/build-analytics.ts`, `.wolf/SKILL.md`, `templates/base/skills/wolf-brainstorm/SKILL.md`, `tests/**`.
  - T-A11 — `src/adapters/fs/claim-registry.ts`, `src/app/use-cases/claim-artifact.ts`, `src/adapters/cli/commands/claim.ts`, `tests/**`.
  - T-B0 — `templates/base/agents/**`, `src/app/use-cases/init-project.ts`, `src/app/use-cases/sync-base-set.ts`, `src/app/use-cases/scaffold-agent.ts`, `tests/**`.
  - T-A10 — `docs/**` (read+write), `tests/e2e/docs-audit.test.ts`.
- **Общие файлы:** нет (между A9/A11/B0 — ни одного общего файла).
- **T-A10 стартует от интегрированного state** T-A9 + T-B0 (нужны финальные формулировки).
- **Claim'ы:** T-A9/T-A11/T-B0 — каждый в своём worktree, не пишут в общий `wolf/shared/claims/`; при необходимости — `wolf promote` (вне scope 2.18.0).
- **Тесты:** изолированные tmp-каталоги; `npm run test:integration` и `e2e` — параллельно (витест-воркеры), если профиль это позволяет.

## 5. Интеграция (T-INT) — детально

1. **Сборка интегрированной ветки:**
   - L1: `git checkout feature/2.18.0 && git merge feature/2.18.0-a9 feature/2.18.0-a11 feature/2.18.0-b0` (или rebase per worktree).
   - Конфликты: разрешать по смыслу, не выбирать сторону автоматически.
2. **T-A10 rebase:** поверх интегрированного state.
3. **Полный прогон:**
   - `npm run build` (или `tsc --noEmit` + bundle, по профилю).
   - `npm run check` (unit + integration + e2e + docs-audit).
   - `npm run test:e2e` (Playwright, если есть).
   - `wolf doctor` — зелёный.
4. **ACCEPTANCE-сводка:** по каждому REQ-01..04 — evidence (commit SHA, test IDs, логи).
5. **wolf-review:** worker-reviewer (независимый от T-A9..T-B0) → `VERDICT: ACCEPTED` или `CHANGES_REQUIRED`.

## 6. Risk register

| Риск | Вероятность | Митигация |
|---|---|---|
| Конфликт A9 ↔ A11 ↔ B0 при интеграции | низкая | write sets изолированы; L1 разрешает по смыслу |
| Playground-lab в дрейфе (S-33/S-35) | средняя | smoke-тест; пометить skipped, не блокировать релиз (если не критично) |
| Heartbeat-окно (10 мин) плохо откалибровано | низкая | L0-дефолт; первая версия зафиксирована; калибровка в будущих релизах |
| Confidence default `'medium'` для legacy маскирует проблемы | низкая | build-analytics выводит `audited_count`; в Wolf — отдельная метрика |
| Docs-audit false positives (архивные ссылки) | средняя | `ALLOWED_CONTEXT` regex; manual review S-15 |
| Стюард (T-STEW) находит конфликт с A9/A11 | низкая | возвращает наверх через L0; не правит молча |

## 7. Трекинг (L1 чекбоксы)

После T-INT — каждый T-A9/T-A10/T-A11/T-B0 отмечается `[x]` в `## 1. Сводная таблица` с revision/evidence (commit SHA, test run).

## 8. Сверка с test-plan

- Все сценарии S-01..S-90 (test-plan §3) входят в задачи T-A9..T-REL.
- NFR-01..05 — derived scenarios S-50..S-90.
- Прогон: `npm run check` (unit + integration + e2e + docs-audit).

## 9. Готовность к исполнению

- ✅ Все REQ/NFR покрыты задачами.
- ✅ Зависимости и параллелизм определены.
- ✅ Worktree-стратегия безопасна (изолированные write sets).
- ✅ Интеграционная задача (T-INT) и релиз (T-REL) выделены.
- ✅ Risk register зафиксирован.
- Следующий шаг: wolf-review (T-00) → wolf-sdd (исполнение).
