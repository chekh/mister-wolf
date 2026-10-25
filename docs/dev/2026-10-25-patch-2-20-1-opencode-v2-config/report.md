# Отчёт: патч 2.20.1 — Wolf ↔ конфиг opencode v2 (пункты 6.1–6.5)

## Metadata

- task_id: `patch-2-20-1-opencode-v2-config`
- thread: `mem_20261025_patch_2_20_1_subagent_depth_pod_experime_aa8af3`
- основание: `docs/dev/2026-10-25-opencode-v2-config-audit/audit.md` §6 (утверждено владельцем)
- база: `main` @ `38aceab`; ветка `fix/2.20.1-opencode-v2-config`; worktree
  `.worktrees/patch-2-20-1-opencode-v2-config`
- дата: 2026-10-25; режим: FULL; версия не поднималась, merge/тег/публикация не выполнялись
- РЕЗУЛЬТАТ: **DONE** (0 critical / 0 major в ревью)

## Summary

Пять пунктов аудита закрыты: единый реестр ключей платформы с тест-инвариантом
(6.2), нативная запись `mcp.servers.wolf` с двухформенным чтением/удалением (6.3),
doctor-валидация всех записываемых ключей (6.1), предупреждение о смешанном
frontmatter managed-агента (6.4), маркер `tool expose` после frontmatter (6.5).
Документация продукта обновлена EN/RU, CHANGELOG дополнен, генерируемые файлы
пересобраны генератором. Гейт зелёный: `npm run check` exit 0 (216 файлов / 1956
тестов), e2e-набор 5/5 файлов, `docs:build` exit 0. Независимое ревью —
APPROVED после одного узкого цикла.

## Изменения по пунктам

| #   | Что сделано                                                                                                                                                                                                                                                                                                                                                                                                                                       | Коммит                          | Тесты                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1 | `OpencodeAdapter.configIssues`: `default_agent === 'mr-wolf'`; `experimental.subagent_depth >= 2` (и «not set», и не-объектный `experimental`, и чужое значение); deprecated верхнеуровневый `subagent_depth` → «ignored by opencode v2 — migrate / foreign value»; вызов через опциональный `PlatformAdapter.configIssues?` (generic-путь doctor для fake-адаптеров сохранён, `--json` не затрагивался — его у doctor нет)                       | `ee13d94`, `070c88c`, `f558031` | `tests/unit/use-cases/doctor.test.ts` 6.1-1…6.1-5 (5 ветвей), `opencode-adapter.test.ts`                                                                                |
| 6.2 | `src/adapters/platforms/opencode-config-keys.ts`: `CONFIG_KEYS` (writePath = canonicalPath, legacyPaths, forms, label) + `getPath/getRecordAt/setPath/deletePath` (прунинг пустых), `pathWritable/blockedSegment`, `readWolfMcp`. Адаптер, doctor, repair и init берут пути из реестра. Инвариант пинится к захардкоженному эталону v2, grep-тест ловит литералы путей вне реестра (со самопроверкой сканера: литерал в комментарии не флагуется) | `ee13d94`                       | `tests/unit/adapters/platforms/opencode-config-keys.test.ts` (18), 6.2-1…6.2-4                                                                                          |
| 6.3 | Пишется `mcp.servers.wolf = {type:'local', command:[…], disabled:false}`, без `codemode`; легаси `mcp.wolf` читается в обеих формах, снимается только «наш» (точная команда `[wolf, mcp]`), чужой — reason без правки; `removeWolf`/`removeWolfKeys` понимают обе формы; идемпотентность (`unchanged` без записи файла, mtime), прунинг `mcp.servers`/`mcp`                                                                                       | `ee13d94`, `070c88c`            | 6.3-1…6.3-8, «пользователь сам мигрировал», «обе формы», «чужое», «идемпотентность», e2e `init-cli`/`platform-repair`/`uninstall`/`distribution`, integration `b0-init` |
| 6.4 | `configIssues` предупреждает, если в managed-агенте (есть штамп Wolf) рядом с v1-полями (`permission`/`temperature`/`mode`) появились v2-поля (`permissions`/`request`/`system`/`disabled`); чисто v1 и нештампованные файлы молчат; абзац в документации EN/RU                                                                                                                                                                                   | `ee13d94`, `6d8f444`            | doctor «6.4-1/6.4-2/6.4-3»; grep по `templates/base/agents` — ложных срабатываний нет                                                                                   |
| 6.5 | `toolSkillContent`: `---`-frontmatter первым блоком, `<!-- generated from tool:… -->` сразу после; идемпотентность сохранена                                                                                                                                                                                                                                                                                                                      | `b51afde`                       | `tool-librarian.test.ts`: yaml-парсинг `name`/`description`, позиция маркера                                                                                            |

