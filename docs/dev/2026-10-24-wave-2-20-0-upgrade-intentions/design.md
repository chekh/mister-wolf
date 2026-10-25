---
slug: wave-2-20-0-upgrade-intentions
title: wave-2-20-0-upgrade-intentions — дизайн
status: approved
created: 2026-10-24
baseline: 0574e7c
requirements: requirements.md (approved, CR-2026-10-25-01)
---

# wave-2-20-0-upgrade-intentions — дизайн

Волна 2.20.0 «Upgrade UX: намерения владельца и тихий апгрейд». Единственный
источник AC/REQ — `requirements.md` (утверждён владельцем 2026-10-25,
CR-2026-10-25-01); тред —
`mem_20261024_upgrade_ux_namereniya_vladeltsa_i_tikhiy_e6daf7`. Baseline —
`0574e7c` (v2.19.0). Ссылки на код даны как `revision:path:symbol`; номера
строк — ориентир на baseline, не контракт.

Документ доводит до готовности ядро дизайна фазы 0 и закрывает все пункты
§«Открытые пункты» прежней версии: грамматика `--resolve`, UX `--review`, схема
`--json`, состав секции Protections, алгоритм вставки/снятия `protect`,
keep/unprotect без свидетеля, protect у файлов вне карты, исцеление
штамп-дрейфа, восстановление `mcp.wolf`. Продуктовых решений сверх
`requirements.md` документ не принимает: единственное уточнение допущения §6
(поведение opencode с неизвестным ключом) зафиксировано в §5 с evidence и
передано L0 строкой отчёта, потому что меняет формулировку допущения, а не
требование.

## 1. Карта покрытия REQ/NFR

| Требование | Компонент (baseline)                                                                                                | Контракт (раздел)      | Проверяемое свойство                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| REQ-01     | `memory-upgrade.ts:stepDetailLines` L217, `freshnessDetails` L503, `upgrade-projects.ts:projectsSection` L398       | §4.15                  | в деталях шага и `--check` назван путь каждого needs-decision/differ; счётчики сохранены (AC3)                                                                                                   |
| REQ-02     | `opencode-renderer.ts:syncBaseSet` L124, `inspectBaseSet` L195, `stamp.ts:insertStamp` L19                          | §4.4                   | файл, равный эталону после изъятия штамп-строк, перезаписан и не в needs-decision; повтор — no-op (AC2)                                                                                          |
| REQ-03     | `opencode-renderer.ts:syncAgentsMd` L290, `inspectAgentsMd` L230, `renderAgentsMd` L264, `templates/base/AGENTS.md` | §4.5                   | блок между маркерами обновляется при росте версии формата; текст выше/ниже байт-в-байт (AC1/AC2); append-ветка сохранена (AC3)                                                                   |
| REQ-04     | `init-project.ts:initProject` L248 (ветка платформ L313), `opencode-adapter.ts:writeConfig` L94                     | §4.14                  | init восстанавливает `mcp.wolf` в существующем `opencode.json`, идемпотентно, остальной JSON сохранён; doctor молчит (AC3)                                                                       |
| REQ-05     | новый `src/domain/protect-key.ts`, `src/adapters/render/sync-state.ts`, `verify-against-map.ts`                     | §4.1–§4.3, §4.6, §4.11 | `protect` — сигнал вне контента: три точки нормализации; protected не needs-decision; `grep` даёт реестр (AC4); добавление/снятие ключа не создаёт mutated (AC5)                                 |
| REQ-06     | новый `src/app/use-cases/decisions.ts`, `memory-upgrade.ts`                                                         | §4.7–§4.8              | `--resolve <file \| N>=take\|keep\|protect\|pin`; атомарная валидация целей (AC3); protect-глагол атомарен и обновляет свидетель (AC4); `keep` держится до следующей правки (правило 6.5, ADR-8) |
| REQ-07     | `memory-upgrade.ts` + `decisions.ts` (TTY-цикл)                                                                     | §4.9                   | TTY: разбор по одному с diff и «применить ко всем похожим»; non-TTY: нумерованный список + готовая команда, exit 2, без записей (AC1/AC2)                                                        |
| REQ-08     | `memory-upgrade.ts:--show`, `src/domain/line-diff.ts` (новый)                                                       | §4.10                  | read-only вывод protect/base/diff; `--show N` ≡ `--show <файл>` (AC2)                                                                                                                            |
| REQ-09     | `memory-upgrade.ts:runUpgradeCheck` L558, новый `renderer.listProtections`                                          | §4.11                  | секция Protections печатается всегда (и на чистом парке), полный реестр с дрейфом; `--check` не пишет (AC3)                                                                                      |
| REQ-10     | `memory-upgrade.ts`, `decisions.ts` (бэкапы)                                                                        | §4.12                  | не-TTY `--yes`: mutated → эталон + бэкап, дайджест называет файл и бэкап, exit 0; защищённые не тронуты и не бэкапируются (AC3)                                                                  |
| REQ-11     | `memory-upgrade.ts` (JSON-проекция), `decisions.ts`                                                                 | §4.13                  | валидный JSON: план, проекты с именами файлов, needs-decision с номерами, protections, бэкапы; `n` совпадает с текстом (AC2); exit совпадает (AC3)                                               |
| NFR-01     | `upgrade-projects.ts:runPass` L127, `memory-upgrade.ts:runUpgradeHere` L264                                         | §4.16                  | exit 0/1/2 без изменения семантики; `protected`/исцеление не дают exit 2                                                                                                                         |
| NFR-02     | `opencode-renderer.ts`, `project-step.ts:runProjectStep` L67                                                        | §4.4, §4.5, §4.12      | повторный прогон: exit 0 и ни одного изменённого файла                                                                                                                                           |
| NFR-03     | `memory-upgrade.ts:runUpgradeCheck` L558                                                                            | §4.11, §4.17           | снапшот mtime+хэш до/после `--check` идентичен; состояние серверного каталога не пишется                                                                                                         |
| NFR-04     | `markdown-memory-store.ts:writeFileAtomic` L366, `src/adapters/render/sync-state.ts:saveSyncState` L35              | §4.17                  | все новые записи (файлы, frontmatter, AGENTS-блок, sync-state, бэкапы) — tmp+rename                                                                                                              |
| NFR-05     | `decisions.ts` (backup), `--yes`                                                                                    | §4.12                  | take/`--yes` перезаписывают только после бэкапа; сценарий восстановления (AC REQ-10 AC2)                                                                                                         |
| NFR-06     | `decisions.ts:collectDecisions`                                                                                     | §4.7                   | два подряд non-TTY прогона дают идентичный вывод и нумерацию                                                                                                                                     |

## 2. Глоссарий

- **Нормализованный контент** — контент файла после изъятия строк(и) ключа
  `protect` из YAML-frontmatter (и только их). Единая база сравнения с эталоном
  и свидетеля.
- **Точка нормализации** — место, где контент сравнивается с эталоном либо
  хэшируется в свидетель: сравнение при sync/inspect, запись свидетеля,
  проверка свидетеля.
- **Штамп-дрейф** — различие файла и эталона только в строке
  `wolf:rendered base=… set=…`; лечится перезаписью (§4.4).
- **Свидетель** — sha256 нормализованного контента, записанный при записи файла
  в `.opencode/wolf-sync-state.json`; расхождение = локальная правка (mutated).
- **Реестр решений** — упорядоченный список файловых целей needs-decision,
  собранный read-only; единственный источник нумерации `N` для `--resolve`,
  `--show`, `--review` и `--json` (§4.7).
- **Решение (глагол)** — `take` (эталон), `keep` (принять локальный),
  `protect` (keep + `protect: true`), `pin` (keep + `protect: <base>`).
- **База (base)** — версия свежего рендера установленного CLI, то есть
  `map.version` (в 2.20.0 совпадает с `package.json`); используется значением
  `pin` и в info-строках дрейфа.
- **Версия формата onboarding-блока** — число `N` в
  `<!-- wolf:onboarding vN -->`; берётся из шаблона (единственный источник), не
  равна версии Wolf и не хранится константой в коде.
- **Защищённая цель** — файл с `protect: true` или `protect: X.Y.Z`;
  не needs-decision; `keep`/`unprotect` снимает ключ.
- **Санкционированная локальная вариация** — безштампованный файл с `protect`:
  не трогаем, не конфликт, не предупреждение.

## 3. Компоненты и ответственность

- **`src/domain/protect-key.ts` (новый, чистая логика без I/O)** — единственная
  точка правды о ключе: `parseProtect`, `normalizeManaged`, `insertProtect`,
  `removeProtect`. Владеет грамматикой и нормализацией; не знает о путях и
  карте. Потребители — рендерер, use-cases, CLI.
- **`src/adapters/render/stamp.ts`** — единственный владелец регекса штампа:
  `insertStamp` и экспорт `stripStampLines` (используется исцелением §4.4);
  вторая копия регекса запрещена.
- **`OpencodeBaseSetRenderer`** (`src/adapters/render/opencode/opencode-renderer.ts`)
  — владеет файлами base-set: классификация цели (protect → protected,
  штамп-дрейф → исцеление, mutated по свидетелю), запись через
  `writeFileAtomic`, AGENTS.md (штампованный whole-file режим и блочный режим),
  read-only `inspectBaseSet`, `listProtections`, `renderFreshFile`. Свидетель
  читает/пишет через `src/adapters/render/sync-state.ts`.
- **`sync-state.ts`** (`src/adapters/render/sync-state.ts`) — свидетель:
  `loadSyncState` (толерантный),
  `saveSyncState` (становится атомарным, §4.17), `sha256`. Хэш всегда по
  нормализованному контенту — обязанность вызывающего, зафиксирована тестом.
- **`verifyAgainstMap`** (`src/app/use-cases/verify-against-map.ts`) — чистое
  отображение факт → код; добавляется код `protected` вне
  `NEEDS_DECISION_CODES`, факт `protected` в `syncFact`.
- **`runProjectStep`** (`src/app/use-cases/project-step.ts`) — порядок фаз
  неизменен; получает от рендерера нормализованные исходы; прокидывает
  `backups` из рендерера/решений в отчёт (§4.12).
- **`runUpgradeProjects` / `runUpgradeHere`** (`upgrade-projects.ts`,
  `memory-upgrade.ts`) — парковый проход, plan-секция, подтверждение, exit-код,
  детали шага (имена файлов, строка `N protected (intentional)`), дайджест.
- **`decisions.ts` (новый, app-layer use-case)** — реестр решений
  (`collectDecisions`), применение глаголов (`applyResolution`), бэкапы
  (`backupLocalFile`), сбор Protections для пары рендерер+карта. Единственный
  владелец нумерации и семантики глаголов; CLI только печатает и спрашивает.
- **`memory-upgrade.ts` (CLI)** — грамматика флагов, TTY/non-TTY ветки,
  печать (`renderReport` или JSON), exit-код. Не принимает решений о файлах.
- **`initProject`** (`src/app/use-cases/init-project.ts`) — восстановление
  `mcp.wolf` в существующем конфиге платформы (§4.14).
- **`line-diff.ts` (новый, domain)** — ограниченный построчный unified diff для
  `--show` и `--review`; без зависимостей, с лимитом строк.

## 4. Контракты

### 4.1 Ключ `protect`: грамматика, нормализация, вставка и снятие (REQ-05)

**Грамматика.** Ключ живёт только в YAML-frontmatter — блоке, который
начинается с первой строки файла, равной `---`, и заканчивается следующей
строкой, равной `---`. Допустимы `\n` и `\r\n`.

| Значение                | Смысл                                                    |
| ----------------------- | -------------------------------------------------------- |
| `true`                  | держать локальный контент навсегда                       |
| `false`                 | не защищён (эквивалент отсутствия ключа)                 |
| `X.Y.Z` (полная версия) | держать и зафиксировать версию базы                      |
| пусто, `~`, `null`      | **держать + warn** (недописанный ключ, fail-safe, ADR-5) |
| любое иное / битое      | **держать + warn** (fail-safe, ADR-5)                    |

Ключ вне frontmatter (в теле) не является защитой и не удаляется
нормализацией. `protect` в кавычках (`"protect":`), с отступом или табом — вне
грамматики: не считается защитой и не нормализуется (документированное
ограничение, тест на границе).

**Разбор.**

```
parseProtect(content) -> { held: boolean; value: 'true' | 'X.Y.Z' | null; raw: string | null; unrecognized?: true }
  если frontmatter нет -> { held: false, value: null, raw: null }
  строки блока: /^protect\s*:\s*(.*?)\s*$/
  из найденных берём ПЕРВУЮ (порядок файла — источник истины; дубли — warn)
  raw=='' или raw=='~'/'null' -> held=true, value=null, unrecognized=true   (ADR-5)
  raw=='true' -> held, value='true'
  raw=='false' -> не held, value=null
  /^\d+\.\d+\.\d+$/ -> held, value=raw
  иначе -> held=true, value=null, unrecognized=true
```

**Нормализация.**

```
normalizeManaged(content) -> string
  если первая строка не '---' -> content без изменений
  найти закрывающую строку '---' (первую после открывающей); нет -> без изменений
  удалить ВСЕ строки блока, матчащие /^protect\s*:/ вместе с их переводом строки
  вернуть склеенный контент (остальные строки, порядок, пробелы, комментарии — байт-в-байт)
```

