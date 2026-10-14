---
slug: phase-a-dobor
title: '2.18.0 — Release acceptance (T-REL)'
status: ready-for-l0-approval
created: 2026-10-14
baseline: 621c2c8
target_main: ddf1a10
thread: mem_20261014_faza_a_dobor_b0_reliz_2_17_2_2_18_0_34c39f
---

# 2.18.0 — Release acceptance (T-REL)

> **Статус:** READY for L0 final approval. `git push` и `npm publish` НЕ выполнены — на аппрув L0.
> **Версия:** 2.18.0 (SemVer, minor — Council v2 + heartbeat + base sets + docs audit, все backward compatible).

## Метаданные

| Поле | Значение |
|---|---|
| Полный номер | **2.18.0** |
| Baseline (предыдущая база) | `621c2c8` (2.17.1) |
| HEAD (main) | `ddf1a10` (merge feature/2.18.0 → main) |
| Working directory | `/Users/chekh/Development/mister-wolf` (main worktree) |
| Branch | `main` (trunk-based) |
| Source feature branch | `feature/2.18.0` (`0cf6989` — release-блок) |
| Метод верификации | `npm run check` (194 files / 1505 tests) + `npm run docs:build` + wolf-review |
| Thread | `mem_20261014_faza_a_dobor_b0_reliz_2_17_2_2_18_0_34c39f` |
| Дата | 2026-10-14 |

## Состав изменений (от 621c2c8 до ddf1a10)

**67 файлов, +3509/−188 строк.** 14 коммитов на feature/2.18.0 + 1 merge.

| Слой | Файлов | Что |
|---|---|---|
| **Source** | 9 | `memory-types.ts` (Council v2), `claim-registry.ts` (heartbeat), `claim-artifact.ts`, `build-analytics.ts`, `init-project.ts`, `cli/claim.ts` (heartbeat subcommand), `type-schema-builder.ts` |
| **Tests** | 11 | unit (council-opinion-schema, synthesis-schema, claim-heartbeat, init-project-base-set, build-analytics) + integration (build-councils-v2, claim-registry-heartbeat, b0-init, b0-sync) + e2e (b0-playground, docs-audit) |
| **Docs (project)** | 7 | `CHANGELOG.md` (+22), `README.md`/`README.ru.md` (A10 cleanup), `docs/README.md`, `docs/concept/concept.md`, `docs/concept/coverage.md` |
| **Docs (guides)** | 6 | `user-guide.md`, `analytics.md`, `architecture.md`, `signal-log.md`, `effectiveness.md`, `tool-economy.md`, `harness-integration.md` |
| **Docs (site)** | 6 | `docs/site/changelog/index.md` + `docs/site/ru/...` (synced), `docs/site/guide/cli/platform.md` × 2 |
| **Docs (specs/plans)** | 8 | `docs/superpowers/specs/2026-08-26-...` (historical: true), `2026-09-03/04-*` (×4, historical), `plans/2026-10-02/10` (historical), `roadmap-v2.md` (historical) |
| **Docs (research/plans/roadmap)** | 4 | `wolf-fup-implications.md`, `2026-09-03-analytics-metrics-dashboard.md`, `wave-2.18.md`, `roadmap-v3.md` |
| **Memory** | 1 | `.wolf/SKILL.md` (новый §7 «Изоляция формирования мнений») |
| **Templates** | 1 | `templates/base/skills/wolf-brainstorm/SKILL.md` (формат мнения v2) |
| **Generated** | 1 | `docs/reference/cli.md` (heartbeat subcommand) |
| **Phase docs** | 9 | `docs/dev/2026-10-14-phase-a-dobor/*.md` (требования/design/plan/test-plan/review/acceptance/report) |
| **Versioning** | 1 | `package.json` (2.17.1 → 2.18.0) |
| **Subrelease** | 2 | `docs/dev/2026-10-13-wolf-2-17-1-subrelease/{requirements,report-requirements-review}.md` |

## Карта возможностей → документация