## Документация

- `CHANGELOG.md` `[Unreleased]`: нативная MCP-форма и миграция легаси, единый реестр
  ключей, doctor-валидация, маркер `tool expose`, строка
  «Supported OpenCode range: v1 ≥ 1.18.29 and v2 (native `mcp.servers` is accepted from 1.18.29)».
- `docs/site/guide/configuration.md` + RU: две формы MCP, какая нативная и почему,
  миграция, ownership, минимальная версия, «не смешивать форматы frontmatter».
- `docs/site/guide/troubleshooting.md` + RU: разделы 15 «doctor: wolf entry missing»
  и 16 «subagent_depth ignored by opencode v2».
- `docs/site/guide/cli/platform.md` + RU: что валидирует `wolf doctor` (и что `--repair`
  канонизирует конфиг), порядок frontmatter у `wolf tool expose`.
- `docs/reference/cli.md` — только генератором (`npm run docs:build`); `docs/site/changelog/*`
  пересинхронизированы тем же генератором.

## Решение по минимальной версии opencode

Диапазон не менялся: **v1 ≥ 1.18.29 и v2** (совпадает с `parseOpencodeVersion` и
ранее заявленным `CHANGELOG`). Нативная форма `mcp.servers` принимается с 1.18.29
(hoist `v2-compat.ts` — аудит §6.3), т.е. одна записанная форма работает на всём
поддерживаемом диапазоне; ветвление по версии для выбора формы не нужно. Это
зафиксировано в CHANGELOG и в `configuration.md` (EN/RU).

## Evidence (гейт)

cwd: `.worktrees/patch-2-20-1-opencode-v2-config`, HEAD `f558031` (гейт прогнан на этом содержимом).

| Проверка         | Команда                                                                                                                              | Результат                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| english surface  | `node scripts/check-english-surface.mjs` (внутри check)                                                                              | OK, 94 файла                                                                                                          |
| формат           | `npm run format:check`                                                                                                               | All matched files use Prettier code style, exit 0                                                                     |
| типы             | `npm run lint` (`tsc --noEmit`)                                                                                                      | No errors, exit 0                                                                                                     |
| сборка           | `npm run build`                                                                                                                      | exit 0                                                                                                                |
| unit/integration | `npm run test:run` (в составе `npm run check`)                                                                                       | **216 файлов / 1956 тестов passed**, exit 0                                                                           |
| e2e              | `env -u npm_command -u npm_lifecycle_event node ../../node_modules/vitest/vitest.mjs run --config tests/e2e/vitest.config.ts <file>` | `init-cli` 6/6, `platform-repair` 3/3, `uninstall` 4/4, `upgrade-park-modes` 10/10, `doctor-secrets` 1/1 — все exit 0 |
| docs             | `npm run docs:build`                                                                                                                 | exit 0, «build complete»                                                                                              |
| worktree         | `git status --short`                                                                                                                 | чисто                                                                                                                 |

`npm run check` первый прогон дал exit 1 из-за флака `memory-upgrade.check.test.ts`
(2 таймаута по 5 с; изолированно 25/25 зелёные, в предыдущих прогонах — зелёные).
Класс флака пре-существующий (сетевой `upgrade --check`), к диффу не относится;
повторный полный прогон — exit 0 (см. выше).

## Независимое ревью

`opencode run --standalone --agent worker-reviewer`, дифф `git diff 38aceab...HEAD`.