Нормализация идемпотентна: `normalizeManaged(normalizeManaged(x)) ===
normalizeManaged(x)`; для файла без ключа возвращает тот же байт-контент
(проверяется тестом, включая CRLF).

**Вставка (protect/pin).** Правка построчная — `yaml.dump` запрещён: он
переупорядочивает ключи и теряет комментарии.

```
insertProtect(content, value) -> { content: string; changed: boolean }
  1. frontmatter есть:
     удалить существующие строки /^protect\s*:/ (все) — как в normalizeManaged
     новую строку 'protect: <value>' вставить последней строкой блока, сразу
       перед закрывающим '---'; пустой блок -> первой строкой блока
     перевод строки новой строки — как у закрывающего разделителя (CRLF/LF)
  2. frontmatter нет -> { changed: false, error: 'no-yaml-frontmatter' }
  3. структурная проверка до записи:
       (а) границы блока не изменились (закрывающий '---' на месте);
       (б) parseProtect(новый) даёт ОЖИДАЕМОЕ значение;
       (в) normalizeManaged(новый), дополненный строкой 'protect: <value>' с тем же
           EOL, что у закрывающего разделителя, восстанавливает новый байт-в-байт
           (нормализация и вставка взаимно обратны; CRLF сохраняется)
     любое нарушение -> { changed: false, error: 'frontmatter-unparsable' }, файл не пишется
```

Полная YAML-валидность блока не проверяется и не заявляется: файл мог быть
битым до нас, а волф правит одну строку. Проверяется структурная целостность
блока и распознавание вставленной строки (это и есть граница гарантии).

Правило 2 — отказ, а не изобретение блока: wolf-управляемые agents/skills/
commands в 2.20.0 все имеют frontmatter, а молчаливое добавление блока в файл
без него меняет форму файла; отказ виден пользователю сообщением
`cannot protect <path>: no YAML frontmatter — add one or use keep`. Это
техническое решение в рамках NFR-05 (ничего не теряем и не выдумываем
структуру).

**Снятие (unprotect).** `removeProtect(content) = normalizeManaged(content)`:
удаляет все строки ключа, остальное байт-в-байт. Снятие не добавляет и не
переставляет ключи.

**Несколько ключей.** Нормализация снимает все; разбор берёт первый; в `--check`
и в дайджесте — warn `protect declared twice, first value wins`.

### 4.2 Свидетель: запись, три точки нормализации и происхождение (REQ-05 AC5, REQ-06)

Свидетель `.opencode/wolf-sync-state.json` перестаёт быть голым хэшем: кроме
хэша он помнит **происхождение** записи, иначе `keep` («принять локальный»)
неотличим от «волф это писал» и следующий проход молча перезапишет принятый
файл (ADR-8).

```ts
interface SyncEntry {
  hash: string; // sha256 нормализованного контента
  origin: 'render' | 'keep'; // render — запись рендерера/эталона; keep — владелец принял локальный
  base: string; // версия базы, на которой сделана запись (X.Y.Z)
}
interface SyncState {
  files: Record<string, string | SyncEntry>; // строка = легаси-запись 2.19.0 → {hash, origin:'render', base: <stamp|'0.0.0'>}
}
```

`loadSyncState` нормализует легаси-строки в `SyncEntry` (`origin:'render'`,
`base` из штампа файла или `'0.0.0'`, если штампа нет) — миграция файла не
требуется, запись происходит при первой же сохраняемой операции.

| Точка                 | Формула                                                                  | Где              |
| --------------------- | ------------------------------------------------------------------------ | ---------------- |
| сравнение при sync    | `normalizeManaged(current) === fresh`                                    | `syncBaseSet`    |
| сравнение при inspect | `normalizeManaged(current) === fresh` (read-only)                        | `inspectBaseSet` |
| запись свидетеля      | `{ hash: sha256(normalizeManaged(written)), origin, base: map.version }` | все ветки записи |
| проверка свидетеля    | `sha256(normalizeManaged(current)) !== entry.hash`                       | sync / inspect   |

Следствие: добавление, изменение значения или снятие `protect` не меняет
свидетель и не создаёт `mutated` (REQ-05 AC5). Файл, записанный рендерером,
ключ не содержит, поэтому нормализация при записи — тождество; формула едина,
чтобы не появилось второй точки правды.

`origin` читается только правилом 6.5 §4.3 (принятый локальный контент) и
`--check` (строка `kept (local)`); на mutated-детект он не влияет: правка файла
после `keep` снова даёт расхождение хэша.

### 4.3 Классификация цели: единый порядок решающих правил

Порядок обязателен и одинаков в `syncBaseSet`, `inspectBaseSet` и
`renderBaseSet` (иначе расходятся pass и `--check`). Колонки режимов: `sync` —
проход (`runProjectStep`), `inspect` — read-only `--check`/реестр; `render` —
init-рендер (минимальный путь).

```
для каждой цели base-set (порядок templateFiles):
 1. файла нет            -> sync/render: created | inspect: missing
 2. protect держит       -> protected (все режимы; файл не трогаем)
 3. штампа нет           -> sync: conflict | inspect: foreign | render: skipped
 4. normalize(current) == fresh
                         -> identical (все режимы; свидетель := {hash(fresh), origin:'render', base}
                                       пишется только sync/render — inspect read-only, NFR-03)
 5. stripStampLines(normalize(current)) == stripStampLines(fresh)
                         -> sync: updated, reason 'stamp drift healed',
                                  свидетель := {hash(fresh), origin:'render', base}
                            inspect: identical (записи нет — NFR-03)
                            render: updated (как sync)
 6. свидетель есть и sha256(normalize(current)) != entry.hash
                         -> mutated (все режимы; файл не трогаем)
 6.5 свидетель совпал И entry.origin == 'keep'
                         -> kept: файл не трогаем, needs-decision нет;
                            если entry.base != map.version — info-строка
                            «locally accepted at <base>, base <map.version>»
 6'. mutated И включён режим take-on-mutated (--yes, §4.12)
                         -> бэкап локального → перезапись fresh →
                            свидетель {hash(fresh), 'render', base}; outcome updated + backup
 7. иначе                -> если записи свидетеля НЕТ — бэкап локального контента
                            (NFR-05, тот же BackupHook), затем перезапись fresh,
                            свидетель := {hash(fresh), 'render', base}
```

Правило 2 стоит выше правил 4–7: защищённый файл **никогда** не переписывается
— в том числе исцелением штамп-дрейфа и тихим `--yes`. Цена: защищённый файл со
старым штампом остаётся с ним навсегда и показывается info-строкой «защищённое
отставание» (REQ-05 AC3), а не «лечится». Это осознанный выбор в пользу
намерения владельца (ADR-1, ADR-7).

Правило 5 стоит выше правила 6: у файла со штамп-дрейфом свидетель содержит
старый штамп, поэтому проверка свидетеля дала бы ложный `mutated` (дефект
2.19.0, REQ-02). Правило 6 по-прежнему ловит реальную правку: strip-сравнение
при ней не сходится. Исцеление — это `action:'updated'` с reason, а не отдельный
`RenderAction`: счётчики и `files[].code` в `--json` показывают `updated`
(наблюдаемость — reason и строка деталей шага).

Правило 6.5 — механизм «шум прекращается до следующего дрейфа» (REQ-06):
принятый локальный контент остаётся каноном, пока владелец его снова не
правит (тогда правило 6 → mutated) или пока файл не будет взят/защищён явно.
Без него `keep` отменялся бы на следующем же проходе правилом 7 — с молчаливой
потерей правок (NFR-05). Смена базы у `kept`-файла обновлением **не** является:
это осознанно локальный файл, он лишь получает info-строку.

Правило 5 стоит выше и правила 6.5 (решение L0, 2026-10-25): файл со свидетелем
`origin:'keep'`, отличающийся от эталона **только строкой штампа**, исцеляется —
свидетель становится `{hash(fresh), origin:'render', base}`, `keep` снимается.
Это не потеря контента: отличие лежит в зоне wolf (строка штампа), контент
пользователя не меняется; поведение зафиксировано тестом, порядок правил
не переписывается.

Правило 6′ — единственная точка «take для mutated» в волне: режим включает
проход (`--yes`), а не post-фаза; подробности и порядок записей — §4.12.

Файлы вне карты (`outsideMap`): рендерер их не перечисляет (обход идёт по
`templateFiles`), поэтому classify их не видит. Их судьба:

- штампованный файл вне карты (orphan) **без** protect → `conflict` из
  `runProjectStep` (`drift without declaration`), путь печатается по имени
  (REQ-01); лечение — `--resolve <путь>=protect` (файл становится защищённой
  вариацией и перестаёт быть конфликтом) либо удаление вручную (§4.8, матрица
  глаголов);
- штампованный orphan **с** protect → `protected`, не conflict, не warning
  (санкционированная локальная вариация); `runProjectStep` обязан проверять
  protect у orphan до генерации drift-конфликта;
- нештампованный файл вне карты → `foreign` (wx-политика): не трогаем; с protect
  — `protected` и в реестре Protections (§4.11).
  Независимо от карты `protect` уважается: проход не перезаписывает ни одного
  файла с защитой **и не удаляет его**: защищённая `removed`-цель остаётся на
  месте, получает код `protected` (не `removed`, не `error`) с подсказкой
  `wolf upgrade --resolve <путь>=keep` (снятие ключа — матрица §4.8), а её
  локальный контент не бэкапируется, потому что не меняется (§4.12).

### 4.4 Исцеление штамп-дрейфа (REQ-02)

Регекс изъятия штамп-строк — **един** с `insertStamp` baseline
(`src/adapters/render/stamp.ts:21`):

```
STAMP_STRIP = /(?:<!--|\/\/)\s*wolf:rendered[^\n]*(?:\s*-->)?\n?/g
stripStampLines(s) = s.replace(STAMP_STRIP, '')
```

Регекс **живёт только** в `src/adapters/render/stamp.ts`: там же объявлен
`stripStampLines`, который используют `insertStamp` и рендерер
(исцеление). В `protect-key.ts` регекса нет — модуль ключа не знает о штампах.
Вторая копия регекса запрещена (иначе исцеление и вставка разойдутся, и файл
будет «лечиться» вечно); правка `stamp.ts` входит в allowlist задачи T3
(§ plan.md).

Исцеление выполняется только по правилу 5 §4.3 и только для файлов **без**
защиты. Запись — `writeFileAtomic`; исход — `action:'updated'` с
`reason: 'stamp drift healed (base <v>)'`; отдельного `RenderAction`/`VerifyCode`
нет (см. §4.3), поэтому счётчики и `--json.files[].code` показывают `updated`.

`inspectBaseSet` для того же состояния отдаёт `identical` (правило 5 → в
read-only режиме файл считается «не требует решения»), поэтому `--check` не
показывает `behind` для штамп-дрейфа. Формулировка в документации: identical в
инспекции означает «проходу нечего решать», а не «байт-равенство».

Идемпотентность (AC2): после исцеления штамп равен версии базы, правило 4
срабатывает на повторном прогоне → `identical`, файл не пишется.

### 4.5 Onboarding-блок AGENTS.md (REQ-03)

Два режима владения, оба сохраняются. **`protect` у AGENTS.md не
поддерживается** (решение L0, 2026-10-25): в штатном шаблоне у файла нет
YAML-frontmatter, а ручной frontmatter не делает AGENTS.md защищаемым — глаголы
`protect`/`pin` отвечают отказом «нет frontmatter» (матрица §4.8). Намерение
выражается выбором режима: блочный сохраняет текст вне блока, штампованный
принадлежит wolf целиком (ADR-7).

1. **Whole-file (штампованный) AGENTS.md** — поведение 2.19.0 без изменения:
   сравнение всего файла, свидетель, `mutated` при локальной правке, полная
   перезапись при `differs`; правила 6/6.5/7 §4.3 применяются как к любому
   штампованному файлу (`keep` на AGENTS.md держится по 6.5). Тихий режим
   `--yes` берёт mutated AGENTS.md **тем же** механизмом, что файлы карты:
   `syncBaseSet(..., { takeMutated: { backup } })` → правило 6′ «бэкап → эталон →
   свидетель» (§4.12); `opts` пробрасывается в `syncAgentsMd`, второго пути
   бэкапа нет. Правило 7 для AGENTS.md тоже требует бэкап, если записи свидетеля
   нет (NFR-05).
2. **Блочный (append) AGENTS.md** — файл без штампа, но с маркером. Управляется
   **только блок между маркерами**; текст выше и ниже — байт-в-байт, блок
   получает EOL файла (CRLF-файл не смешивает `\r\n`/`\n`, m-7).

**Init на штампованном файле с блоком (миграция 2.19.0 → 2.20.0).** Проект,
инициализированный 2.19.0, имеет `AGENTS.md` со штампом `set=2.19.0` и блоком
`v2`. `wolf init` обновляет блок по версии формата и **приводит штамп к текущей
базе**; свидетель пишется по нормализованному контенту, но только если файл
совпал с эталоном (EOL отличием не считается). Иначе (пользовательский текст вне
блока) свидетель не переписывается и файл остаётся `mutated` — иначе следующий
проход по правилу 7 молча перезаписал бы этот текст. Следствие: повторный
`init` — no-op, ближайший проход и `--check` показывают `current`/`identical`
(REQ-03 AC4, NFR-02).

