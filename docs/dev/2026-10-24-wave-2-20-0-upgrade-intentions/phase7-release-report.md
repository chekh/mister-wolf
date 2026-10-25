# Фаза 7 (T15b) — выпуск 2.20.0

## Metadata

| Поле           | Значение                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------- |
| task_id        | `wave-2-20-0-release`                                                                          |
| версия         | **2.20.0** (предыдущая 2.19.0)                                                                 |
| ветка          | `dev/wave-2-20-0-upgrade-intentions` → `main`                                                  |
| HEAD до merge  | `e8ff102` (dev), `0574e7c` (main = `v2.19.0`)                                                  |
| merge-коммит   | **`3140da9`** (`0574e7c..3140da91245ed64a1eb81677632caf07e3ef4d12`)                            |
| тег            | **`v2.20.0`** → `3140da9` (annotated, tag-объект `05387e1`)                                    |
| npm            | `mister-wolf@2.20.0`, `dist-tags.latest = 2.20.0`                                              |
| GitHub Release | https://github.com/chekh/mister-wolf/releases/tag/v2.20.0 (published)                          |
| дата           | 2026-10-25                                                                                     |
| режим          | FULL (релизный шаг плана волны)                                                                |
| методики       | wolf-release-docs (до работ), verification-before-completion (гейт), playbook executor-lead v3 |

## Summary

Волна 2.20.0 выпущена штатным конвейером, без обхода механизмов: merge `--no-ff` в `main`,
push, тег `v2.20.0`, workflow `Publish` (trusted publishing, OIDC + provenance) — success,
`CI` — success, `Deploy Docs` — success. npm отдаёт `2.20.0` в `latest`, установка из реестра в
чистом tmp работает и содержит все новые флаги. Сайт после деплоя отдаёт новую пару страниц
`guide/upgrade` (EN/RU), версию `2.20.0` в навбаре и секцию 2.20.0 в changelog. GitHub Release
создан из `CHANGELOG.md`. Ручных `npm publish`, `--force`, удаления тегов/релизов не было.

## Changes

| Файл                                                                          | Что                                                                |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `plan.md` (эта волна)                                                         | T15 отмечен `[x]`, добавлена строка «сделано → merge/тег/npm/сайт» |
| `docs/dev/2026-10-24-wave-2-20-0-upgrade-intentions/phase7-release-report.md` | этот отчёт (единственный новый файл шага)                          |

Код, тесты, `CHANGELOG.md`, README, `docs/site/**` на шаге выпуска не менялись — они вошли в merge
как есть из `e8ff102`.

Состояние `main` после merge побайтово равно dev-ветке: `git diff --stat dev/wave-2-20-0-upgrade-intentions HEAD`
пуст. В релиз вошло **44 коммита**, `114 files changed, +22212 / −456`.

## Task Decomposition

Классификация до исполнения (playbook executor-lead v3). Воркеры платформенно недоступны
(субагент запускается с глубиной 1 — `Subagent depth limit reached`, та же ситуация, что в T15a),
поэтому все шаги выполнены одиночно; таблица — фактическая.

| Шаг                                                                | Класс              | Исполнитель (план → факт)  |
| ------------------------------------------------------------------ | ------------------ | -------------------------- |
| Preflight (status, версия, dist, check, e2e, список коммитов)      | SIMPLE (проверки)  | сам → **сам**              |
| Merge в `main` + push + тег + push тега                            | SIMPLE (git, lead) | сам (git у lead) → **сам** |
| Наблюдение workflow (Publish / CI / Deploy Docs)                   | TRIVIAL            | сам → **сам**              |
| GitHub Release из CHANGELOG                                        | TRIVIAL            | сам → **сам**              |
| Проверка npm + установка в чистый tmp + флаги                      | SIMPLE             | сам → **сам**              |
| Проверка опубликованного сайта (EN/RU upgrade, главная, changelog) | SIMPLE             | сам → **сам**              |
| Read-only `upgrade --check` по живому парку опубликованным CLI     | SIMPLE             | сам → **сам**              |
| Отчёт + закрытие T15, коммит в `main`                              | TRIVIAL            | сам → **сам**              |