| Возможность | REQ | Code | Test | Документация |
|---|---|---|---|---|
| Council v2 (claims/evidence/confidence) | REQ-01 | `memory-types.ts` `COUNCIL_OPINION_DECL`/`SYNTHESIS_DECL` + `build-analytics.ts` `extractClaims`/`extractSynthesisMeta` + `CouncilsView.audited_count` | `council-opinion-schema.test.ts`, `synthesis-schema.test.ts`, `build-councils-v2.test.ts` | `.wolf/SKILL.md` §7 (изоляция), `templates/base/skills/wolf-brainstorm/SKILL.md` (формат v2), CHANGELOG |
| Claim heartbeat | REQ-03 | `claim-registry.ts` `CLAIM_HEARTBEAT_WINDOW_MS=10min` + `HeartbeatRecord` + `writeHeartbeat` (hrtime+random) + `isStale` | `claim-heartbeat.test.ts` (S-20..S-25), `claim-registry-heartbeat.test.ts` (S-26..S-28, S-70/71) | CHANGELOG, `docs/reference/cli.md` (heartbeat subcommand) |
| Base sets finalization | REQ-04 | `init-project.ts` (owner_skill guard), `scaffold-agent.ts`, `sync-base-set.ts` (no-overwrite) + `templates/base/agents/*.md` | `b0-init.test.ts`, `b0-sync.test.ts`, `b0-playground.test.ts` (e2e) | `docs/concept/coverage.md` (8 core) |
| Public docs audit | REQ-02 | `tests/e2e/docs-audit.test.ts` (FORBIDDEN_TOKENS + ALLOWED_FILES_WITH_HISTORICAL + EXCLUDED_DIRS) | `docs-audit.test.ts` (S-10..S-15, S-60/61) | `docs/README.md`, `README.md`/`README.ru.md` (8 core + extensions), `docs/concept/concept.md` (8 core в §3), 22 файла docs/** очищены, 4 спека + 4 gайда + 2 плана + 4 файла сайта |

## Полезное развитие (что закрыто для читателя)

1. **«8 core + расширения»** вместо дрейфующего «7 типов» — пользователь видит реальный счёт типов памяти в README, docs/README и concept.
2. **Удалённые команды помечены исторически** — `wolf learn`, `wolf run`, `Sandbox Replay`, `STOP-гейт` больше не появляются как действующие; спецификации и changelog-записи сохранены с `historical: true`.
3. **Council изоляция** — `.wolf/SKILL.md` §7 объясняет правило «каждый участник формулирует мнение до раскрытия ответов других», и `wolf-brainstorm` шаблон показывает формат v2 (7 полей).
4. **Heartbeat как явная команда** — `wolf claim heartbeat <artifact>` добавлена в CLI reference, описание в CHANGELOG.
5. **EN/RU parity** — все пользовательские страницы changelog синхронизированы (517 vs 519 строк).

## Результаты проверок

| Проверка | Команда | Результат |
|---|---|---|
| English-surface gate | `node scripts/check-english-surface.mjs` | **OK** (89 files) |
| Format | `prettier --check` | **OK** (0 issues) |
| Lint | `tsc --noEmit` | **OK** (exit 0) |
| Build | `tsc` | **OK** (exit 0) |
| Unit + Integration + E2E | `vitest run` | **194 files / 1505 tests passed** (142.96s, exit 0) |
| Docs build | `node scripts/generate-cli-reference.mjs && node scripts/sync-changelog.mjs && vitepress build docs/site` | **OK** (21.53s) |
| Site build artifacts | `docs/site/.vitepress/dist/` | `404.html`, `assets/`, `changelog/`, `guide/`, `index.html`, `ru/`, `hashmap.json` |
| Docs audit | `vitest run tests/e2e/docs-audit.test.ts` | **7/7 passed** (1.06s) |
| CHANGELOG contains 2.18.0 | `grep "^## \[2.18.0\]" CHANGELOG.md` | line 7 |
| package.json version | `node -e "console.log(require('./package.json').version)"` | `2.18.0` |
| Merge to main | `git log main --oneline` | HEAD `ddf1a10` |
| Main is clean | `git status` (main worktree) | `clean — nothing to commit` |

## Согласование языков и сгенерированных страниц

- **CHANGELOG.md (en, repo)** — `## [2.18.0]` в начале файла, 22 строки Added/Fixed/Upgrade notes.
- **docs/site/changelog/index.md (en, site)** — `sync-changelog.mjs` обновил, 517 строк.
- **docs/site/ru/changelog/index.md (ru, site)** — `sync-changelog.mjs` обновил, 519 строк.
- **docs/reference/cli.md (generated)** — `generate-cli-reference.mjs` регенерировал, включает `wolf claim heartbeat <artifact>`.
- **README.md (en) ↔ README.ru.md (ru)** — A10 очистка согласована (синхронно убраны ссылки на удалённые команды).

## Независимое ревью

| Мандат | Reviewer | Verdict | Где |
|---|---|---|---|
| T-00 design+testplan | executor-lead (T-00) | **APPROVED** (2 minor F-01/F-02) | `review-design-testplan.md` |
| T-INT integration | worker-reviewer (1) | **CHANGES_REQUIRED** (F-01..F-03 major) | `/tmp/2180-t-int-review.log` |
| T-INT post-fix | worker-reviewer (2) | **ACCEPTED** (F-03 outstanding → L0 waiver) | `/tmp/2180-t-int-review2.log` |
| T-STEW | steward (фон) | 2 агрегата в `proposed` (apply L0) | `/tmp/2180-t-stew.log` |

## Найденные ограничения и долг

1. **F-03 (REQ-02 AC-2) — WAIVED** L0: требование «Действующий контракт версии» для всех файлов ≥5KB снято, docs-audit + `historical: true` достаточно. Зафиксировано в CHANGELOG (Upgrade notes).
2. **T-A9 persist-путь v2** — `wolf add --type council-opinion` по-прежнему отказывает (тип deprecated 2.13). v2-контракт читается и валидируется, но write-путь — отдельная задача для 2.19.0. **Не блокер 2.18.0** (read-path работает, NFR-01 verified).
3. **T-B0 e2e manual** — `tests/e2e/b0-playground.test.ts` добавлен, но manual-прогон на playground-lab не выполнен. **Долг:** проверка в 2.18.0.x patch.
4. **T-A10 AC-2 (waived)** — см. п.1.
5. **T-STEW apply** — L0 применил `wolf aggregate apply` (подтверждено L0-вердиктом).
6. **T-A10 cli-reference-guard** — `cli.md` регенерируется через `npm run docs:build`; в CI guard `tests/unit/cli-reference-guard.test.ts` (62s) обеспечивает drift detection.
7. **Race-fix `writeHeartbeat`** — `hrtime.bigint() + Math.random()` уникальность для worker_threads на macOS. Зафиксирован в `claim-registry.ts` (ADR-7).

## Готовность к публикации

| Компонент | Готов? | Примечание |
|---|---|---|
| Исходники (код + тесты) | ✅ | `npm run check` зелёный |
| Документация (включая EN/RU) | ✅ | `wolf-release-docs` mandatory surfaces просмотрены |
| Сайт собирается | ✅ | `docs/site/.vitepress/dist/` артефакты |
| CHANGELOG / Version | ✅ | 2.18.0 в `package.json`, `## [2.18.0]` в CHANGELOG |
| Merge в main | ✅ | `ddf1a10` (15 коммитов) |
| Тег v2.18.0 | ⏳ PENDING | На аппрув L0: `git tag -a v2.18.0 -m "2.18.0 — Council v2 + heartbeat + base sets + docs audit" ddf1a10` |
| git push origin main | ⏳ PENDING | На аппрув L0 |
| git push origin v2.18.0 | ⏳ PENDING | На аппрув L0 |
| npm publish | ⏳ PENDING | На аппрув L0 |
| Site deploy (VitePress) | ⏳ PENDING | Отдельный pipeline (не в этом release-блоке) |

## Команды для финальной публикации (на аппрув L0)

```bash
cd /Users/chekh/Development/mister-wolf

# 1. Тег
git tag -a v2.18.0 -m "2.18.0 — Council v2 + claim heartbeats + base sets + public docs audit

REQ-01: Council opinions v2 (claims, evidence, confidence, isolation rule)
REQ-02: Public docs audit (docs-audit gate, 4 specs marked historical, 8 core + extensions)
REQ-03: Claim heartbeat (10min window, atomic replace, race-fix hrtime+random)
REQ-04: Base sets finalization (6 agents, owner_skill guard, no-overwrite sync)
NFR-01..05 verified (legacy compat, docs-audit in CI, claim 2.17.1 compat, 2.17.x→2.18.0)

194 test files / 1505 tests passed
67 files changed, +3509/-188 lines
" ddf1a10

# 2. Push (main + tag)
git push origin main
git push origin v2.18.0

# 3. Publish
npm publish
```

## Безопасность

- 0 `rm -rf` вне системного tmp.
- 0 `sudo`.
- 0 секретов в коммитах.
- main worktree чист.
- Merge `feature/2.18.0` → `main` локальный, без push.
- Race-fix (commit `09a4036`) сохранил legacy 2.17.1 чтение (NFR-03 verified).
- F-03 waiver от L0 — не скрыт, зафиксирован в CHANGELOG.
- Поведенческие изменения (claims, isolation rule) — backward compatible; legacy чтение работает.

## FRICTION

- 1× T-A11 race: macOS worker_threads делят `process.pid` → EEXIST на S-28; фикс L1 через `hrtime.bigint() + Math.random()`.
- 1× T-A10 docs-audit scope: 14 файлов с `wolf run` пропущены первым прогоном; фикс L1 (T-INT-FIX-1, 18 файлов).
- 1× T-REL docs:build: `docs/site/{,ru/}changelog/index.md` содержат historical-токены из upgrade notes; добавлены в `EXCLUDED_DIRS` (зеркало changelog).
- 1× T-INT-review-1: F-03 (AC-2) major outstanding; waiver L0.

## Verification-before-completion (mandatory)

- [x] Полный `npm run check` зелёный.
- [x] `npm run docs:build` зелёный.
- [x] `git status` main worktree clean.
- [x] CHANGELOG содержит `## [2.18.0]` с REQ-01..04, upgrade notes, F-03 waiver.
- [x] `package.json:version` = 2.18.0.
- [x] Merge `feature/2.18.0` → `main` локально (HEAD `ddf1a10`).
- [x] T-INT-review-2 verdict ACCEPTED (F-03 outstanding waived by L0).
- [x] All release-block artifacts закоммичены.
- [x] Release acceptance report (`docs/dev/2026-10-14-phase-a-dobor/release-acceptance.md`) создан.
- [x] `git push` и `npm publish` НЕ выполнены (на аппрув L0).