```
findOnboardingBlock(content) -> { version: number; start: number; end: number } | null | 'broken'
  open  = первая строка, матчащая /<!-- wolf:onboarding v(\d+) -->/   (любая версия!)
  close = первая строка '<!-- /wolf:onboarding -->' после open
  open нет                 -> null        (блока нет: append-ветка init)
  open есть, close нет     -> 'broken'
  return { version: N, start: начало open-строки, end: конец close-строки }

templateOnboardingVersion(templateContent) -> number   // из рендера шаблона; единственный источник

syncAgentsBlock(content, templateContent, mode):   // mode: 'init' | 'sync'
  // protect у AGENTS.md не поддерживается — гейта защиты в этой ветке нет
  block == null        -> init: append-ветка renderAgentsMd (AC3)
                          sync: skipped, reason 'no onboarding block — left untouched (wx policy)'
  block == 'broken'    -> skipped, reason 'onboarding markers broken — file treated as foreign (wx policy)'
                          detail 'onboarding markers broken' (§4.6); в inspect: action 'foreign';
                          needs-decision НЕ выставляется
  block.version < templateOnboardingVersion -> заменить [start, end) свежим блоком; writeFileAtomic; updated
  иначе                -> сравнить только текст блока с блоком шаблона:
                          равны -> identical; иначе -> заменить блок (updated)
  init + файл штампован -> штамп := set текущей базы; свидетель := hash(normalize(файл))
                          только если файл == эталон (иначе локальный текст вне
                          блока остаётся mutated-решением, см. ниже)
```

- **Детект блока версионно-агностичен**: литерал `ONBOARDING_MARKER =
'<!-- wolf:onboarding v2 -->'` (`opencode-renderer.ts:27`) удаляется; и
  append-ветка `renderAgentsMd`, и `inspectAgentsMd`, и `doctor` используют
  префикс `<!-- wolf:onboarding`. Иначе после смены версии шаблона на v3
  существующий блок v2 не распознаётся, и init/append допишет второй блок
  (ломает REQ-03 AC3/AC4 и NFR-02).
- Версия формата инкрементируется **в шаблоне**; в коде константы версии нет →
  риск ADR-3 «забыли инкремент» закрыт конструктивно.
- В этой волне шаблон блока получает новую строку про `protect` и `--resolve`,
  поэтому маркер становится `v3`; блоки `v2` распознаются и обновляются штатно
  (миграция не нужна).
- Сломанные маркеры трактуются как `foreign` (wx-политика), а не
  needs-decision: файл не наш, пока пользователь сам не починит маркеры; строка
  `onboarding markers broken — treated as foreign` печатается в деталях шага и
  `--check` (класс `unknown`, вне покрытия). Причина передаётся структурно:
  `InspectOutcome.detail` (§4.6), а не парсингом reason-строки; `--check`
  печатает её в секции проекта (формат — §4.15). Никаких глаголов на этом файле
  не требуется, exit не меняется (NFR-01).
- Пользовательский текст **внутри** блока не сохраняется (блок — зона wolf);
  это документируется в `docs/site/guide/upgrade.md`.
- Свидетель для блочного режима не пишется и не проверяется (внешний контент —
  не зона wolf); для штампованного режима — как раньше.
- **Трактовка REQ-03 AC3 «init/upgrade … append-веткой (как сегодня)»
  (решение L0, 2026-10-25):** append-ветка выполняется **только в `wolf init`**.
  `wolf upgrade` безштампованный `AGENTS.md` не трогает — это действующая
  wx-политика 2.19.0 («как сегодня»), и она сохраняется. Причина: `upgrade`
  обрабатывает чужой файл без маркера, а молчаливое дописывание блока в файл,
  который волф не создавал, нарушает wx-границу. Следствие для приёмки: AC3
  покрыт сценарием `init` (R03-3) и **отдельным** сценарием «upgrade не меняет
  AGENTS.md без блока и без штампа» (R03-7); формулировка требования не
  переписывается.

### 4.6 Verify-коды и действия инспекции (REQ-05, REQ-06, REQ-01)

```
VerifyCode += 'protected' | 'kept'          // оба вне needs-decision
InspectAction += 'protected' | 'kept'       // защищённый и принятый локальный — не решения
NEEDS_DECISION_CODES = { 'skipped-mutated', 'diverged', 'conflict' }   // без изменений

syncFact(o):
  o.protected            -> 'protected'
  o.kept                 -> 'kept'
  o.action == 'conflict' -> 'conflict'
  o.action == 'skipped'  -> o.mutated ? 'skipped-mutated' : 'skipped-identical'
  o.action == 'appended' -> 'updated'
  иначе                  -> o.action

fileVerdict(category, fact):
  fact == 'protected'  -> 'protected'      (перекрывает ожидание категории)
  fact == 'kept'       -> 'kept'           (принятый локальный контент, см. 6.5)
  ... остальное как в baseline
```

`protected` и `kept` не входят в `NEEDS_DECISION_CODES` → `needsDecision=false`,
exit не меняется (NFR-01). Наблюдаемость: `summary.byCode.protected|kept`,
строки `N protected (intentional)` и `N kept (local)` в деталях шага и в
сводке.

Те же коды обязательны для фактов **вне карты**: в хвосте `verifyAgainstMap`
(«sync outcome for a file outside the map») исходы `protected`/`kept` дают
`item('file', path, 'protected'|'kept')`, а не `conflict` — иначе
санкционированная вариация (REQ-05 AC2) и принятый локальный контент (REQ-06)
снова стали бы needs-decision.

Порты получают структурные поля (без парсинга reason-строк):

```ts
interface RenderOutcome {
  /* baseline */
  protected?: true;
  protect?: string | true; // значение ключа для дайджеста
  kept?: true; // принятый локальный контент (origin:'keep'), файл не менялся
  /** Путь бэкапа, если файл был перезаписан по режиму take-on-mutated (§4.12). */
  backup?: string;
}
interface InspectOutcome {
  /* baseline */
  protected?: true;
  protect?: string | true;
  kept?: true;
  keepBase?: string; // база, на которой владелец принял локальный контент
  /** Причина наблюдения для человека (`onboarding markers broken`, …); в classify
   *  и `--check` передаётся полем, а не разбором reason-строки (§4.15). */
  detail?: string;
}
/** Хук бэкапа: приложение решает, куда и как копировать; рендерер только
 *  требует «сначала бэкап, потом запись» (NFR-05). Возвращает путь бэкапа. */
type BackupHook = (rel: string, content: string) => Promise<string>;
interface SyncBaseSetOptions {
  /** --yes (§4.12): mutated → бэкап + эталон. Без хука режим запрещён. */
  takeMutated?: { backup: BackupHook };
}
```

`BaseSetRenderer` дополняется read-only методами и опцией режима (используются
CLI-слоем). **Весь порт — один владелец: T3** (`src/ports/base-set-renderer.port.ts`
в её allowlist): поля `RenderOutcome.{protected,kept,backup,protect}`,
`InspectOutcome.{protected,kept,keepBase,detail}`, `InspectAction += 'protected'|'kept'`,
`SyncBaseSetOptions.takeMutated`, `listProtections`, `renderFreshFile`. Другие
задачи (T5, T7, T13) порт не правят — только потребляют.

```ts
interface ProtectEntry {
  project: string; // корень проекта (abs)
  file: string; // rel-путь
  value: 'true' | string; // 'X.Y.Z' либо raw вне грамматики
  recognized: boolean; // false — значение вне грамматики (warn)
  stamp: string | null;
  base: string; // map.version
  behind: boolean | null; // нормализованный контент != fresh; null — эталона нет (вне карты)
}
interface BaseSetRenderer {
  /* baseline */
  syncBaseSet(
    baseDir: string,
    models?: ModelContext | 'omit',
    opts?: SyncBaseSetOptions
  ): Promise<{ outcomes: RenderOutcome[]; orphaned: string[] }>;
  inspectBaseSet?(baseDir: string, opts?: RenderBaseSetOptions): Promise<InspectOutcome[]>;
  listProtections?(baseDir: string, base: string): Promise<ProtectEntry[]>;
  renderFreshFile?(baseDir: string, rel: string, opts?: RenderBaseSetOptions): string | null;
}
```

`inspectBaseSet` для штамп-дрейфа (правило 5 §4.3) отдаёт `identical`: проходу
нечего решать, `--check` не показывает `behind`. Для `--show` эталон берётся
`renderFreshFile`, поэтому «что получишь при take» видно и в этом состоянии.

**Класс проекта в `--check`** строится из `action`: `protected` и `kept` →
`current` (не `needs-decision`, не `behind`); `foreign` → `unknown`; `mutated`/
`conflict` → `needs-decision`. Строки `detail` класс не меняют.

### 4.7 Реестр решений: сбор и нумерация (REQ-06, REQ-11, NFR-06)

```
interface DecisionTarget {
  n: number;                       // 1-based, сквозная нумерация прогона
  project: string;                 // basename корня проекта
  root: string;                    // abs
  file: string;                    // rel-путь от корня проекта
  kind: 'agent' | 'skill' | 'command' | 'plugin' | 'agents-md';
  code: 'mutated' | 'conflict';
}

collectDecisions(deps) -> {
  targets: DecisionTarget[];                       // адресуемые решения (N, --resolve)
  diverged: { project: string; file: string; ownerSkill: string | null; version: string | null }[];
  skippedProjects: { name: string; reason: 'worktree' | 'pinned' | 'missing' }[];
}
```

`diverged` возвращается отдельным списком: он не адресуем (у владельца проекта нет
легального глагола — это зона Стюарда), но обязан быть видимым и учитываться в exit
(§4.9, §4.16, решение L0 2026-10-25).

Правила:

- Проекты — в порядке `registry.listStrict()` после `dedupeByRealpath`; проекты
  со статусом `worktree`/`pinned`/`missing` не сканируются (они и в проходе
  пропускаются); причина попадает в `skippedProjects` для честного вывода.
  Фильтр и realpath-дедуп **не дублируются**: `planOf`/`PlanStatus`/`ProjectPlan`
  экспортируются из `src/app/use-cases/upgrade-projects.ts` (сегодня `planOf`
  приватный, `statusOf` уже экспортирован); `upgrade-projects.ts` входит в
  allowlist T7. Второй реализации статусов нет — иначе нумерация прохода и
  `--check` разойдутся (NFR-06).
- Внутри проекта сначала цели карты в порядке `map.files`, затем `AGENTS.md`,
  затем цели инспекции вне карты — по алфавиту. Один и тот же порядок задаёт и
  нумерацию, и порядок строк текстового вывода (NFR-06).
- В реестр попадают `mutated` (по свидетелю) и `conflict` (безштампованный файл
  на месте цели карты). `differs`/`missing` — не решения: проход сделает их сам.
- Защищённые файлы не попадают (они `protected`).
- Нумерация сквозная по прогону, 1-based, стабильна при неизменном состоянии
  (NFR-06); `--here` нумерует только свой проект.
- Дрейф `orphan` (штамп вне карты) реестром **не** нумеруется: решается путём
  (`--resolve <path>=protect`, §4.8), печатается по имени (REQ-01). `diverged`
  лица тоже не получает `N` (нет глагола), но возвращается списком `diverged` и
  печатается отдельной секцией (§4.9), учитывается в exit (§4.16) — это явное
  ограничение, зафиксировано в help и docs.

`collectDecisions` строго read-only: `inspectBaseSet` + `loadSyncState` +
`parseProtect`. Он же — источник `decisions[]` в `--json` и нумерованного
списка в `--review`/`--resolve`/`--show` (REQ-11 AC2).

### 4.8 `--resolve` (REQ-06)

**Грамматика CLI.** Флаг повторяемый; в одном значении допускается список
через запятую:

```
wolf upgrade [--here] --resolve <target>=<verb>[,<target>=<verb>]...
target := <rel-путь> | <project>/<rel-путь> | <N>
verb   := take | keep | protect | pin
```

Разбор:

1. Пустое значение, пустой target, пустой verb → error `--resolve: expected
<file|N>=take|keep|protect|pin` (exit 1, без записей).
2. Неизвестный глагол → error со списком допустимых.
3. `N` — целое ≥ 1 (`/^\d+$/`); иначе трактуется как путь (путь, начинающийся с
   цифры, задаётся как `./3=…` — документируется в help).
4. Путь: в `--here` — относительно cwd; в парковом режиме — `<project>/<rel>`
   либо `<rel>`, если он уникален среди реестра решений. Несколько совпадений →
   error со списком кандидатов (ничего не применено).
5. Дубликат цели в одной команде (по пути или по номеру) → error «target listed
   twice» (защита от двойного применения).

**Область целей (что вообще можно адресовать).** Цель валидна, если она
принадлежит **множеству управляемых целей** проекта:

1. файл из реестра решений (§4.7) — адресуется и по `N`, и по пути;
2. цель карты (`map.files[].path` → проектный путь) или `AGENTS.md` — даже если
   она сейчас защищена, идентична или отсутствует; только по пути (`N` для неё
   нет);
3. wolf-управляемый файл в каталогах base-set вне карты (orphan) — только по
   пути.

Всё остальное — `error: unknown target <…>`, печатается актуальный нумерованный
список, записей нет. Так `--resolve` работает и на защищённых целях (REQ-05 AC3:
`--resolve <файл>=take` снимает ключ и берёт эталон), и на orphan, а `N`
остаётся стабильным ключом реестра.