## Workers Used

**0 воркеров.** `subagent` недоступен (глубина 1). Независимый голос на этом шаге не требовался:
шаг — исполнение уже принятого релиза, ревью документации и кода пройдено в T15a и T14.

## Validation Results

### Preflight (до необратимых шагов)

| Проверка       | Команда / процедура                              | Результат                                                                                                                                              |
| -------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| рабочее дерево | `git status --short`                             | ровно предсуществующая расходимость: `M` ×3 скилла (`using-skills`, `wolf-execute`, `wolf-sdd`) + `?? .opencode/skills/wolf-draft/` — в релиз не вошло |
| версия         | `node -p "require('./package.json').version"`    | `2.20.0`                                                                                                                                               |
| `dist` из HEAD | mtime сборки vs последний коммит в `src`/`tests` | `dist/**` собран 18:48, последний коммит кода `39e7653` — 18:31; `git diff --stat -- src tests` пуст                                                   |
| полный гейт    | `npm run check` (на `e8ff102`, 18:53)            | exit `0`: english-surface, prettier, tsc, build, vitest — **215 файлов / 1888 тестов passed**                                                          |
| e2e            | `npm run e2e` (зелёный на `39e7653`)             | **61 файл / 233 теста passed**; после него `git diff --name-only 39e7653..HEAD -- src tests` пуст → код не менялся, 8-минутный прогон не дублировался  |
| состав релиза  | `git log --oneline main..HEAD`                   | 44 коммита (список — в merge)                                                                                                                          |

### Merge, тег, публикация

| Проверка     | Команда / процедура                                       | Результат                                                 |
| ------------ | --------------------------------------------------------- | --------------------------------------------------------- |
| merge        | `git merge --no-ff dev/… -m "merge(2.20.0): …"`           | `3140da9`, родители `0574e7c` + `e8ff102`, конфликтов нет |
| дерево merge | `git diff --stat dev/wave-2-20-0-upgrade-intentions HEAD` | пусто → merge ничего не потерял                           |
| push `main`  | `git push origin main`                                    | `0574e7c..3140da9  main -> main`                          |
| тег          | `git tag -a v2.20.0 -m "2.20.0"` + push                   | `* [new tag] v2.20.0 -> v2.20.0`, указывает на `3140da9`  |

### Workflow (`gh run list` / `gh run view`)

| Workflow      | Run                                                           | Статус      | Длительность               |
| ------------- | ------------------------------------------------------------- | ----------- | -------------------------- |
| `CI`          | https://github.com/chekh/mister-wolf/actions/runs/40209199648 | **success** | 2m48s (15:55:08→15:57:56Z) |
| `Deploy Docs` | https://github.com/chekh/mister-wolf/actions/runs/40209199698 | **success** | 58s (15:55:08→15:56:06Z)   |
| `Publish`     | https://github.com/chekh/mister-wolf/actions/runs/40209200665 | **success** | 9m34s (15:55:09→16:04:43Z) |

`Publish` — все шаги `success`: сверка тега с `package.json`, `Checks` (**215 файлов / 1888 тестов**,
66.55 s), `E2E` (**61 файл**, 441.12 s), `Pack dry-run`, `Publish (OIDC + provenance)`.
Публикация — trusted publishing: `Signed provenance statement … from GitHub Actions`,
transparency log `logIndex=3462994286`, `+ mister-wolf@2.20.0`, 825 файлов, 695.2 kB packed / 2.9 MB
unpacked. Ручного `npm publish` не было.

### npm и установка из реестра

