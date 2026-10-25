# Отчёт фазы 3 (Ф3) — периферия: T12 (init/doctor) и T13 (Protections, `--here --check`)

## Metadata

| Поле         | Значение                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| task_id      | `wave-2-20-0-impl-f3`                                                                                                  |
| Волна        | 2.20.0, фаза 3 (периферия)                                                                                             |
| cwd / ветка  | `/Users/chekh/Development/mister-wolf/.worktrees/wave-2-20-0-upgrade-intentions`, `dev/wave-2-20-0-upgrade-intentions` |
| Base         | `a8b0f85` (Ф1+Ф2 приняты)                                                                                              |
| Коммиты фазы | `544a419` (T12), `c30cc04` (T13), `2c4b1d1` (F3-ревью m-1)                                                             |
| Режим        | FULL по approved-плану                                                                                                 |
| Входы        | plan.md (T12/T13), design.md §4.11/§4.14/§4.18, test-plan.md R04-1…R04-7, R09-1…R09-5, N03-1                           |
| Методики     | wolf-sdd, test-driven-development, verification-before-completion, receiving-code-review                               |
| Дата         | 2026-10-25                                                                                                             |

**RESULT: DONE** — обе задачи закрыты, `npm run check` exit 0, независимое ревью
`APPROVED` (0 critical / 0 major / 2 minor), minor m-1 исправлен, m-2 отложен
обоснованно (вне allowlist).

## Summary

- **T12 (REQ-04 AC1–AC3):** `wolf init` **без** `--platform` теперь чинит
  канонический блок `mcp.wolf` в _существующем_ `opencode.json`/`.jsonc` через
  существующий `adapter.writeConfig`; конфиг не создаётся, если его не было;
  битый JSONC → `skipped` без падения; повторный init → `unchanged`
  (идемпотентность — единственное условие внутри `writeConfig`); после починки
  `wolf doctor` не печатает `opencode: wolf entry missing`.
- **T13 (REQ-09 AC1–AC3, NFR-03):** `--check` печатает секцию **Protections**
  всегда и последней (на чистом парке — `Protections: none`); `--here --check` —
  отдельный read-only проход только по cwd (`inspectBaseSet` +
  `listProtections`, без реестра, npm-фазы, sync-state и бэкапов, exit 0);
  read-only подтверждён снапшотом **mtime+sha256** всех файлов проекта, включая
  `.opencode/wolf-sync-state.json` и `.wolf/**` — для парка и для `--here`.
- Строки вывода согласованы с Ф1/Ф2: `kept (local): <пути>`, `detail: <причина> —
treated as foreign (<file>)`, `N protected (intentional)` (детали проекта),
  `protect: <value>`/`drift: n/a`/`behind (base X)` (реестр защит),
  `Protections: none` / `Protections: not scanned (…)`.

## Changes