**Матрица «глагол × класс цели»** (закрывает область применения; ⛔ — error с
подсказкой, записей нет):

| Класс цели                                 | take                                                  | keep                                                                              | protect                                                               | pin                              |
| ------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------- |
| `mutated` (реестр)                         | ✅ бэкап → эталон → свидетель                         | ✅ свидетель `{hash(local), origin:'keep', base}` (правило 6.5 держит его дальше) | ✅ keep + `protect: true`                                             | ✅ keep + `protect: <base>`      |
| `conflict` (безштампованный на месте цели) | ✅ бэкап → эталон (файл становится штампованным)      | ⛔ не гасит конфликт: `use protect (hold) or take (base)`                         | ✅ защищённая вариация (правило 2 §4.3)                               | ✅ то же, с версией базы         |
| `protected` (вне реестра)                  | ✅ снять ключ → эталон, локальное в бэкап             | ✅ снять ключ, свидетель `{hash(local), origin:'keep', base}`                     | ✅ идемпотентно (`true`)                                              | ✅ обновить значение на `<base>` |
| `orphan` (штамп вне карты, эталона нет)    | ⛔ `no base for a file outside the update map`        | ⛔ `conflict comes from the map, not the witness — use protect`                   | ✅ `protected` (конфликт гаснет)                                      | ✅ `protected` с версией базы    |
| `AGENTS.md` со штампом (без frontmatter)   | ✅ бэкап → эталон (штампованный whole-file)           | ✅ свидетель `{hash(local), origin:'keep', base}`, правило 6.5 §4.3               | ⛔ `AGENTS.md has no YAML frontmatter`                                | ⛔ то же                         |
| `AGENTS.md` блочный (без штампа)           | ✅ бэкап → свежий целиком (append-режим прекращается) | ✅ ничего не меняется, файл остаётся вне синка                                    | ⛔ нет frontmatter                                                    | ⛔ нет frontmatter               |
| `kept` (принятый локальный контент)        | ✅ бэкап → эталон → свидетель `origin:'render'`       | ✅ идемпотентно: свидетель остаётся `origin:'keep'`, база обновляется             | ✅ keep + `protect: true`                                             | ✅ keep + `protect: <base>`      |
| `removed` (цель удаления, подтверждённая)  | ⛔ `no base for a file outside the update map`        | ✅ снять `protect` (unprotect, REQ-05): файл снова попадает в список удалений     | ✅ ключ держит: файл не удаляется, исход `protected` + подсказка      | ✅ то же, `protect: <base>`      |
| файл без frontmatter (любой)               | ✅ по общим правилам                                  | ✅ по общим правилам                                                              | ⛔ `cannot protect <path>: no YAML frontmatter — add one or use keep` | ⛔ то же                         |

`protect` у AGENTS.md не поддерживается ни в одном режиме (решение L0,
2026-10-25): в матрице остаются отказы ⛔ «нет frontmatter», отдельной строки
`protected` для AGENTS.md нет, ручной frontmatter защищаемым файл не делает
(§4.5, §4.11).

`take` всегда идёт через бэкап, если локальный контент отличается от эталона
(NFR-05); `keep`/`protect`/`pin` контент не переписывают и бэкап не требуют.

**`protect` × удаление (решение L0, 2026-10-25).** Защита сильнее подтверждения
списка: защищённая `removed`-цель не удаляется ни проходом, ни `--yes`; в сверке
она получает `protected` (вне needs-decision) и подсказку
`wolf upgrade --resolve <путь>=keep`. `keep` на защищённой цели снимает ключ
(unprotect, REQ-05) — после этого файл снова попадает в список удалений
следующего прохода. Обратный порядок (`confirmedRemovals` сильнее `protect`)
не допускается: он означал бы потерю локального контента вопреки REQ-05.

**Разбор и двухфазность (AC3 «к другим файлам ничего не применено»).**

```
1) collectDecisions() -> targets                     // для N и для проверки «это решение?»
2) parse всех аргументов -> ops[]
   ошибки разбора (пусто, неизвестный глагол, дубль цели, N вне реестра,
   путь вне управляемых целей, глагол ⛔ по матрице) собираются ВСЕ
   если ops.errors непуст -> печать всех ошибок + список решений, exit 1, записей нет
3) apply по порядку реестра (не по порядку ввода), детерминированно:
     prepare(verb, target) -> { backup?: true, fileWrite?: content, stateWrite: hash }
     backup (если нужен) -> fileWrite (atomic) -> saveSyncState (atomic)
4) re-collect decisions -> печать дайджеста: применено / осталось
5) exit: 1 при любой ошибке записи; 2 если остались адресуемые решения
   или `diverged`; 0 иначе
```

Сбой на шаге k: применённые 1..k−1 остаются (каждая операция идемпотентна,
повтор безопасен), печатается `error: <файл> — <причина>`, оставшиеся цели не
трогаются, exit 1.

**Семантика глаголов и свидетель.**

| Глагол    | Файл                                           | `protect` | Свидетель                                         | Бэкап                              |
| --------- | ---------------------------------------------- | --------- | ------------------------------------------------- | ---------------------------------- |
| `take`    | `fresh` (эталон), atomic; ключ снимается       | снят      | `{hash(fresh), origin:'render', base}`            | да, если локальный контент ≠ fresh |
| `keep`    | не пишется, кроме снятия строки ключа (atomic) | снят      | `{hash(normalize(current)), origin:'keep', base}` | нет                                |
| `protect` | `insertProtect(current, 'true')` (atomic)      | `true`    | `{hash(normalize(current)), origin:'keep', base}` | нет, если файл не менялся иначе    |
| `pin`     | `insertProtect(current, map.version)` (atomic) | `X.Y.Z`   | `{hash(normalize(current)), origin:'keep', base}` | нет                                |

- `pin` фиксирует **текущую версию базы** = `map.version` (глоссарий §2);
  loader карты уже гарантирует `map.version === package.json.version`.
- `keep` у защищённой цели **без** свидетеля создаёт свидетель `origin:'keep'`:
  это и есть «принять локальный как канон»; правка файла после этого снова
  ловится правилом 6 как mutated, а до правки действует 6.5 (файл остаётся
  локальным). У `conflict`/`orphan` глагол `keep` не применяется (матрица выше) —
  там «локальный» не гасит конфликт; у блочного `AGENTS.md` `keep` — законный
  no-op (файл и так вне синка).
- `protect`/`pin` при отсутствии свидетеля тоже пишут свидетель (симметрия;
  защищённые цели свидетель не проверяют).
- `take` на защищённом файле — единственный глагол сильнее `protect` (REQ-05):
  ключ снимается, берётся эталон, локальный контент уходит в бэкап.
- `keep`/`protect`/`pin` не меняют контент, поэтому NFR-05 (бэкап) не требует
  копии: потери нет. Исключение — снятие ключа: строка ключа исчезает, но это
  намеренное действие владельца.
- `stateWrite` в prepare всегда несёт полную запись `SyncEntry` (хэш +
  происхождение + база) — не строку; смешивать форматы в одном файле
  запрещено, `loadSyncState` нормализует легаси (§4.2).
- Валидация после вставки (§4.1 правило 3): структурная целостность блока +
  распознавание вставленного значения + обратимость с `normalizeManaged`,
  иначе отказ без записи. Причина — spike R-01: opencode молча выбрасывает
  агента с битым frontmatter (§5).

**Взаимодействие с проходом.** `--resolve` не запускает проектный проход: он
применяет ровно заказанные решения и печатает дайджест. Остальные категории
(`new`/`changed`/`removed`) применяются следующим `wolf upgrade` — это
идемпотентно (NFR-02). `--resolve` совместим с `--here` (один проект) и с
`--json` (дайджест в JSON). Режим **завершается до npm-фазы и re-exec** (§4.18):
`wolf upgrade --resolve …` в парке никогда не самообновляет CLI и не запускает
полный проход; `--yes` вместе с `--resolve` — ошибка аргументов (exit 1, записей
нет), потому что `--yes` описывает проход, а не отдельные решения.

### 4.9 `--review` (REQ-07)

**TTY.** Цикл по `collectDecisions()` в порядке нумерации; файлы не меняются до
ответа.

```
[3/7] .opencode/agents/foo.md — mutated · base 2.20.0
  локальный: 42 строки · эталон: 38 строк · −12 +8
  --- a/эталон 2.20.0
  +++ b/локальный
  @@ … (не более 40 строк diff; «… ещё N строк»)
  выбор: [t]ake [k]eep [p]rotect [v]pin [s]kip  (a — применить ко всем похожим, q — выйти)
```

- Клавиши — ровно `t`/`k`/`p`/`v`/`s` из требования (v = pin), плюс `a`
  («применить ко всем похожим») и `q`.
- **Критерий похожести** (закрывает открытый пункт): та же пара
  `kind` + `code` (например все `agent`/`mutated`). После выбора глагола, если
  в остатке есть похожие цели, задаётся один вопрос:
  `применить «take» ко всем 3 оставшимся agent/mutated? [y/N]`; перечень целей
  печатается до применения (пользователь видит, что затронет).
- Пустой ввод/неизвестная клавиша → переспрос (без изменения файлов); `q` или
  EOF (Ctrl-D/Ctrl-C) → цикл завершается, уже принятые решения остаются
  применёнными (каждое — атомарная операция), печатается дайджест.
- Применение — те же `applyResolution`, что у `--resolve` (одна семантика,
  один бэкап-путь).
- **`diverged` (лица памяти) в TTY-цикл не входят** — у владельца проекта нет
  легального глагола; после цикла они печатаются отдельной секцией
  `faces (steward zone): <owner_skill> diverged (v<версия>)` с пометкой, что
  разбор — зона Стюарда.
- После цикла: `re-collect` → дайджест; exit 2, если остались решения **или
  `diverged`**, иначе 0.
- Diff строится `line-diff.ts` (§4.10) между нормализованным локальным
  контентом и `fresh`.

**Non-TTY (AC2).**

```
wolf upgrade --review            (stdout не TTY)
upgrade — review (non-interactive): 2 files need a decision

  1  my-proj            .opencode/agents/foo.md       mutated   base 2.20.0
  2  my-proj            .opencode/skills/bar/SKILL.md conflict  —

steward zone (not addressable by --resolve): 1
  my-proj            faces/executor-lead.md         diverged  v2.19.0

разобрать по одному:  wolf upgrade --review          (в TTY)
применить решение:    wolf upgrade --resolve 1=keep --resolve 2=protect
посмотреть файл:      wolf upgrade --show 1

exit 2, файлы не изменены
```

(`conflict` на файле без YAML-frontmatter, например `AGENTS.md`, глаголом
`protect` не решается — матрица §4.8; в примере взят skill-файл с frontmatter.)

Секция `steward zone` печатается всегда, когда есть `diverged`, и не исчезает от
`--yes`: она видима, помимо `--resolve` (глагола для неё нет), и держит exit 2,
пока лицо не приведено в порядок Стюардом. Это следует из NFR-01 (2 = есть
needs-decision) и REQ-07 (каждый needs-decision виден), но **не** расширяет
`--resolve`: адресуемого глагола для `diverged` не вводится (решение L0
2026-10-25).

`--review` в non-TTY никогда не пишет (NFR-03-подобная гарантия для этой ветки).

### 4.10 `--show` (REQ-08)

```
wolf upgrade [--here] --show <file|N>
```

Read-only; цель ищется по тому же реестру (§4.7), но `--show` **разрешает** и
файл, который сейчас не needs-decision (например уже защищённый) — тогда
нумерация `N` не применяется, нужен путь.

```
.show output (пример)
file:      .opencode/agents/foo.md   (project: my-proj /abs/path)
protect:   2.19.0  (pinned; recognized)
base:      2.20.0   file stamp: 2.19.0   witness: n/a (protected)   drift: local ≠ base
--- a/локальный (как есть)   +++ b/эталон 2.20.0   (что получишь при --resolve …=take)
@@ -1,3 +1,4 @@ ...
…
release:   wolf upgrade --resolve .opencode/agents/foo.md=take
```

Diff — `line-diff.ts`: построчный LCS с лимитами (≤ 4000 строк входа, ≤ 200
строк вывода, далее `… ещё N строк`), без внешних зависимостей, детерминирован
(тест на стабильность). Файл не изменяется; `--check`-подобных записей нет
(NFR-03).

Файл **вне карты** (нет эталона: `renderFreshFile` вернул `null`): diff не
строится, вместо него строка

```
base:      n/a (file outside the update map)   protect: true   drift: n/a
           ⓘ no base to take; the file is held as a sanctioned local variation
```

exit 0 (цель известна), записей нет. `take` на такой цели по-прежнему отказывает
(матрица §4.8), поэтому подсказка `--resolve …=take` не печатается — только
`--resolve <путь>=protect|pin` при необходимости сменить значение.

### 4.11 Секция Protections в `--check` (REQ-09, NFR-03)

Печатается **всегда** — и в парковом `--check`, и в `--here --check`, и при
чистом парке; при отсутствии защит — строка `Protections: none`.