| Проверка             | Команда                                          | Результат                                                                                   |
| -------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| версия в реестре     | `npm view mister-wolf version --prefer-online`   | `2.20.0` (запись в реестр `2026-10-25T16:05:52Z`)                                           |
| канал latest         | `npm view mister-wolf dist-tags.latest`          | `2.20.0`                                                                                    |
| чистая установка     | `npm i mister-wolf@2.20.0` в пустом tmp-каталоге | `added 9 packages in 2s`                                                                    |
| бинарь               | `npx wolf --version`                             | `2.20.0`                                                                                    |
| новые флаги в пакете | `npx wolf upgrade --help`                        | `--resolve` ×2, `--review` ×2, `--show` ×2, `--json` ×2, `--yes`, `--check` ×2, `--here` ×3 |

### Сайт после деплоя (сборка ≠ деплой)

| Проверка           | Команда / процедура                                                      | Результат                                                                                                       |
| ------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `guide/upgrade` EN | `curl -w %{http_code}` https://chekh.github.io/mister-wolf/guide/upgrade | **200**; `--resolve` 22, `protect` 65, `--yes` 14, `--show` 6, `--json` 13, `--review` 7                        |
| `guide/upgrade` RU | https://chekh.github.io/mister-wolf/ru/guide/upgrade                     | **200**; те же флаги (`--resolve` 22, `protect` 51, `--yes` 14, `--show` 6, `--json` 13, `--review` 7)          |
| главная            | https://chekh.github.io/mister-wolf/                                     | **200**; в навбаре только `2.20.0` (×3), строк `2.19.x` нет                                                     |
| changelog          | https://chekh.github.io/mister-wolf/changelog/                           | **200**; секция `2.20.0` (14 вхождений), заголовок «Upgrade UX: owner intentions, named decisions, silent pass» |

### Живой парк опубликованным CLI (пункт 9 чек-листа плана, read-only)

`npx wolf upgrade --check` из чистого tmp-каталога на опубликованном 2.20.0 — exit `0`, `Done (read-only)`:

```
- cli: installed 2.20.0 · available 2.20.0
ok: mister-wolf — current (stamps 2.20.0 from 2.17.1 · map 2.20.0)
warn: adminvps — behind · stamps 2.19.0 · 1 differ: AGENTS.md
warn: trading-signal — behind · stamps 2.19.0 · 1 differ: AGENTS.md
warn: Tender — behind · stamps 2.19.0 · 1 differ: AGENTS.md · foreign: .opencode/agents/mr-wolf.md
warn: opencode-nineroute — needs decision · stamps 2.19.0 · 1 differ: AGENTS.md
      · mutated: .opencode/skills/using-skills/SKILL.md · Protections: none
```

Метрика §1 requirements подтверждена на релизном артефакте: ни одного счётчика без пути, ни одного
ложного needs-decision от штампа, каждый `differ`/`mutated` назван файлом, `Protections` печатается.
Оставшиеся `AGENTS.md` differ — настоящая работа владельца (блок v2 → v3 на проектах 2.19.0),
а не шум. Записи в живые проекты не выполнялось.

### Прочее

- GitHub Release: `2.20.0 — Upgrade UX: owner intentions and silent upgrade`, `isDraft=false`,
  `isPrerelease=false`, заметки — секция `## [2.20.0]` из `CHANGELOG.md` + ссылка на `guide/upgrade`.
- Отклонение окружения: `main` вычекен в основном чекауте `/Users/chekh/Development/mister-wolf`,
  поэтому merge, push и тег выполнены там (в worktree `git checkout main` запрещён). В основном
  чекауте была предсуществующая незакоммиченная расходимость — штампы набора `2.19.0` в 31 файле
  `.opencode/**`, onboarding-блок v2 с битым отступом в `AGENTS.md` и строка `unified-update` в
  `docs/dev/INDEX.md`. Она убрана в `git stash@{0}` («live drift pre-2.20.0 merge…») и **не удалена**:
  восстановление — `git stash show -p stash@{0}`, применение — `git stash pop`. После merge
  содержимое этих файлов — более новое (набор 2.20.0, блок v3 с верными отступами), кроме строки
  `unified-update` в `INDEX.md`, которая относится к другой волне; она ждёт владельца в stash.

