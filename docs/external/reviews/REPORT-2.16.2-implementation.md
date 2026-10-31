# REPORT wave-2.16.2 — implementation

**task_id**: wave-2.16.2 — версионная дисциплина в AGENTS.md + ремонт платформы v1→v2 в wolf doctor + wolf uninstall
**Роль**: L1 (executor-lead), режим FULL. Тред: mem_20261012_2_16_2_versionnaya_distsiplina_pereezd_o_87915b
**RESULT**: DONE
**Revision**: main = **3928af3** (baseline e44e5f8; 9 коммитов ff-merge; delta 9bc9eba..3928af3 — только docs/plan.md, гейты гонялись на 9bc9eba)

## Что сделано

- **REQ-01**: правило «Номер версии всегда полный X.Y.Z» в `templates/base/AGENTS.md`; доставка — штатный sync (существующие тесты стампов + V-1). Счётчик скиллов 19 не тронут (base-set-init tests).
- **REQ-02**: `wolf doctor` детектит «installed under v1, runtime v2» (`src/app/use-cases/platform-mismatch.ts`: installedSet — min set по wolf-sync-state с cross-check штампа, DUAL_SINCE='2.14.1', однонаправленность по ADR-1); проверка для зарегистрированных проектов и cwd. `wolf doctor --repair` = платформенная зона (syncBaseSet + writeConfig, гвард, --dry-run план с перечислением файлов, orphaned с рекомендацией) → storage-зона (прежняя). Легаси без sync-state — fallback-скан штампов (C-02).
- **REQ-03**: `wolf uninstall` — план по умолчанию (ноль записей), `--yes` исполняет, `--purge` стирает `.wolf/`. Владение: sync-state записи + cross-check штампа; fallback штампа при отсутствующем/пустом state; битый state — консервативно без скана (F-11). AGENTS.md/CLAUDE.md не удаляются (kept by design). Конфиги: `removeWolfKeys` (opencode: mcp.wolf + default_agent===mr-wolf + subagent_depth===2 — точные значения; claude: mcpServers.wolf). Пустые wolf-каталоги чистятся только при реальных удалениях. Подсказка `npm uninstall -g mister-wolf`. Идемпотентен.
- **Docs**: package.json 2.16.2, CHANGELOG [2.16.2], cli-reference + changelog-страницы сайта (RU/EN) регенерированы `docs:build`; тег/публикация/деплой не выполнялись.

## ACCEPTANCE (по брифу)

| AC | Статус | Evidence |
|---|---|---|
| AC1 REQ-1/2/3 реализованы, документы согласованы | **подтверждено** | docs/dev/2026-10-12-wave-2-16-2-platform-lifecycle/{requirements,design,plan,test-plan}.md (rev 3928af3); независимое ревью conformance: REQ-01/02/03, NFR-01/02 ✓ (раунд 1 + fix-верификация APPROVED) |
| AC2 AC требований по evidence | **подтверждено** | e2e v1→v2: tests/e2e/platform-repair.e2e.ts (doctor сообщает → --repair чинит → v2-маркер dual entry + mcp.wolf/default_agent/subagent_depth валидны → повторный doctor чист; dry-run без записей) — 3/3 зелёные; uninstall сценарии: unit U-1..U-14 + e2e U-10 (default/purge/dry-run/чужой контент/легаси/битый state) — зелёные |
| AC3 гейты зелёные на итоговом main | **подтверждено** | main 9bc9eba: `npm run check`=0 (english-surface OK, format, lint, build, test:run 1218+guard); `npx vitest run --maxWorkers=2 --minWorkers=1`=0 (163 файла, 1222 теста); `npx vitest run`=0 (1222); `npm run e2e`=0 (58 файлов, 214). Логи /tmp/m1.log–m4.log, cwd /Users/chekh/Development/mister-wolf, время 2026-10-12 ~13:20–13:30 MSK+0. После merge — docs-only коммит 3928af3 (plan.md), код не менялся |
| AC4 независимое ревью (оба мандата) | **подтверждено** | worker-reviewer (чистый контекст, opencode run): дизайн — 2 раунда (F-01..F-08 → все закрыты, F-09..F-11 внесены); код — мандат соответствия: NEEDS_CHANGES (C-01, C-02 major + minors) → fix-коммит → fix-верификация **APPROVED** (0 major); мандат качества: **APPROVED** (Q-03 отложен согласованно) |
| AC5 main содержит волну; 2.16.2; без релизных действий | **подтверждено** | main=3928af3 содержит ветку (ff); package.json=2.16.2; CHANGELOG [2.16.2]; `git tag -l` без 2.16.2; npm publish/деплой не выполнялись |
| AC6 RESULT + ACCEPTANCE-пакет | **подтверждено** | этот файл |

## Ревью-след

- Дизайн: ревью 1 (F-01..F-08, все ACCEPTED) → ревью 2 (F-09..F-11, APPROVED после правок).
- Код: раунд 1 — conformance NEEDS_CHANGES (C-01 битый state→fallback без различения; C-02 гвард repair без штампов-скана; C-03..C-06, Q-01..Q-04 minor), quality APPROVED. Fix-коммит b86f73d закрыл C-01..C-06, Q-01/02/04 (Q-03 EPIPE — отложен с причиной: вывод короткий, риск низкий, ревьюер допускает). Fix-верификация: **APPROVED**, 1 minor «править не обязательно» (валидный JSON без `files` → 'broken' — консервативно).

## Отклонения и решения (в мандате L1)

1. **help-budget 33→34** — новая публичная команда uninstall; зафиксировано в тесте и CHANGELOG (C-06).
2. **cli-reference-guard testTimeout 5s→120s** — pre-existing flake: генерация справочника ~25s spawnSync, падал в полном прогоне по таймауту; поведение теста не менялось, только лимит.
3. **Doctor: mismatch в cwd-ветке** — tmp-проекты e2e prunes-ятся реестром как sandbox (политика §8.2); mismatch от платформы не зависит, cwd-проверка покрывает пользователя в проекте.
4. **CR-2026-10-12-02** (requirements): fallback штампов для легаси-установок — необходим для AC REQ-03, контракта не меняет.

## Ограничения и риски

- Контейнерный smoke tests/container/opencode-v2 (Docker) не гонялся в гейтах (как и до волны) — это отдельный стенд; dual-плагины не менялись, v2-маркеры проверены e2e-контентом.
- Q-03 (EPIPE при `wolf uninstall | head`) — отложено: риск низкий.
- Валидный JSON без поля `files` трактуется как 'broken' — консервативно (не удаляет), ревьюер: «править не обязательно».
- Рекомендация владельцу после релиза: dogfood `wolf sync` в main-чекоуте (штампы набора и AGENTS.md-правило) — как в 2.16.1.

FRICTION: нет.
COMPLAINT: нет.