```
Protections
  my-proj    .opencode/agents/foo.md          protect: 2.19.0   behind (base 2.20.0)
  my-proj    .opencode/skills/bar/SKILL.md    protect: true     ok
  other      .opencode/command/baz.md         protect: 2.18.5   behind (base 2.20.0)
  3 protected files · release: wolf upgrade --resolve <file>=take
```

`AGENTS.md` в реестре не появляется: `protect` у него не поддерживается
(§4.5, решение L0 2026-10-25), а блочный режим и так сохраняет пользовательский
текст — защищать нечего. Ручной YAML-frontmatter в AGENTS.md не делает файл
защищаемым и в реестр не попадает.

**Режимы `--check`.** `--check` печатает секцию и в парке, и с `--here`. Второй
режим — **отдельный read-only проход по одному проекту** (cwd): только
`inspectBaseSet` + `listProtections`, без реестра, npm-фазы, sync-state и
бэкапов; exit всегда 0. В baseline `--here` проверяется раньше `--check`
(`memory-upgrade.ts:718-721`), поэтому без явной диспетчеризации
`wolf upgrade --here --check` уходит в обычный проектный проход и **пишет**
файлы. Контракт диспетчеризации — §4.18; владелец — T13.

- Обход — `renderer.listProtections(root, map.version)`: каталоги
  `.opencode/agents`, `.opencode/skills`, `.opencode/command`, `.opencode/plugins`
  (read-only `readFileSync` + `parseProtect`), включая файлы вне карты
  (санкционированная вариация видна в реестре, но не в needs-decision).
- `behind` = `normalizeManaged(current) !== renderFreshFile(rel)`; для файла вне
  карты эталона нет → `behind: null` (в тексте `drift: n/a`).
- `kept`-файлы (правило 6.5 §4.3) в реестр Protections не входят (это не
  in-file защита), но в деталях проекта печатается `kept (local): <пути>` с
  базой принятия; класс проекта они не ухудшают (не `behind`, не
  `needs-decision`) — иначе `keep` (REQ-06) снова выглядел бы как отставание.
- Значение вне грамматики → `recognized: false`, вывод `protect: <raw>
(unrecognized — treated as protected)`.
- Проекты без чтения (missing/ошибка) → строка `unknown` в своей секции, реестр
  не ломается; сбой чтения — error-строка, exit остаётся 0.
- Секция строится из того же `ProtectEntry[]`, что и `--json.protections`, поэтому
  текст и JSON не расходятся.
- **Место в выводе `--check`:** секция Protections — последняя секция документа
  (после секций проектов и перед финальной строкой `hint`, если она есть); в
  `UpgradeCheckJson` ей соответствует поле `protections`, порядок проектов общий.
  Так парковый и `--here`-режимы дают одинаковый хвост вывода.
- **Строго read-only**: `inspectBaseSet`/`listProtections` не вызывают
  `saveSyncState`; проверка NFR-03 — снапшот mtime+sha256 по всем файлам проекта
  до/после (тест). Для `--here --check` тот же снапшот и тот же тест.

### 4.12 `--yes`, бэкапы и восстановление (REQ-10, NFR-05)

**Тихий режим.** Не-TTY + `--yes` (или TTY + `--yes`):

- `mutated` → `take` с бэкапом. **Механизм — один:** проход включает режим
  `syncBaseSet(..., { takeMutated: { backup } })` (правило 6′ §4.3); бэкап-хук
  собирает `decisions.ts` (`backupLocalFile`), рендерер только требует порядок
  «бэкап → запись → свидетель». Post-фазы и повторного прохода нет: отчёт шага
  уже содержит исход `updated` с полем `backup`, поэтому verify, счётчики,
  дайджест и `--json` строятся из одного прохода.
- `conflict` (безштампованный файл на месте цели) — **не** разрешается
  автоматически: wx-политика сильнее `--yes`; остаётся needs-decision → exit 2.
- `diverged` лица — память, зона Стюарда; остаётся needs-decision, exit 2.
- `protect`/`pin`/`kept` — держатся молча, не бэкапируются (REQ-10 AC3: их не
  меняют); `kept` — принятый локальный контент (правило 6.5 §4.3), тихий режим
  его не отменяет.
- Дайджест называет файл и путь бэкапа:
  `took base for .opencode/agents/foo.md (local saved: .wolf/backup/upgrade/2026-10-25/.opencode/agents/foo.md)`.
- exit 0, если решений не осталось (сценарий AC1), иначе 2 (см. выше).
- Bare `wolf upgrade` в TTY: существующее подтверждение списка + при
  needs-decision подсказка `hint: 3 files need a decision — run wolf upgrade --review`.

**Формат бэкапа.**

```
backupLocalFile(root, rel, content, now) -> { path: string; created: boolean }
  dir = <root>/.wolf/backup/upgrade/<YYYY-MM-DD>     // локальная дата, одна на прогон
  target = join(dir, rel)
  если существует: base.ext, base-2.ext, base-3.ext … (первый свободный, без перезаписи)
  mkdir -p dirname(target); writeFileAtomic(target, content)
```

- Порядок записи: **бэкап → эталон → свидетель**; сбой записи эталона оставляет
  бэкап (безвреден), сбой бэкапа отменяет перезапись файла.
- **Удаление `removed`-цели — тот же бэкап** (F1, `runProjectStep`): у цели нет
  эталона, поэтому копия делается **всегда** — `backupLocalFile(root, rel,
content, now)` → `.wolf/backup/upgrade/<date>/<rel>` → `unlink`; путь копии
  попадает в `ProjectReport.backups` и в дайджест. Реализация функции живёт в
  `src/app/use-cases/project-step.ts` и переиспользуется `--resolve`/`--yes`
  (второй копии формата нет). Защищённая цель не удаляется вовсе (§4.8), поэтому
  и копии не требует — её контент не меняется.
- Восстановление: копирование файла из бэкапа обратно; после этого файл —
  обычный `mutated` (локальный контент ≠ свидетель и ≠ эталон), и
  `--resolve <файл>=protect` легально его замораживает (REQ-10 AC2). GC не
  предусмотрен (не-цель волны), путь документируется.
- Права/время бэкапа не сохраняются (копия контента, не артефакт ФС) — осознанно.

### 4.13 `--json` (REQ-11)

Схема — версия в поле `schema`; стабильность в мажоре: аддитивные поля
допускаются в миноре, переименование/удаление — новый мажор (`/2`).

```ts
interface UpgradeJson {
  schema: 'wolf.upgrade/1';
  exit: 0 | 1 | 2; // совпадает с кодом процесса (AC3)
  mode: 'pass' | 'here' | 'check' | 'resolve' | 'show';
  cli: { installed: string; available: string | null };
  /** Заполняется, когда проход не дошёл до проектов (npm-фаза, lock, реестр, карта). */
  error?: string;
  plan: { projects: number; new: number; changed: number; deprecated: number; removed: number; faces: number };
  projects: Array<{
    name: string;
    path: string;
    status: 'updated' | 'up-to-date' | 'needs-decision' | 'error' | 'skipped';
    skipReason?: 'worktree' | 'pinned' | 'missing';
    error?: string;
    files: Array<{ path: string; code: string; inMap: boolean }>;
    protected: Array<{ path: string; value: string; behind: boolean | null }>;
    backups: Array<{ file: string; backup: string }>;
  }>;
  decisions: Array<{
    n: number;
    project: string;
    path: string;
    code: 'mutated' | 'conflict';
    /* номер, проект и путь — те же, что в текстовом списке; значение ключа здесь не нужно */
  }>;
  /** Лица памяти: видны и учитываются в exit, но не адресуемы (зона Стюарда). */
  diverged: Array<{ project: string; face: string; version: string | null; ownerSkill: string | null }>;
  protections: Array<{ project: string; path: string; value: string; recognized: boolean; behind: boolean | null }>;
}
interface UpgradeCheckJson {
  schema: 'wolf.upgrade.check/1';
  exit: 0;
  cli: { installed: string; available: string | null };
  projects: Array<{
    name: string;
    path: string;
    class: 'current' | 'behind' | 'needs-decision' | 'unknown';
    differ: string[];
    missing: string[];
    mutated: string[];
    foreign: string[];
    /** Причины наблюдений (`onboarding markers broken`), не парсятся из текста. */
    details: string[];
    protected: Array<{ path: string; value: string; behind: boolean | null }>;
  }>;
  diverged: UpgradeJson['diverged'];
  protections: UpgradeJson['protections'];
}
```

Правила:

- `decisions[].n` — та же нумерация, что в текстовом non-TTY выводе (AC2); оба
  берутся из `collectDecisions` (§4.7), второй реализации нет.
- В `--json` stdout содержит **только** JSON-документ (`JSON.stringify(doc)` без
  отступов + `\n`); баннер, логотип и человеческие строки подавлены, чтобы вывод
  был парсабельным. Диагностика попадает в `error`/`projects[].error`/`files[]`,
  а не в свободный текст stderr.
- **Сквозь npm-фазу и re-exec.** `--json` прокидывается в argv ребёнка
  (`upgrade-projects … --json`) — базовый `reExecUpgradeProjects`
  (`memory-upgrade.ts:643`) собирает argv явно, поэтому список флагов
  расширяется; дочерняя команда `upgrade-projects` получает опцию `--json`
  (`src/adapters/cli/commands/upgrade-projects.ts`, allowlist T11) и печатает
  единственный документ. Фаза 1 при `--json` **ничего не печатает** (ни баннер, ни
  `printOutcome`): единственный JSON-документ печатает фаза 2 — у неё полный
  результат прохода. Если npm-фаза падает, документ печатает фаза 1 с
  `exit: 1`, `error: <причина>`, `projects: []`. Полный контракт диспетчеризации
  (какие режимы доходят до re-exec) — §4.18.
- `--json` без `--yes` в non-TTY = отменённый проход: `projects` содержит только
  статусы плана, `decisions` заполнен, `exit: 0` (паритет с текстом). Отмена —
  не разбор состояния: даже если в парке есть `diverged`, отменённый проход
  остаётся 0 (поведение 2.19.0 сохраняется, NFR-01). `--json` в TTY печатает тот
  же документ и **не** задаёт интерактивных вопросов: JSON — это машинный режим
  вывода, а не TTY-интерактив.
- `--json` + `--check`: re-exec нет (check-ветка возвращается раньше) →
  `UpgradeCheckJson` из того же процесса; `--json --check --here` — тот же
  `UpgradeCheckJson` с единственным проектом (cwd), §4.18.
- Комбинации: `--json` + `--resolve` → `UpgradeJson` с `mode:'resolve'`,
  `projects: []` (прохода нет), заполненными `backups` и `decisions` после
  применения (остаток реестра); `--json` + `--show` → `mode:'show'`, `decisions`
  — остаток реестра, `projects: []`, diff в текстовом `--show` не дублируется в
  JSON (документ остаётся стабильным); `--json` + `--review` → error
  `--review is interactive; --json is not supported` (exit 1, единственный
  документ с `error`).

### 4.14 Восстановление `mcp.wolf` в init (REQ-04)

Причина дефекта (baseline): `initProject` пишет платформенные конфиги только при
явном `input.platformChoice` (`src/app/use-cases/init-project.ts:317`); без
`--platform` (WP1-минимальный путь) конфиг не трогается, а `doctor` советует
`run wolf init` (`doctor.ts:100`) — совет невыполним.

```
initProject(...):
  ... base-set рендер ...
  if (deps.npx)                      -> как сейчас (никогда не пишем конфиги)
  else if (platformChoice !== undefined) -> как сейчас (replace-набор, §4.4 п.1)
  else:
    repaired = []
    for adapter of deps.adapters:
      if (!adapter.detect(baseDir)) continue                  // платформы нет — не создаём
      cfg = await adapter.readConfig(baseDir).catch(() => BROKEN)
      if (cfg === null) continue                             // конфиг-файла нет — минимальный init его не создаёт
      if (cfg === BROKEN) { outcome skipped 'config is not valid JSONC — fix it first'; continue }
      // решение «надо ли писать» принимает writeConfig: второй копии условия нет
      outcome = await adapter.writeConfig(baseDir, deps.mcpCommand)   // 'unchanged' | 'written' | 'replaced'
      if (outcome.action === 'written' || outcome.action === 'replaced')
        outcome.reason = `init: repaired missing/corrupted ${adapter.id} wolf entry`
```

- Используется существующий `writeConfig` (`opencode-adapter.ts:94`), который уже
  мерджит `mcp.wolf`/`default_agent`/`subagent_depth` и сохраняет остальной JSON
  (`writeFileAtomic`, отступ 2). Новый код не дублирует проекцию конфига.
- Идемпотентность (AC2): второй `init` возвращает `unchanged` — запись не
  дублируется и не меняется. Условие **одно** и живёт в `writeConfig`
  (`mcpOk && da !== undefined && sd !== undefined`, `opencode-adapter.ts:125`);
  `initProject` его не повторяет и не вводит собственных хелперов каноничности,
  иначе ветка и причина расходятся с фактическим поведением. Кастомный
  `default_agent` не мешает: `writeConfig` считает `unchanged` уже по наличию
  ключа, а конфликтное значение не перезаписывает.
- Некорректная запись (`mcp.wolf` строкой/массивом) → `writeConfig` вернёт
  `replaced` с каноническим блоком (AC1), остальной JSON сохраняется.
- Битый JSONC → `readConfig` бросает `UserFacingError`; init это ловит и
  рапортует `skipped` с причиной — конфиг не трогается, init не падает (fail-soft,
  exit 0); это видно в выводе init.