| Файл                                                        | Что изменилось                                                                                                                                                                                                                                                                                                                                                                                                                 | Коммит               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| `src/app/use-cases/init-project.ts`                         | ветка «без `--platform`» (§4.14): для детектированных платформ с существующим конфигом — `readConfig` (null → не пишем, `BROKEN` → `skipped` с причиной) → `writeConfig`; `written`/`replaced` получают reason `init: repaired missing/corrupted <id> wolf entry`; условие каноничности НЕ дублируется                                                                                                                         | `544a419`            |
| `src/adapters/cli/commands/memory-upgrade.ts`               | `protectionNodes()` (секция Protections, всегда последняя, `unrecognized — treated as protected`, `not scanned` при деградации); `runUpgradeCheckHere()` + `UpgradeCheckHereDeps` (read-only один cwd); `upgradeCheckHereAction()`; диспетчеризация в `action`: `--here --check` выходит ДО CLI/npm-фазы; `projectCheck` сузил deps до `Pick<…,'inspect' \| 'protections'>`; `upgradeCheckAction` больше не знает про `--here` | `c30cc04`, `2c4b1d1` |
| `tests/unit/use-cases/init-project.test.ts`                 | +6 кейсов R04-1/2/4/5/6/7 на **реальном** `OpencodeAdapter` (tmp `opencode.json`)                                                                                                                                                                                                                                                                                                                                              | `544a419`            |
| `tests/unit/use-cases/doctor.test.ts`                       | +1 кейс R04-3: до починки issue есть, после `writeConfig` (тот же вызов, что в init) — нет                                                                                                                                                                                                                                                                                                                                     | `544a419`            |
| `tests/integration/b0-init.test.ts`                         | +2 кейса: фикстура «2.19.0-проект» (`opencode.json` с `$schema`/`theme`/`mcp.other`, без wolf) — CLI `init --full` без `--platform` пишет блок, повторный init байт-в-байт; R04-3 на настоящем CLI + in-process `runDoctor`                                                                                                                                                                                                    | `544a419`            |
| `tests/unit/adapters/commands/memory-upgrade.check.test.ts` | +8 кейсов: R09-1/R09-2/R09-4 (секция), 3 × `runUpgradeCheckHere` (инспекция+Protections, деградация без карты, sync-state/бэкапы не создаются), диспетчеризация `--here --check` с падающим npm-шимом, m-1 (not scanned)                                                                                                                                                                                                       | `c30cc04`, `2c4b1d1` |
| `tests/integration/upgrade-check.test.ts`                   | +4 кейса: R09-1 (два проекта: защита вне карты `drift: n/a` + защита на цели `behind (base 2.19.0)`), R09-2 (`Protections: none`), R09-3/N03-1 (двойной прогон: вывод идентичен, `snapshotTree` mtime+sha256 всех файлов парка и реестра), R09-4 (`protect: yes`)                                                                                                                                                              | `c30cc04`            |
| `tests/integration/upgrade-here.test.ts`                    | +2 кейса: R09-5/N03-1 (`--here --check` на проекте с mutated/differ/protect/kept: exit 0, ничего не записано, `.wolf/backup` нет); проект без свидетеля — sync-state не создаётся                                                                                                                                                                                                                                              | `c30cc04`, `2c4b1d1` |
| `docs/dev/…/plan.md`                                        | чекбоксы T12/T13 + «Сделано → коммит» с числами тестов                                                                                                                                                                                                                                                                                                                                                                         | (этот коммит)        |

## Task Decomposition