## Критерии приёмки (AC L0 брифа)

| AC                                                             | Статус | Evidence                                                                                                                                         |
| -------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| (1) `main` содержит merge 2.20.0, запушен                      | ✅     | `3140da9`, `origin/main = 3140da9`, CI success                                                                                                   |
| (2) тег `v2.20.0` на merge-коммите, запушен                    | ✅     | `git rev-parse v2.20.0^{commit}` = `3140da9`; `* [new tag]`                                                                                      |
| (3) npm отдаёт 2.20.0, установка работает, новые флаги есть    | ✅     | `npm view` / `dist-tags.latest`; чистая установка `added 9 packages`; `npx wolf --version` = `2.20.0`; `--resolve/--review/--show/--json` в help |
| (4) GitHub Release создан из CHANGELOG                         | ✅     | release URL, `isDraft=false`, заметки = секция `## [2.20.0]`                                                                                     |
| (5) сайт после деплоя отдаёт upgrade EN/RU, версию и changelog | ✅     | 4 × HTTP 200 + ключевые фразы; навбар `2.20.0`; changelog с секцией 2.20.0                                                                       |
| (6) отчёт релиза и закрытие T15 зафиксированы в `main`         | ✅     | этот файл + `plan.md` T15 `[x]`, коммит `docs(2.20.0): release report and plan closure`                                                          |
| (7) ни один механизм не обойдён вручную                        | ✅     | npm только через `Publish` (trusted publishing + provenance); без `--force`, без ручных `npm publish`, без удаления тегов/релизов                |

## Остаточные риски и ограничения

- **Откат дорогой**: 2.19.0 читает новые записи свидетеля как `mutated` по всем файлам (контент не
  теряется, лечится повторным апгрейдом или восстановлением `.opencode/wolf-sync-state.json`) — записано
  в CHANGELOG «Upgrade notes».
- **Провайдерский риск `protect`**: подтверждён живым прогоном на opencode `v2.1.4`; tripwire —
  regression guard T14. Будущий релиз opencode может начать форвардить незнакомые ключи агента.
- **Бэкапы без GC**: `.wolf/backup/upgrade/<date>/` растёт до ручной уборки.
- **`diverged` лица не адресуемы через `--resolve`** — только через контур жалоб и Стюарда; exit `2`
  при легитимно ушедшем вперёд лице остаётся контрактом.
- **Живой парк не обновлён**: 4 проекта из 5 на штампах 2.19.0 — это работа владельца, не релиза.
- `dist/` в репозиторий не попадает (`.gitignore`) — собранные артефакты провижнены workflow, локальный
  `dist` относится к `e8ff102`.

## FRICTION

- **`subagent` недоступен (глубина 1)** — второй шаг волны подряд без воркеров; лимит воркеров не
  расходуется, но независимый голос приходится получать вне процесса (`opencode run --standalone`,
  как в T15a). Системное ограничение платформы, не дефект методики.
- **`main` вычекен в основном чекауте** — merge/тег/push из worktree невозможны (`fatal: 'main' is
already checked out`), а основной чекаут был грязным. Пришлось убрать его расходимость в stash до
  merge (см. «Прочее»). Процедурный пробел: playbook не описывает, где выполнять merge, когда
  целевая ветка вычекена в другом worktree и там есть незакоммиченные изменения. Кандидат в урок
  (`git stash` → merge → сохранить stash как evidence), не жалоба: правило не противоречит брифу.
- **npm-кеш**: первый `npm view` сразу после публикации вернул старый `2.19.0`; реестр отдал 2.20.0
  через ~70 с после `Publish`. Ложная тревога, лечится `--prefer-online`/проверкой registry API.