Цикл 1 — **CHANGES_REQUESTED**, 0 critical / 1 major / 4 minor. Major: противоречие
«план говорит не перезаписывать чужую нативную запись, код канонизирует слот wolf».
Разрешено как контракт (не баг): `replaced` — предсуществующий контракт порта
(«перезаписана, в т.ч. ручная dev-запись») и историческое поведение плоской формы;
plan.md решение 5, test-plan 6.3-8 и CHANGELOG переформулированы в «запись канонизирует
слот wolf / удаление и снятие легаси — только точная наша команда». Minors закрыты:
битый JSONC в doctor получил отдельное сообщение; не-объектный `mcp`/`experimental` —
`pathWritable`-гвард с reason вместо ложного `written`; каноническая команда — один
источник (`WOLF_MCP_COMMAND` в реестре, `index.ts` реэкспортирует); `readWolfMcp`
используется адаптером (ownership) вместо дублирования.

Цикл 2 — дословно: `SUMMARY: 0 critical / 0 major / 2 minor` / `VERDICT: APPROVED`.
Два minor одного класса (диагностика doctor для патологических конфигов) закрыты
коммитом `f558031` (конфликт вместо совета `init`, различение «invalid JSONC» и
«not a JSON object», тесты), новых major не потребовалось.

## Отклонения от брифа

1. **Опциональный метод порта `PlatformAdapter.configIssues?`** вместо импорта
   opencode-специфики в `src/app/use-cases/doctor.ts`. Причина: doctor остаётся
   платформо-агностичным, fake-адаптеры и Claude сохраняют generic-путь; приём уже
   принят в порту (`detectVersion?`, `removeWolfKeys?`). Фиксировано в plan.md
   «Решения уровня плана» п.1.
2. **Уточнение ownership в 6.3** (см. «Ревью», цикл 1): запись канонизирует слот wolf,
   удаление — только наше. Аудит §6.3 этого не разделял; поведение приведено к
   существующему контракту порта, а не наоборот.
3. **`audit.md` переформатирован prettier'ом** — пре-существующий красный
   `format:check` на `main` (файл закоммичен в `38aceab` без форматирования);
   без этого гейт `npm run check` не мог быть зелёным. Изменение чисто пробельное
   (таблицы), смысл §6 не тронут.
4. Два minor'а второго ревью закрыты сразу, без третьего круга: они не меняли
   контракт (только текст диагностики + ярлык ошибки), поэтому переревью не
   запрашивалось — гейт на финальном содержимом зелёный.

## Риски

- Нативная форма и `disabled: false` подтверждены живыми пробами аудита (§5 b, c) и
  контрактом `v2-compat` 1.18.29, но в этом патче живой прогон opencode не
  повторялся (TUI/`serve` не поднимались).
- `doctor` проверяет наличие и форму MCP-записи, но не команду: ручная dev-запись
  (`node dist/mcp.js`) не «лечится» советом, а `wolf init` её канонизирует — это
  осознанное разделение (см. plan.md решение 5).
- Флак `memory-upgrade.check.test.ts` под полной нагрузкой (не наш; изолированно зелёный).

## FRICTION

1. Команда e2e из брифа (`node node_modules/vitest/vitest.mjs`) в worktree падает
   `MODULE_NOT_FOUND`: `node_modules` лежит в основном репозитории, не в worktree.
   Рабочий вариант — `node ../../node_modules/vitest/vitest.mjs` (путь от worktree).
2. Прогон unit через `npx vitest` ломает `tests/unit/adapters/cli/memory-sync.test.ts`
   (npx-guard видит `npm_command=exec`); воспроизводится и на `main`. Надёжный запуск —
   `npm run test:run` или `env -u npm_command -u npm_lifecycle_event`.
3. `npm run check` дважды из трёх полных прогонов дал флак таймаутов
   `memory-upgrade.check.test.ts` под нагрузкой; изолированно и в составе `npm run check`
   — зелёный. Кандидат на увеличение `testTimeout` в этом файле (не в scope патча).

## Остатки

- Ветка `fix/2.20.1-opencode-v2-config` и worktree оставлены для релизного шага
  (merge, версия, тег, публикация — отдельным брифом).
- Версия в `package.json` не менялась (2.20.0); `CHANGELOG` — секция `[Unreleased]`.
