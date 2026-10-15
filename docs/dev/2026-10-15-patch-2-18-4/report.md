# L1 Отчёт: Патч 2.18.4 — полная идентификация heartbeat и канонический resolver лиц

- **Thread:** mem_20261015_patch_2_18_4_polnaya_identifikatsiya_hea_81b42e (completed)
- **Версия:** 2.18.4 | **Профиль:** FIX | **База:** main @ 6b66f6f → релизный коммит 91a3d9a
- **Дата:** 2026-10-15/16

## RESULT: DONE

## Summary

Патч 2.18.4 реализован, проверен и опубликован: GitHub Release v2.18.4,
npm mister-wolf@2.18.4 (trusted publishing через CI), сайт пересобран
(deploy-docs ✅). Все проверки зелёные.

## Changes

1. **Полная идентификация heartbeat**
   - `src/adapters/fs/claim-registry.ts`: `HeartbeatIdentity` (owner/sessionId?/pid?/claimToken?);
     `writeHeartbeat` принимает `identity?` — строгие проверки только переданных полей:
     owner (всегда), sessionId (строгое равенство; оба `null` — переданное владение легально),
     claimToken (отказ после перезахвата); все отказы содержат имя владельца.
     `HeartbeatRecord` хранит `session_id`/`pid`; `readHeartbeat` их восстанавливает.
   - `src/app/use-cases/claim-artifact.ts`: `heartbeatArtifactClaim(..., identityOverride?)`.
   - `src/adapters/cli/commands/claim.ts`: `wolf claim heartbeat` + `--session/--pid/--claim-token`;
     без флагов — legacy-поведение (только writer).
2. **Канонический FaceResolver**
   - `src/app/use-cases/resolve-face.ts` (новый): строгий запрос `type=face, status=active`,
     `owner_skill === agentId` (legacy `skill:`-префикс — тот же гвард, что в wolf-router);
     сортировка по updated_at/версии; ровно 1 → {body, version, hash=checksumBlock(body)};
     0/`>1` → детерминированный отказ (`none`/`multiple` с диагностикой кандидатов).
   - `src/adapters/cli/commands/face.ts`: `wolf face resolve <owner_skill>` — JSON-канал,
     exit 1 при miss/conflict.
   - `templates/opencode/plugins/wolf-router.ts`: доставка playbook — сначала канонический
     face-resolver (`wolf face resolve`), при miss/conflict — legacy-путь (текстовый search +
     гвард owner_skill), поведение 2.13 для howto-плейбуков сохранено.
   - Лицо дублирующих активных записей по-прежнему ловит `wolf doctor` (существующий контур).
3. **Верификация и релиз**
   - `package.json` → 2.18.4; `CHANGELOG.md` [2.18.4]; `docs/reference/cli.md` регенерирован;
     `docs/site/changelog` (EN+RU) синхронизирован; dogfood-базовый набор re-render
     (`wolf sync`, set=2.18.4; mr-wolf.md пропущен — локальная мутация, не перезаписан).

## Task Decomposition

| #   | Задача                                     | Класс   | Исполнитель                                   |
| --- | ------------------------------------------ | ------- | --------------------------------------------- |
| 1   | Heartbeat identity (registry/use-case/CLI) | SIMPLE  | L1 сам (лимит субагентов исчерпан платформой) |
| 2   | FaceResolver + CLI + плагин                | SIMPLE  | L1 сам                                        |
| 3   | Тесты (heartbeat, resolver, плагин)        | SIMPLE  | L1 сам                                        |
| 4   | Версия/CHANGELOG/docs/check/e2e/релиз      | TRIVIAL | L1 сам                                        |

## Workers Used

Нет. Платформа отклонила вложенный спавн (subagent depth limit = 1) — FRICTION-1.
Код локален (6 файлов src/templates + 4 теста), класс SIMPLE по таблице декомпозиции,
выполнено в рамках контекстного бюджета L1.

## Validation Results (EVIDENCE)

- `npx tsc --noEmit` — чисто.
- Целевые тесты: 4 файла / 53 теста — ✅ (heartbeat 24, claim-artifact 7, resolve-face 6, плагин 16).
- `npm run check` на финальном состоянии: **195 файлов / 1527 тестов, 0 failed, 0 skipped** ✅
  (english-surface, prettier, tsc, build, vitest).
- `npm run e2e`: **59 файлов / 220 тестов — ✅** (правило полного E2E после плана).
- `npm run docs:build` — cli.md регенерирован, changelog EN/RU синхронизирован, vitepress build ✅.
- Публикация: CI ✅ (main), Deploy Docs ✅, Publish (npm) ✅ — `npm view mister-wolf version` → `2.18.4`;
  GitHub Release: https://github.com/chekh/mister-wolf/releases/tag/v2.18.4; тег v2.18.4.
- Жалобы: `wolf list --type complaint --status open` — пусто (проверено до и после).
  COMPLAINT-TRIAGE: seen 0 → resolved 0 / rejected 0 / escalated 0 / open 0.

## ACCEPTANCE

- AC-1 heartbeat identity (проверки owner/session/token, флаги CLI, legacy-режим): подтверждено
  тестами `2.18.4 полная идентификация heartbeat` (6 кейсов) + use-case override-тест.
- AC-2 FaceResolver (строгий запрос, 1/0/>1, hash, интеграция в плагин): подтверждено
  `resolve-face.test.ts` (6 кейсов) + `wolf-router-plugin.test.ts` (face-first + conflict→legacy).
- AC-3 версия/CHANGELOG/docs/check: подтверждено evidence выше.
- AC-4 отчёт: данный файл.

## Отклонения и риски

- **get-call-injections.ts**: логики выбора лица там нет (бриф допускал отсутствие) — интеграция
  не выполнялась.
- **scaffold-agent/seed-base-playbooks** используют `activeFace` (выбор max-версии при двух
  активных — намеренное закрытие окна activate/supersede, 2.17.1). На канонический строгий
  resolver не переведено осознанно: изменение сломало бы контракт операций face. Конфликт
  всё равно виден doctor'у.
- Плагин при конфликте лиц молча уходит на legacy-путь (доставка важнее блокировки);
  диагностика конфликта — зона doctor.
- FRICTION: 1× — platform subagent depth limit; обошёл исполнением SIMPLE-класса лично.
- FRICTION: 1× — docs:build до build генерирует cli.md по старому dist → cli-reference-guard
  drift; обошёл перегенерацией после build. Урок записан в память
  (mem_20261015_cli_reference_guard_drift_generate_cli_r_868bb7).