- Doctor (AC3) не меняется: после починки `mcp.wolf !== undefined` → строки
  `wolf entry missing` нет. Отдельного кода в doctor не требуется — контракт
  подтверждается интеграционным тестом `doctor` после `init`.
- Границы: конфиг **не** создаётся, если его не было (минимальный init остаётся
  минимальным); чужие MCP-записи не трогаются; `--platform` с явным списком
  сохраняет семантику replace.

### 4.15 Имена файлов в выводе (REQ-01)

- `freshnessDetails` (`memory-upgrade.ts:503`): `differs` печатается **всеми**
  путями (`2 differ: .opencode/agents/a.md, .opencode/skills/b/SKILL.md`), как
  уже делается для `mutated`/`foreign`. Усечения нет — REQ-01 требует путь
  каждого файла, а не выборку; длинный список переносится рендерером по ширине
  терминала (`renderReport`), а не обрезается.
- `stepDetailLines` (`memory-upgrade.ts:217`) и `projectsSection`
  (`upgrade-projects.ts:398`): новый источник строк — `report.verify.items`
  (а не счётчики sync), поэтому имя появляется у каждого needs-decision-файла:
  `needs decision: .opencode/agents/foo.md (mutated), AGENTS.md (conflict)`.
- Лица памяти (`diverged`) печатаются отдельной строкой по `owner_skill`
  (`faces: executor-lead diverged (v2.19.0)`), а не как пути файлов: REQ-01
  говорит о файлах, а лицо — объект памяти (зона Стюарда). В `--check` они
  печатаются в секции проекта/`steward zone`, во всех режимах — из одного
  `collectDecisions().diverged`.
- Причины наблюдений идут из `InspectOutcome.detail` (не из reason-строк):
  `--check` печатает строку `detail: onboarding markers broken — treated as
foreign (.opencode/...)` в секции проекта, после списков классов; в JSON это
  `projects[].details`. Класс проекта при этом остаётся `unknown`/`current`, exit
  не меняется (NFR-01).
- Счётчики (`base-set: 1 mutated` и `verify: 5/7 ok · 2 needs decision`)
  сохраняются дословно (AC3); имена — дополнительная строка.
- Порядок имён: у файлов реестра решений — порядок §4.7; у прочих фактов —
  порядок `verify.items` (карта → AGENTS.md → вне-карты); `N` в `--json`/тексте
  всегда из `collectDecisions` (§4.7), второй нумерации нет.

### 4.16 Матрица режимов и exit-код (NFR-01)

| Режим                     | Записи                     | exit                                                                                                         |
| ------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `--check` (парк)          | нет                        | всегда 0                                                                                                     |
| `--here --check`          | нет                        | всегда 0 (read-only инспекция cwd; `--check` сильнее `--here`, §4.18)                                        |
| `--check --json`          | нет                        | всегда 0                                                                                                     |
| `--show`                  | нет                        | 0 (в т.ч. файл вне карты — diff не строится); 1 при неизвестной цели                                         |
| `--review` (TTY)          | по решениям                | 0, если решений и `diverged` не осталось; 2 если остались; 1 при сбое записи                                 |
| `--review` (non-TTY)      | нет                        | 0 при отсутствии решений и `diverged`; 2 если они есть (NFR-01, §4.9)                                        |
| `--resolve`               | по решениям                | 0 / 2 (остались решения или `diverged`) / 1 (ошибка)                                                         |
| `--yes` (non-TTY или TTY) | проход                     | 0 / 2 (остались conflict/diverged) / 1 (error проекта)                                                       |
| bare `upgrade` (TTY)      | проход после подтверждения | 0 / 1 / 2 как в 2.19.0                                                                                       |
| bare `upgrade` (non-TTY)  | нет                        | 0 (`Cancelled: --yes is required`) + список решений; отмена не даёт 2 даже при `diverged` (поведение 2.19.0) |
| любая несовместимая пара  | нет                        | 1 (ошибка аргументов/комбинации: `--review --json`, `--resolve --yes`, `--show --resolve`, …), §4.18         |

`protected` и исцеление (исход `updated` с reason) в needs-decision не входят →
exit 2 не производят. `diverged` — единственный needs-decision без адресуемого
глагола: он держит exit 2, но не входит в нумерацию `--resolve` (§4.7, §4.9).

### 4.17 Отказные сценарии, атомарность и наблюдаемость

| Сценарий                                        | Поведение                                                                                                                                | Наблюдаемость                                                        |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| сбой бэкапа (EACCES/ENOSPC)                     | перезапись файла **отменяется**, файл и свидетель не меняются                                                                            | `error: backup failed …`; exit 1                                     |
| сбой записи эталона после бэкапа                | бэкап остаётся (безвреден), свидетель не обновляется                                                                                     | error-строка; exit 1                                                 |
| сбой записи свидетеля после записи файла        | файл уже обновлён; свидетель отстаёт → ошибка с явным предупреждением: локальные `keep`-правки могут быть перезаписаны следующим `--yes` | `error: sync-state not saved — do not run --yes until fixed`; exit 1 |
| вставка `protect` даёт непарсящийся frontmatter | отказ до rename; файл байт-в-байт прежний                                                                                                | `error: … frontmatter would break`; exit 1                           |
| файл без frontmatter, `protect`                 | отказ, подсказка `add one or use keep`                                                                                                   | error; exit 1                                                        |
| read-only `--check`, сбой инспекции проекта     | error-строка проекта, остальные проекты считаются, exit 0                                                                                | `error:` в секции проекта                                            |
| битый `opencode.json` при init                  | `skipped` + причина, конфиг не тронут, остальной init идёт                                                                               | строка платформы в выводе init                                       |
| коллизия бэкапов в один день                    | суффикс `-2`, `-3`, …; существующий бэкап не перезаписывается                                                                            | путь в дайджесте                                                     |
| удалённый проект в реестре во время `--resolve` | цель не найдена при валидации → error, записей нет                                                                                       | error + список                                                       |

Атомарность (NFR-04): все записи — `writeFileAtomic`
(`markdown-memory-store.ts:366`, tmp + rename). `saveSyncState` сегодня пишет
`writeFileSync` напрямую (`src/adapters/render/sync-state.ts:35`) — переводится на
`writeFileSync(tmp) + renameSync(tmp, path)` в том же каталоге (атомарный rename),
сигнатура остаётся синхронной (её вызывают из синхронных веток рендерера).
Бэкапы пишутся тем же атомарным способом.

Наблюдаемость: строки отчёта (`ReportNode`) + JSON-схема (§4.13). Новых событий
телеметрии волна не вводит (вне scope; память не мутируется, кроме посева лиц,
как и в 2.19.0).

### 4.18 Диспетчеризация флагов и re-exec (REQ-06…REQ-11, NFR-01)

Baseline: `memoryUpgradeCommand().action` проверяет `--here` **раньше** `--check`
(`memory-upgrade.ts:718-721`), а любой парковый маршрут уходит в npm-фазу и
`reExecUpgradeProjects`, чей argv содержит только
`--from/--to/--yes/--no-banner/--state` (`memory-upgrade.ts:653-663`); дочерняя
команда `upgrade-projects` знает только эти опции
(`upgrade-projects.ts:79-96`). Без явного контракта новый флаг теряется при
re-exec, и `wolf upgrade --resolve 3=protect` в парке сначала самообновит CLI и
запустит полный проход без `--resolve`.

**Порядок разбора (единственная точка — `memoryUpgradeCommand().action`):**

```
1. Проверка совместимости флагов (таблица ниже) → exit 1, записей и сети нет.
2. --check       → check-режим; --here сужает его до cwd; return ДО npm/реестра.
3. --show        → read-only по реестру; return.
4. --review      → TTY-цикл / non-TTY рецепт; return.
5. --resolve     → применение решений; return.
6. --here        → проектный шаг в cwd (без npm, без реестра) — как сегодня.
7. иначе         → npm-фаза + re-exec `upgrade-projects` (--yes опционален).
```

**Приоритет:** `--check` сильнее `--here` (проверяется первым); `--json` — не
режим, а формат вывода (совместим со всеми, кроме `--review`); повтор флагов
одного действия (`--check --show`) — ошибка.

**Несовместимые комбинации** (exit 1, печатается причина, ничего не пишется):

| Комбинация               | Причина                                                |
| ------------------------ | ------------------------------------------------------ |
| `--review` + `--json`    | review интерактивен, JSON машинный (REQ-07/REQ-11)     |
| `--review` + `--resolve` | два способа применить решения в одном вызове           |
| `--review` + `--yes`     | `--yes` описывает проход, а не разбор                  |
| `--show` + `--resolve`   | просмотр и запись в одном вызове                       |
| `--show` + `--yes`       | то же                                                  |
| `--resolve` + `--yes`    | `--yes` описывает проход, `--resolve` — решения (§4.8) |
| `--check` + `--resolve`  | check read-only, resolve пишет                         |

**Что доходит до npm-фазы и re-exec:** только маршрут 7 (bare `upgrade`,
`--yes`). `--check` (парк и `--here`), `--show`, `--review`, `--resolve`
завершаются в фазе 1 на установленном CLI; им не нужен ни self-update, ни
дочерний процесс, и они не могут «потерять» флаг.

**argv ребёнка** (`reExecUpgradeProjects`) расширяется одним флагом вывода:

```
upgrade-projects --from <v> --to <v> [--yes] --no-banner --state <path> [--json]
```

`src/adapters/cli/commands/upgrade-projects.ts` получает опцию `--json` и в этом
режиме печатает ровно один документ `wolf.upgrade/1` (`mode:'pass'`), без баннера
и человеческих строк; exit ребёнка = `exit` документа = код процесса. Новые
режимные флаги в argv не передаются — они не доходят до re-exec по построению;
если это когда-нибудь изменится, список argv и опции дочерней команды обязаны
меняться вместе (тест R11-4 фиксирует argv).

**Владельцы:** диспетчеризация и argv ребёнка — T11 (allowlist
`memory-upgrade.ts`, `upgrade-projects.ts`); ветка `--here --check`
(`upgradeCheckHereAction` + печать секции Protections; сам `listProtections`
реализует T3) — T13, мержится после T11. Оба файла —
общие, порядок слияния зафиксирован в plan.md («Конфликты»).

## 5. Spike R-01: неизвестный ключ `protect` в opencode

**Проверяемое допущение (§6 requirements):** opencode игнорирует неизвестный ключ
frontmatter `protect` у agents/skills/commands.

**Окружение:** macOS (darwin), opencode `/Users/chekh/.opencode/bin/opencode`
`v2.1.4` (`--version` → `opencode v2.1.4`, exit 0). Изоляция: свежий каталог
`mktemp -d` с подменой `HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`,
`XDG_STATE_HOME`, `XDG_CACHE_HOME` на подкаталоги tmp; cwd — tmp-проект; live
проект и live-конфиг не участвуют (все запуски шли с изолированным `HOME`, запись
в `~/.config/opencode` невозможна по построению). Сетевых вызовов и вызовов
модели нет.

**Исторический вывод спайка (сохранён как история; в v2.1.4 на этой машине
не воспроизводится — `opencode debug agents` возвращает `[]`, см. пункт 2 и
«Живой прогон» ниже).**

```
$ opencode --version
opencode v2.1.4
exit=0

$ opencode service set port 51778        # изолированный HOME: сервис на свободном порту
exit=0

$ cd <tmp>/proj && opencode debug agents    # первый запуск после старта сервиса
exit=0   stderr: 0 байт
agents listed: 0

$ opencode debug agents                     # второй запуск, состояние то же
exit=0   stderr: 0 байт
agents listed: 10 | builtin: 7 | custom spike-*: 3
  spike-control  mode=subagent  request.body={}
  spike-pin      mode=subagent  request.body={"protect": "2.19.0"}
  spike-protect  mode=subagent  request.body={"protect": true}
spike-broken present: False

$ opencode debug agents                     # третий запуск
exit=0   вывод побайтово идентичен второму (cmp)
```

Файлы фикстуры — `.opencode/agents/{spike-protect,spike-pin,spike-control,spike-broken}.md`;
`spike-broken` содержит заведомо битый YAML (`description: [oops`).

**Результат.**

1. **Загрузка не страдает (подтверждено):** агент с `protect: true` и с
   `protect: 2.19.0` присутствует в списке, `mode` распознан, stderr пуст, exit 0.
   Ключ не отвергается и не мешает парсингу файла.
2. **Ключ не «игнорируется» на уровне загрузки, но и не попадает в запрос
   провайдеру (уточнено живым прогоном 2026-10-25).** `opencode debug agents` в
   v2.1.4 на изолированной фикстуре возвращает пустой список (`[]`), поэтому
   прежнее наблюдение `request.body={"protect":true}` **не воспроизводится** и
   как evidence больше не используется. Перехват настоящего HTTP-запроса
   (capture-proxy перед реальным провайдером, §«Живой прогон») показывает: тело
   запроса содержит только `model,messages,[tools,]stream,stream_options,
max_completion_tokens`; поля `protect` нет ни у primary-, ни у subagent-агента.
   То есть ключ читается wolf'ом из файла, но в model-запрос не уходит — риск
   провайдерского 400 для `protect` в v2.1.4 отсутствует.