Классификация зафиксирована **до** исполнения (таблица playbook'а).

| Задача                             | Файлы           | Оценка     | Класс             | Исполнитель (план)   | Факт                                              |
| ---------------------------------- | --------------- | ---------- | ----------------- | -------------------- | ------------------------------------------------- |
| T12 init/doctor                    | 1 src + 3 теста | ~230 строк | MEDIUM (3+ файла) | `worker-implementer` | сам lead (спавн воркеров недоступен — FRICTION-1) |
| T13 Protections + `--here --check` | 1 src + 3 теста | ~260 строк | MEDIUM (3+ файла) | `worker-implementer` | сам lead (см. FRICTION-1)                         |

Задачи независимы (непересекающиеся src- и тест-файлы), поэтому планировались
параллельно; при недоступности спавна выполнены последовательно (T12 → T13) с
соблюдением TDD в каждой.

## Workers Used

| Воркер                  | Подзадача                                       | Статус                                                                                                                  |
| ----------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `worker-implementer` ×2 | T12, T13                                        | **не запущены** — `Subagent depth limit reached (1)`; работа выполнена lead'ом                                          |
| `worker-reviewer`       | независимое ревью диффа Ф3 (`a8b0f85..c30cc04`) | выполнен через `opencode run --standalone --agent worker-reviewer`, вердикт `APPROVED` (0 critical / 0 major / 2 minor) |

Брифы воркерам были подготовлены полностью (полный текст подзадачи, allowlist,
контракт, тесты, блок «Инструменты» с ловушками) и переданы в спавн — они не
дошли до исполнения из-за лимита глубины платформы.

## Validation Results

### Точечные прогоны (по плану)

| Задача | Команда                                                                                                                                                   | Результат                               |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| T12    | `npx vitest run tests/unit/use-cases/init-project.test.ts tests/unit/use-cases/doctor.test.ts`                                                            | 50 passed (39 + 11), exit 0             |
| T12    | `npm run build && npx vitest run tests/integration/b0-init.test.ts`                                                                                       | 13 passed, exit 0                       |
| T13    | `npx vitest run tests/unit/adapters/commands/memory-upgrade.check.test.ts tests/integration/upgrade-check.test.ts tests/integration/upgrade-here.test.ts` | 39 passed (25 + 5 + 9), exit 0          |
| обе    | `npx tsc --noEmit`                                                                                                                                        | `No errors found` (после каждой задачи) |

### Полный гейт

| Проверка                                                             | Результат                                                                                                            |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm run check` (english-surface → prettier → lint → build → vitest) | **exit 0**; `english-surface gate: OK (93 files checked)`; `Test Files 214 passed (214)`, `Tests 1884 passed (1884)` |

### Снапшот-доказательства read-only (NFR-03) — отдельный прогон

```
npx vitest run tests/integration/upgrade-check.test.ts -t "R09-3/N03-1"
  → Tests 1 passed | 4 skipped, exit 0
npx vitest run tests/integration/upgrade-here.test.ts -t "мутации/differ/protect/kept"
  → Tests 1 passed | 8 skipped, exit 0
npx vitest run tests/integration/b0-init.test.ts -t "R04-1/R04-2"
  → Tests 1 passed | 12 skipped, exit 0
```

Что именно закреплено:

- **Парковый `--check`** (`upgrade-check.test.ts`, R09-3/N03-1): локальный
  `snapshotTree()` — mtime+sha256 **каждого** файла проекта и tmp-реестра,
  рекурсивно (включая `.opencode/wolf-sync-state.json` и `.wolf/**`; наличие
  свидетеля в слепке проверяется отдельно). Два прогона: `renderReport` идентичен
  строка-в-строку, слепки до/после равны целиком (`toEqual`, не только diff
  sha-only хелпера).
- **`--here --check`** (`upgrade-here.test.ts`, R09-5/N03-1): проект с mutated +
  differ + protect + kept; after-слепок равен before, три файла байт-в-байт
  прежние, `.wolf/backup` отсутствует, штамп differ-файла остался `2.17.1`.
  Отдельный кейс: у проекта удалён свидетель → после прогона
  `.opencode/wolf-sync-state.json` **не появился**.
- **npm-фаза не вызывается**: unit-кейс с npm-шимом, который создаёт файл-маркер
  и выходит с кодом 1; после `upgrade --here --check` маркера нет, в выводе нет
  `available`. Живая проверка собранного CLI:
  `node dist/bootstrap/cli.js upgrade --here --check` в tmp-проекте → только
  инспекция + Protections + `Done (read-only)`, exit 0, `--json` — один документ
  `wolf.upgrade.check/1` с `cli.available: null`.
- **Init на реальном шаблоне 2.19.0-проекта**: интеграционная фикстура
  (`opencode.json` с `$schema`, `theme`, `mcp.other`, без `mcp.wolf`) прогоняется
  настоящим CLI; повторный init — байт-в-байт; `runDoctor` в том же проекте
  после init не содержит `opencode: wolf entry missing`.

### Независимое ревью (мандат брифа)

- Команда: `opencode run --standalone --agent worker-reviewer` по
  `git diff a8b0f85..c30cc04`; мандат перечислял read-only-гарантию,
  идемпотентность init, полноту реестра Protections, отсутствие записей из
  `--here --check`, allowlist, качество.
- Вердикт дословно (полный текст — `phase4-review-f3.txt`):
  ```
  SUMMARY: 0 critical / 0 major / 2 minor
  VERDICT: APPROVED
  ```
- Ответы автора: **m-1 ACCEPTED** (деградация больше не печатает ложное
  `Protections: none` — `2c4b1d1`, тест добавлен); **m-2 DEFERRED** (перенос
  `snapshotTree` в `tests/helpers/**` невозможен в рамках allowlist T13/T14 —
  техдолг записан в `phase4-review-f3.txt`).

### Состояние дерева

```
git status --short
 M .opencode/skills/using-skills/SKILL.md      ← pre-existing (не наши, не коммитились)
 M .opencode/skills/wolf-execute/SKILL.md      ← pre-existing
 M .opencode/skills/wolf-sdd/SKILL.md          ← pre-existing
?? .opencode/skills/wolf-draft/                ← pre-existing
```

`git diff --stat a8b0f85..HEAD`: 8 файлов, +779/−23 — ровно allowlist T12/T13.
`src/**`/`tests/**` вне allowlist не тронуты; `docs/reference/cli.md` не
регенерировался (в T13 новых флагов нет — `--here --check` использует
существующие опции; help-текст не менялся).

## AC L0 (сверка с брифом)

| AC                                                       | Статус | Evidence                                                                                                                                                                           |
| -------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (1) REQ-04 AC1–AC3 и REQ-09 AC1–AC3 покрыты тестами      | ✅     | R04-1/2/3/4/5/6/7 → `init-project.test.ts` (6), `doctor.test.ts` (1), `b0-init.test.ts` (2); R09-1…R09-5 → check-unit (8), `upgrade-check.test.ts` (4), `upgrade-here.test.ts` (2) |
| (2) read-only подтверждён снапшотом для парка и `--here` | ✅     | `snapshotTree` mtime+sha256 (включая `wolf-sync-state.json`, `.wolf/**`), R09-3/N03-1 оба режима + кейс «свидетеля нет → не создаётся»                                             |
| (3) init идемпотентен и чинит конфиг, doctor молчит      | ✅     | `544a419`: R04-1/R04-2/R04-4/R04-7 на реальном адаптере и на CLI; R04-3 до/после                                                                                                   |
| (4) секция Protections печатается всегда и полна         | ✅     | `protectionNodes` + 4 каталога base-set включая вне-карты; `none`/`not scanned`; позиция закреплена тестом (`indexOf` до/после)                                                    |
| (5) `npm run check` зелёный                              | ✅     | exit 0, 214 файлов / 1884 теста                                                                                                                                                    |
| (6) ревью без critical/major                             | ✅     | `APPROVED`, 0/0/2                                                                                                                                                                  |
| (7) план/отчёт соответствуют факту                       | ✅     | чекбоксы T12/T13 с коммитами и числами тестов; этот отчёт                                                                                                                          |

## Отклонения

1. **Воркеры не запускались** (FRICTION-1). Классификация задач осталась MEDIUM;
   исполнение — lead'ом по готовым брифам, TDD соблюдён.
2. **Тест диспетчеризации в unit-файле** изначально строился на
   `process.chdir(tmpProject)`; в vitest (workers pool) `process.chdir`
   не поддерживается (`ERR_WORKER_UNSUPPORTED_OPERATION`). Переделан: порядок
   режимов закреплён `upgradeRoute({check, here}) → 'check'` (прецедент T11),
   отсутствие npm-фазы — падающим npm-шимом с маркером, отсутствие строки
   `available` — проверкой stdout. Приёмочная гарантия не ослаблена.
3. **Строка деградации Protections** (`not scanned`) — добавлена по итогам
   ревью (m-1); design §4.11 этот случай не специфицирует, строка живёт только
   в ветках, где весь вывод помечен `unreliable`, exit остаётся 0.
4. **`snapshotTree` продублирован** в двух интеграционных файлах — осознанно
   из-за allowlist (m-2 ревью, DEFERRED).

## Риски

- `--json --here --check` отдаёт `diverged: []` (лица памяти не собираются: в
  этом режиме нет ни реестра, ни `collectDecisions` по дизайну §4.11).
  Поле присутствует и валидно по схеме; реестр защит и проект — на месте.
  Если L0 считает `diverged` обязательным и для `--here`, это отдельное
  расширение контракта (сейчас §4.11 говорит только про `inspectBaseSet` +
  `listProtections`).
- TTY-ветка `--here --check` не проверялась отдельно (в этом режиме нет
  интерактивных вопросов: `--check` read-only), проверен non-TTY-рендер и
  живой CLI-прогон.
- Деградация «нет карты у самого CLI» показывает `unknown — out of coverage` и
  `not scanned` — честно, но пользователю с защитами нужно обновить CLI;
  поведение совпадает с парковым `--check` (design §«--check»).

## FRICTION

1. **Спавн воркеров недоступен** (`Subagent depth limit reached (1)`,
   `experimental.subagent_depth`): L1 не может делегировать MEDIUM-задачи —
   пришлось исполнять самому. Не дефект правила, а ограничение платформы;
   лечится конфигом `experimental.subagent_depth >= 2`.
2. **`process.chdir` запрещён в vitest workers** (`ERR_WORKER_UNSUPPORTED_OPERATION`):
   для тестов CLI-путей, зависящих от `cwd` (`--here`), нужен `pool: 'forks'`
   либо явный шов `cwd` в deps. Обойдено без правки конфига (см. «Отклонения» п.2);
   при следующем тесте `--here`-диспетчеризации через commander стоит заранее
   предусмотреть этот шов.

## COMPLAINT

Нет: правило-уровневых противоречий (W1–W4) в этой фазе не встречено —
декомпозиция, контракт отчёта и границы приёмки сработали.