3. **Негативный контроль не удался:** агент с битым YAML **молча** отсутствует в
   списке (exit 0, пустой stderr). Значит «нет ошибки» само по себе не доказывает
   корректность, а битый frontmatter приводит к тихой потере агента. Отсюда
   обязательное требование дизайна: после вставки ключа волф сам делает
   структурную проверку frontmatter до rename (§4.1, §4.8).

**Ограничения проверки (честно):**

- Перечисление **commands** и **skills** read-only в v2.1.4 недоступно
  (`opencode debug` знает только `agents|config|paths|heap-dump`; `api` требует
  OpenAPI-эндпоинт и вернул HTML веб-приложения на `GET /command`). Для них
  проверено опосредованно: одинаковый YAML-frontmatter-парсер и отсутствие
  ошибок загрузки проекта; прямой замер отложен. Живой прогон 2026-10-25
  проверяет **agent**-файлы; для skills/commands тело запроса не снималось.
- Холодный старт изолированного managed-сервиса отдаёт пустой список в первом
  вызове; для воспроизводимости нужен второй запуск (зафиксировано в evidence).
- `opencode debug agents` в v2.1.4 на этой машине возвращает `[]` — вывод
  прежнего спайка не воспроизведён; первичным evidence считается перехват
  HTTP-запроса (§ниже), а не debug-вывод.

**Живой прогон провайдера (2026-10-25, решение владельца — проверить до
реализации).**

Окружение: macOS (darwin), `opencode v2.1.4`
(`/Users/chekh/.opencode/bin/opencode`), провайдер `company` (baseURL
`https://router.ratway.ru:8443/v1`, `@ai-sdk/openai-compatible`), модель
`company/fast` — самая дешёвая из настроенных алиасов (для сравнения тем же
прогоном проверена `company/code`). Изоляция: `mktemp -d` в системном tmp,
cwd — tmp-проект; live-проекты не участвуют; `~/.config/opencode` только
читается (mtime и `ls -la` до/после совпадают). Чтобы увидеть тело запроса,
между opencode и роутером поднят локальный capture-proxy
(`http://127.0.0.1:8787/v1` → `https://router.ratway.ru:8443`, TLS до
провайдера настоящий), а в tmp-проекте — `opencode.json` с подменой только
`provider.company.options.baseURL`.

Фикстура: `.opencode/agent/spike-protect.md` с frontmatter
`protect: true` (+ `mode: primary`, `model: company/fast`, `tools: {"*": false}`);
контроль — тот же файл без `protect`; отдельный прогон — `mode: subagent` с
`protect: true`, вызванный primary-агентом через task.

```
$ opencode run --standalone --agent spike-protect "Reply with OK"
OK
exit=0

# capture-proxy, тот же запрос (запись из requests.log):
POST /v1/chat/completions  model=fast  bytes=8192  upstream=200
body keys: model, messages, stream, stream_options, max_completion_tokens
occurrences of "protect" in body: 0
system[0]: "Reply with OK and nothing else.\n# Your Model..."   # агент действительно загружен

# subagent-вариант (protect: true, mode: subagent, вызов через task):
POST /v1/chat/completions  model=fast  bytes=8236  upstream=200
occurrences of "protect" in body: 0

# контроль без ключа: тело совпадает по составу полей, ответ 200
```

Наблюдение по провайдеру: первый POST к роутеру может вернуть `503` с телом
вложенной ошибки `429 (gemini/gemini-flash-latest: monthly spending limit)`;
opencode повторяет запрос другой моделью, итоговый ответ `200`. К `protect`
это отношения не имеет (модель титула сессии), но фиксируется, чтобы повтор
спайка не читался как «400 из-за ключа».

**Вывод.** Для v2.1.4 риск R-01 закрыт: провайдер отвечает 200, а ключ
`protect` вообще не покидает клиент. Остаточный риск — **смена поведения
будущей версии opencode** (начнёт пробрасывать неизвестные ключи агента):
поэтому структурная проверка frontmatter перед записью (§4.1 правило 3,
§4.8) остаётся, а T14 сохраняет один живой прогон как regression guard, а не
как go/no-go волны.

**Следствие для дизайна (не продукта):** семантика REQ-05 не меняется — ключ
остаётся в файле, волф читает его сам; формулировка допущения §6 requirements
(«игнорирует») уточняется на «не отвергает и не влияет на загрузку; в
model-запрос не попадает (проверено на v2.1.4)». Формулировку утверждает L0;
правка текста requirements этой волной не делается (§7 CR — запись об
утверждении). Структурная проверка frontmatter перед записью остаётся по
собственной причине: битый YAML молча теряет агента (пункт 3 выше).

**Как проверять в будущем (T14):** один `opencode run --agent <файл с protect>`
против живого провайдера в tmp-каталоге. Ожидание: ответ 200 и отсутствие
`protect` в теле запроса; если новая версия opencode начнёт пробрасывать ключ и
провайдер ответит 400 — это регрессия среды, а не волны: фиксируется в
troubleshooting, ключ снимается `--resolve <файл>=keep`.

## 6. ADR-карточки

- **ADR-1: Намерения in-file с нормализацией (без центрального файла политики).**
  Контекст: владелец отверг центральный файл политики; ключ в контенте ломает
  сравнение и свидетеля. Решение: `protect` в frontmatter как сигнал вне
  контента; нормализация в трёх точках одной функцией (§4.2). Последствия:
  `grep -rn 'protect:' .opencode/` — полный реестр; старый wolf (<2.20.0) видит
  такой файл обычным mutated (допущение §6 requirements). Риск: рассинхрон
  нормализации между точками. Закрытие: единый модуль + граничные тесты
  (CRLF, нет frontmatter, ключ в теле, несколько ключей). Проверка: AC REQ-05.
- **ADR-2: Новый код `protected` вместо погашения в ok.** Контекст: защищённые
  файлы не должны быть needs-decision, но должны быть наблюдаемы. Решение:
  отдельный код вне `NEEDS_DECISION_CODES`; строка `N protected (intentional)`;
  реестр Protections строится из того же `ProtectEntry[]`. Последствия: сводки и
  JSON строятся из кода, exit не меняется. Проверка: AC REQ-09, NFR-01.
- **ADR-3: Версия формата onboarding-блока читается из шаблона, а не из
  константы кода.** Контекст: блок обязан обновляться при изменении шаблона, но
  не при каждом релизе; константа в коде и в шаблоне расходится. Решение: N
  парсится из `templates/base/AGENTS.md`; инкремент — правка шаблона. Последствия:
  «забыть инкремент» нельзя — сравнение всегда идёт с шаблоном. Проверка: AC
  REQ-03 + тест «версия в маркере шаблона распознаётся и попадает в блок».
- **ADR-4: Бэкапы per-project в `.wolf/backup/upgrade/<дата>/`.** Контекст:
  тихий режим и `take` берут эталон в обход подтверждения. Решение: байтовая
  копия до записи, дата-каталог, без перезаписи, без GC. Последствия: данные
  живут рядом с проектом и переносятся с ним; путь называет дайджест. Проверка:
  AC REQ-10.
- **ADR-5: Значение `protect` вне грамматики трактуется как защита (fail-safe),
  с предупреждением.** Контекст: требования определяют только `true` и `X.Y.Z`;
  `protect: yes`/`protect: «2.19»` — опечатка владельца. Альтернативы:
  (а) игнорировать как незащищённый — риск перезаписи файла, который владелец
  считал защищённым (нарушает NFR-05); (б) держать и предупреждать. Решение: (б);
  недописанный ключ (`protect:` без значения, `~`, `null`) — тот же fail-safe, а
  не «не защищён»: пустое значение читается как забытое `true`.
  Последствия: опечатка не приводит к потере правок; видна в `--check` и в
  дайджесте как `unrecognized`; `protect: false` — явное «не защищён», не
  предупреждает. Риск: «вечная» защита из-за опечатки — снимается `--resolve
…=keep|take`. Проверка: юнит-тесты грамматики + AC REQ-05 AC3.
- **ADR-6: Реестр решений (`collectDecisions`) как единственный источник
  нумерации.** Контекст: `N` должен совпадать между текстом, `--json`,
  `--resolve`, `--show` и `--review` (REQ-06 AC1, REQ-11 AC2, NFR-06). Решение:
  read-only сбор из `inspectBaseSet` + карты + `parseProtect`; порядок — реестр,
  карта, `AGENTS.md`, алфавит. Альтернатива (нумерация по фактам прохода)
  отвергнута: проход в non-TTY не выполняется, а `--json` обязан печатать номера
  без записей. Последствия: orphan-дрейф и `diverged` лица не нумеруются
  (ограничение задокументировано, путь-форма `--resolve` их покрывает). Проверка:
  тест детерминированности (два прогона) + паритет текст/JSON.
- **ADR-7: `protect` выше исцеления штамп-дрейфа.** Контекст: исцеление
  перезаписывает файл, а перезапись удалила бы строку `protect` (намерение
  владельца). Решение: правило 2 §4.3 стоит выше правила 5; защищённый файл со
  старым штампом показывает info-строку отставания, а не лечится. Последствия:
  защищённый файл может оставаться с устаревшим штампом вечно — это и есть
  выбранное владельцем поведение (REQ-05 AC3). Проверка: тест «protect + старый
  штамп → protected, файл не изменён».
- **ADR-8: Свидетель помнит происхождение записи (`origin: render|keep`).**
  Контекст: `keep` («принять локальный», REQ-06) и «волф это писал» дают
  одинаковый `sha256`, поэтому на следующем проходе принятый файл попадал бы в
  правило 7 (перезапись эталоном без бэкапа) — молчаливая потеря правок,
  нарушение NFR-05/NFR-02. Альтернативы: (а) `keep` = `protect: true` —
  отвергнуто, это отдельный глагол REQ-06 и «до следующего дрейфа» ≠ «навсегда»;
  (б) in-file маркер «accepted» — меняет контент и продукт без требования;
  (в) расширить запись state. Решение: (в) — `{hash, origin, base}` с
  нормализацией легаси-строк в `origin:'render'`. Последствия: `kept`-файл
  стабилен до правки владельцем (правило 6 → mutated) или явного `take`;
  смена базы его не перезаписывает (info-строка), что и означает «шум
  прекращается до следующего дрейфа». Риск: state-файл меняет форму — читатели
  обязаны принимать обе. Читателей четыре, все используют **только ключи**
  (`Object.keys`/`Object.entries` с `[rel]`), поэтому поломки нет, но T2 обязан
  это подтвердить тестом: `loadSyncState`
  (`src/adapters/render/sync-state.ts`), `platform-mismatch.ts` (через инъекцию
  `readSyncState`), `memory-doctor.ts` (парсит файл сам), `uninstall.ts`.
  **Откат волны:** код 2.19.0 читает `state.files[rel]` как строку, поэтому
  объект `{hash,origin,base}` даёт `sha256(current) !== recorded` → `mutated` по
  всем файлам свидетеля (не «нет свидетеля» и не «canonical shift»). Данные не
  теряются; лечится удалением/восстановлением `.opencode/wolf-sync-state.json`
  либо повторным апгрейдом, который перезапишет запись в новом формате.
  Проверка: тест «keep → обычный проход не меняет файл» + миграция легаси-строк +
  тест key-only чтения.

## 7. Ссылки на NFR

- **NFR-01** (exit-модель): новые исходы (`protected`, исцеление) не входят в
  `NEEDS_DECISION_CODES`; матрица §4.16 сохраняет семантику таблицы
  unified-update (0/1/2), а не повторяет её текст дословно (добавлены новые
  режимы и строки); бюджет — прохождение прежних exit-тестов без правки
  ожиданий.
- **NFR-02** (идемпотентность): исцеление, `protected`, `kept` (правило 6.5) и
  бэкапы сходятся к стабильному состоянию; повторный прогон — exit 0 и ноль
  записей (тест на снапшот mtime/хэшей после второго прогона). Отдельный кейс:
  `--resolve …=keep`, затем обычный проход → файл **не** перезаписан, exit 0.
- **NFR-03** (read-only `--check`): `inspectBaseSet`/`listProtections` не пишут
  ни файлов, ни sync-state, ни бэкапов; измерение — снапшот mtime+sha256 всех
  файлов проекта и `.opencode/wolf-sync-state.json` до/после.
- **NFR-04** (атомарность): `writeFileAtomic` для файлов, frontmatter-правок,
  AGENTS-блока, бэкапов; `saveSyncState` переводится на tmp+rename; ревью-чек
  «нет новых прямых `writeFileSync` по путям проекта» + тест, что после записи в
  каталоге не остаётся `*.tmp`.
- **NFR-05** (сохранность): `take`, `--yes` и правило 7 §4.3 при отсутствии записи
  свидетеля пишут только после бэкапа; сценарий восстановления REQ-10 AC2 —
  интеграционный тест.
- **NFR-06** (детерминированность): единый `collectDecisions`, стабильный порядок
  (§4.7); измерение — два подряд non-TTY прогона, `diff` выводов и JSON.

## 8. Открытые пункты

Все пункты прежней версии разрешены контрактами выше.

| Пункт                                                                  | Разрешение                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Грамматика `--resolve` (file\|N, несколько целей, ошибки, атомарность) | §4.8: повторяемый флаг, список через запятую, двухфазная валидация, fail-fast при записи, идемпотентный повтор                                                                                                                                                                                                                                                                            |
| UX `--review` (экраны, клавиши, «ко всем похожим», non-TTY)            | §4.9: клавиши t/k/p/v/s + a/q; похожесть = тот же `kind`+`code` с явным перечнем; non-TTY — список + готовая команда, exit 2                                                                                                                                                                                                                                                              |
| Схема `--json`                                                         | §4.13: `wolf.upgrade/1` (и `wolf.upgrade.check/1`), стабильность в мажоре, `decisions[].n` из общего реестра                                                                                                                                                                                                                                                                              |
| Состав секции Protections                                              | §4.11: полный реестр по каталогам base-set, включая вне-карты; значение, дрейф, подсказка снятия; печатается всегда последней секцией `--check`; `protect` у AGENTS.md не поддерживается (отказ «нет frontmatter»)                                                                                                                                                                        |
| Алгоритм вставки/снятия `protect`                                      | §4.1: позиция (последняя строка блока), построчная правка, сохранение комментариев/порядка, CRLF, отказ без frontmatter, несколько ключей, `false`, вне-грамматики (ADR-5)                                                                                                                                                                                                                |
| keep/unprotect при отсутствии свидетеля                                | §4.8: `keep` создаёт свидетель (принятие локального как канона); `protect`/`pin` тоже пишут свидетель                                                                                                                                                                                                                                                                                     |
| protect у файлов вне карты (outsideMap)                                | §4.3 + §4.8: уважается, попадает в реестр Protections как санкционированная вариация, не conflict; orphan-дрейф гасится `--resolve <path>=protect\|pin`, `take`/`keep` на orphan — error с подсказкой                                                                                                                                                                                     |
| Исцеление штамп-дрейфа                                                 | §4.4: регекс един с `insertStamp` (общий `stripStampLines`), идемпотентно, выше проверки свидетеля, ниже protect                                                                                                                                                                                                                                                                          |
| Восстановление `mcp.wolf` в init                                       | §4.14: только существующий конфиг, только без `--platform`, через существующий `writeConfig`, идемпотентно, битый JSONC — skipped                                                                                                                                                                                                                                                         |
| Spike R-01                                                             | §5: подтверждено для **agent-файлов** («ключ не мешает загрузке»); живой прогон 2026-10-25: провайдер отвечает 200, ключ `protect` в тело model-запроса **не попадает** (ни primary, ни subagent); skills/commands — опосредованно (read-only перечисления в v2.1.4 нет). Риск провайдерского 400 для v2.1.4 снят; остаточный риск — будущая версия opencode, T14 держит regression guard |

**Остаточные вопросы (не блокируют):**

- Формулировка допущения §6 requirements («игнорирует» → «не отвергает и не
  влияет на загрузку; в model-запрос не попадает — проверено на v2.1.4»).
  Владельца решения текст requirements не меняет (§7 CR — только запись об
  утверждении); дизайн и код от формулировки не зависят.
- Продуктовый вопрос «должен ли `--yes` разрешать `conflict`» не поднимается:
  требования говорят только про `mutated`, wx-политика сохранена, exit 2 честен.
- Расширение поверхности сверх REQ (проверено и **сужается** решением L0
  2026-10-25): `protect` у AGENTS.md не поддерживается (отказ «нет
  frontmatter»); exit 1 остаётся только для ошибок аргументов/несовместимых
  комбинаций (§4.18) и не меняет семантику 0/2. Новых поведений вне REQ не
  добавляется.

## 9. Влияние на существующие тесты и совместимость

- `tests/unit/adapters/render/opencode-renderer.test.ts`, `tests/unit/use-cases/sync-base-set.test.ts`
  — добавляются кейсы protect/исцеления; ожидания AGENTS.md: блочный режим
  сравнивает только блок (кейсы «текст после блока» перестают быть `differs`).
- `tests/integration/b0-sync.test.ts`, `b0-init.test.ts` — штампованный AGENTS.md
  без изменений; append-блок — новые ожидания (identical вместо differs).
- `tests/unit/adapters/commands/memory-upgrade.check.test.ts`,
  `tests/integration/upgrade-check.test.ts` — `freshnessDetails` теперь печатает
  пути differ; снапшоты обновляются, счётчики сохраняются.
- `tests/unit/use-cases/verify-against-map.test.ts` — новые коды `protected`/`kept`,
  набор `NEEDS_DECISION_CODES` без изменений.
- `tests/unit/adapters/render/sync-state.test.ts` (новый файл теста рядом с
  рендерером) — форма `{hash, origin, base}`, чтение легаси-строк как
  `origin:'render'`, атомарная запись без `*.tmp`, key-only чтение остальными
  потребителями (ADR-8).
- `tests/unit/use-cases/init-project.test.ts` — кейс WP1 «writeConfig не
  вызывается» сохраняется для несуществующего конфига и меняется для
  существующего `opencode.json` без `mcp.wolf` (REQ-04 AC1).
- Совместимость: старые wolf (<2.20.0) не нормализуют `protect` (допущение §6
  requirements); парк обязан обновиться до 2.20.0, что и делает сам проход.
  `docs/dev/2026-10-23-unified-update/design.md` (exit-модель, идемпотентность) не
  пересматривается.

## 10. Журнал ревью

Формат: append-only, раунды не переписываются. Каждая находка раунда получает ID
(`C-n`/`M-n`/`m-n` или `R<n>-<k>`), evidence (документ:строка или команда) и ответ
автора (`ACCEPTED` + что сделано / `REFUTED` + основание / `DEFERRED` + владелец).
Записи раундов 1–4 ниже приведены в исходном виде; их per-finding соответствие
восстановлено по phase1-отчёту и не переписывает историю.

- 2026-10-25: полный дизайн — карта покрытия, контракты §4.1–§4.17, spike R-01 с
  evidence, ADR-1…7. Статус `review`.
- 2026-10-25, ревью №1 (независимый worker-reviewer, свежий контекст,
  `opencode run --agent worker-reviewer`): `CHANGES_REQUIRED` — SUMMARY 1
  critical / 8 major / 6 minor. Блокирующие: область целей `--resolve`
  исключала защищённые цели (REQ-05 AC3); противоречие исхода при сломанных
  onboarding-маркерах; `protect` не проверялся в ветках AGENTS.md; литерал
  маркера v2 ломал append-ветку при v3; у `--yes`-take не было единственного
  механизма; исход «healed» не был отображён в кодах; усечение differ-путей
  противоречило REQ-01; `--json` не проходил через re-exec; глаголы на orphan не
  были определены. Исправлено в §4.3–§4.8, §4.12–§4.15 (матрица глаголов,
  версионно-агностичные маркеры, режим `takeMutated`, `updated`+reason,
  сквозной `--json`).
- 2026-10-25, ревью №2 (независимый worker-reviewer, свежий контекст):
  `CHANGES_REQUIRED` — SUMMARY 1 critical / 1 major / 3 minor; все 16 находок
  ревью №1 закрыты. Критическое: `keep` отменялся следующим проходом с молчаливой
  потерей правок (свидетель не различал «волф писал» и «владелец принял»).
  Исправлено: свидетель `{hash, origin, base}` + правило 6.5 `kept` + `VerifyCode
'kept'` + ADR-8 (§4.2, §4.3, §4.6, §4.8, §4.11, §4.12, §7). Major: правило 5 не
  разводило режимы sync/inspect/render — разведено колонками. Minor: уточнены
  строка AGENTS.md×protect в матрице, примеры без невозможного `protect` у
  mutated-цели, область keep при отсутствии свидетеля.
- 2026-10-25, ревью №3 (независимый worker-reviewer, свежий контекст):
  `CHANGES_REQUIRED` — SUMMARY 0 critical / 1 major / 7 minor; критическое ревью
  №2 признано закрытым по существу, все 16 находок №1 — fixed. Major: грамматика
  `protect:` без значения расходилась с ADR-5 (парсер считал «не защищён»).
  Исправлено: пусто/`~`/`null` → held + `unrecognized` (ADR-5, §4.1). Minor:
  свидетель в правиле 4 пишется только sync/render (NFR-03); правило 7 делает
  бэкап при отсутствии записи свидетеля (NFR-05); CRLF-безопасная формула
  проверки вставки; строка `kept` в матрице §4.8; `keep` у блочного AGENTS.md —
  законный no-op; экранирование `|` в карте покрытия.
- 2026-10-25, ревью №4 (независимый worker-reviewer, узкая проверка закрытия):
  `CHANGES_REQUIRED` — SUMMARY 0 critical / 0 major / 1 minor; семь из восьми
  находок ревью №3 fixed, блокирующих нет. Minor (легаси-`base` в комментарии
  интерфейса) исправлен: `base: <stamp|'0.0.0'>`. Гейт дизайна пройден:
  блокирующих находок не осталось, дизайн передан в plan.md / test-plan.md.
- 2026-10-25, ревью №5 фазы 2 (независимый worker-reviewer, полный пакет,
  `phase2-review-report.md`): `CHANGES_REQUIRED` — SUMMARY 1 critical / 9 major /
  9 minor. Ответы автора (все находки разобраны в этом же раунде):
  `C-1` **ACCEPTED** — `--here --check` стал отдельным read-only режимом §4.11 с
  диспетчеризацией §4.18 (`--check` сильнее `--here`), владелец T13, сценарии
  R09-5/N03-1; `M-1` **ACCEPTED** — живой прогон 2026-10-25 (§5): 200 и ключ не в
  теле запроса, риск v2.1.4 снят, T14 переведён в regression guard;
  `M-2` **ACCEPTED** — единственный владелец регекса `stamp.ts`
  (`stripStampLines`), §3/§4.4 исправлены, `stamp.ts` в allowlist T3;
  `M-3` **ACCEPTED** — §4.18: порядок разбора, несовместимые комбинации,
  argv ребёнка с `--json`, опция `--json` у `upgrade-projects`, владелец T11;
  `M-4` **ACCEPTED** — non-TTY `--review` даёт 0 без решений, 2 с решениями
  (§4.9, §4.16), сценарий R07-6 «чистый парк»;
  `M-5` **ACCEPTED** — зафиксирована трактовка L0 «append-ветка только в init»
  (§4.5), сценарий R03-7 «upgrade не меняет AGENTS.md без блока и штампа»;
  `M-6` **ACCEPTED** — `diverged` видим отдельной секцией и держит exit 2, глагол
  не вводится (решение L0), сценарии R07-5/N01-3;
  `M-7` **ACCEPTED** — владение поверхностями: порт целиком T3, обёртка
  `sync-base-set.ts` в T10, экспорт `planOf`/`PlanStatus` из
  `upgrade-projects.ts` в T7;
  `M-8` **ACCEPTED** — T8→T9→T10 последовательны, T13 после T6/T11, раздел
  «Конфликты» обновлён, у T15 явный allowlist;
  `M-9` **ACCEPTED** — `InspectOutcome.detail` + `InspectAction +=
'protected'|'kept'` (§4.6), печать причины в `--check` (§4.15), владельцы
  T3/T13, сценарий R03-5;
  `m-1` **ACCEPTED** — перечислены четыре key-only читателя и исправлена
  семантика отката (ADR-8);
  `m-2` **ACCEPTED** — одно условие идемпотентности (в `writeConfig`), `canonical`
  удалён, сценарий R04-7;
  `m-3` **ACCEPTED** — `doctor.ts:38` уже использует префикс: «изменений не
  требуется», файл остаётся в allowlist T4 только для теста;
  `m-4` **ACCEPTED** — oracle R05-4 сравнивает `parseProtect().held`;
  `m-5` **ACCEPTED** — `.opencode/skills/`, «сохраняет семантику 0/1/2», полный
  путь `src/adapters/render/sync-state.ts`;
  `m-6` **ACCEPTED** — определены `--show` вне карты, `--json` в TTY, форма
  `--json --resolve`, место секции Protections, `action` для protected/kept;
  `m-7` **ACCEPTED** — в T15 добавлены dogfood `wolf upgrade --here` в самом
  репозитории, проверка метрики §1, allowlist, генераторы через `docs:build`;
  `m-8` **ACCEPTED** — журнал append-only с ID/evidence/ответами (этот раздел),
  phase1-отчёт больше не называет перечни «дословными».
  Независимое пере-ревью изменённых оснований — `phase3-fix-report.md`.
- 2026-10-25, ревью №6 (цикл 2, узкое пере-ревью изменённых оснований):
  `CHANGES_REQUIRED` — SUMMARY 0 critical / 1 major / 4 minor; NEW-1 (порядок
  слияния T13×рендерер) — closed; NEW-3 (маппинги парк-тестов) и три minor
  (маппинг ↔ allowlist) — исправлены добавлением файлов в allowlist T6/T7/T9;
  NEW-2 (exit для diverged-only парка) — not-closed: R07-5 требовал `exit 2` для
  bare `--json`, что противоречило тайбрейку «отмена = 0». Исправлено: R07-5
  переведён на `--json --yes`, N01-3 разведён на отдельные вызовы, несовместимая
  пара даёт exit 1 (§4.18).
- 2026-10-25, ревью №7 (цикл 3, узкая проверка пяти точек цикла 2): `APPROVED` —
  SUMMARY 0 critical / 0 major / 0 minor; все пять точек `ok`, новых находок нет.
  Гейт дизайна и плана открыт: блокирующих находок не осталось.
