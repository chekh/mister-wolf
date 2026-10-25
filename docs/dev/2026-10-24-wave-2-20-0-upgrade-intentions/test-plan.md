---
slug: wave-2-20-0-upgrade-intentions
title: wave-2-20-0-upgrade-intentions — тест-план
status: approved
created: 2026-10-24
baseline: 0574e7c
design: design.md (review)
plan: plan.md (tasks T1–T15)
---

# wave-2-20-0-upgrade-intentions — тест-план

Входы: `requirements.md` (approved) — **единственный** источник AC (здесь AC не
переизобретаются, сценарии лишь переводят их в проверяемые утверждения);
`design.md` — oracle для ожидаемых результатов (нормализация, порядок правил,
матрица глаголов, схемы); `plan.md` — задачи T1–T15.

Правила:

- ожидаемый результат выводится из требования/инварианта, а не из кода;
- каждый новый behavior начинается с падающей проверки
  (test-driven-development);
- фикстуры изолированы (`mkdtemp` в системном tmp), реальные секреты и внешние
  сервисы не используются; «сегодня» подменяется инъекцией часов, npm — мок,
  `opencode` в тестах не запускается;
- пути тестов: существующие — как есть; новые — рядом с существующими по
  конвенции `tests/unit/**` и `tests/integration/**`, e2e — `tests/e2e/*.e2e.ts`.

## Сценарии

### REQ-01 — имена файлов в выводе

- **R01-1 (AC1)** Given парк-фикстура с одним проектом, где
  `.opencode/agents/foo.md` локально изменён (mutated), When `wolf upgrade --yes`,
  Then в деталях шага проекта присутствует строка с путём
  `.opencode/agents/foo.md` и исходом mutated.
  Маппинг: `tests/unit/use-cases/upgrade-projects.test.ts`,
  `tests/integration/upgrade-park.test.ts`.
- **R01-2 (AC2)** Given проект с двумя differ-целями, When
  `wolf upgrade --check`, Then напечатаны оба пути
  (`.opencode/agents/a.md`, `.opencode/skills/b/SKILL.md`), ни один не усечён.
  Маппинг: `tests/unit/adapters/commands/memory-upgrade.check.test.ts`,
  `tests/integration/upgrade-check.test.ts`.
- **R01-3 (AC3)** Given любой из сценариев выше, When сравнивается вывод, Then
  счётчики (`N differ`, `verify: X/Y ok · Z needs decision`) остаются на месте,
  имена — дополнительными строками.
  Маппинг: те же файлы, снапшот-проверка строк.

### REQ-02 — исцеление штамп-дрейфа

- **R02-1 (AC1)** Given файл, побайтово равный эталону после изъятия строки
  штампа (`set=2.17.0` против базы 2.20.0), When `wolf upgrade` (или `--here`),
  Then файл перезаписан эталоном, свидетель = sha256(fresh), исход не
  needs-decision (`updated`).
  Маппинг: `tests/unit/adapters/render/opencode-renderer.test.ts`,
  `tests/unit/use-cases/sync-base-set.test.ts`.
- **R02-2 (AC2)** Given исцелённый в R02-1 проект, When повторный `wolf upgrade`,
  Then exit 0 и файл не изменён (mtime и хэш те же).
  Маппинг: `tests/integration/upgrade-park.test.ts` (двойной прогон).
- **R02-3 (граница)** Given файл с реальной правкой И старым штампом, When
  проход, Then исход `mutated`, файл не тронут (исцеление не маскирует правку).
  Маппинг: `tests/unit/adapters/render/opencode-renderer.test.ts`.
- **R02-4 (граница)** Given защищённый файл со старым штампом, When проход, Then
  исход `protected`, файл не изменён, свидетель не менялся (ADR-7).
  Маппинг: тот же файл.

### REQ-03 — версионированный onboarding-блок

- **R03-1 (AC1)** Given `AGENTS.md` с блоком `v2` и пользовательским текстом
  выше, When `wolf upgrade` при шаблоне `v3`, Then блок заменён содержимым
  шаблона, текст выше блока сохранён байт-в-байт.
  Маппинг: `tests/integration/b0-sync.test.ts`,
  `tests/unit/adapters/render/opencode-renderer.test.ts`.
- **R03-8 (правило 6.5, F1-ревью m-8.1)** Given штампованный `AGENTS.md` со
  свидетелем `origin:'keep'`, When проход и `--check`, Then `kept` (файл не
  тронут, exit 0) и `kept` + `keepBase` в инспекции.
  Маппинг: `tests/unit/adapters/render/opencode-renderer.test.ts`.
- **R03-9 (CRLF, F1-ревью m-7)** Given `AGENTS.md` в CRLF с блоком v2, When
  init/sync, Then блок получает EOL файла (смешанных переводов нет), текст выше
  и ниже — байт-в-байт, повторный проход — `skipped`.
  Маппинг: `tests/unit/adapters/render/opencode-renderer.test.ts`.
- **R03-2 (AC2)** Given тот же файл с текстом ниже блока, When проход, Then текст
  ниже также сохранён байт-в-байт (сравнение хвоста).
  Маппинг: те же.
- **R03-3 (AC3)** Given `AGENTS.md` без блока и без штампа, When `wolf init`,
  Then блок добавлен append-веткой в конец, чужой контент не изменён.
  Маппинг: `tests/integration/b0-init.test.ts`.
- **R03-4 (AC4)** Given обновлённый блок, When повторный проход и повторный
  `init`, Then exit 0, блок не изменён, второй блок не добавлен.
  Маппинг: `tests/integration/b0-init.test.ts` (кейсы «init под v3 не дублирует
  блок» и «init на проекте 2.19.0»), `tests/unit/adapters/render/opencode-renderer.test.ts`
  (M-1: штамп приводится к текущей базе, свидетель пишется по нормализованному
  контенту, повторный `init` — no-op).
- **R03-5 (граница)** Given `AGENTS.md` с открывающим маркером и без
  закрывающего, When проход и `--check`, Then `foreign`/skipped с причиной
  `onboarding markers broken` (в `--check` — строкой `detail:`, в проходе —
  reason), exit не меняется (NFR-01).
  Маппинг: `tests/unit/adapters/render/opencode-renderer.test.ts`,
  `tests/integration/upgrade-check.test.ts`.
- **R03-6 (граница)** Given штампованный `AGENTS.md` с локальной правкой, When
  проход, Then `mutated` (whole-file режим не изменился).
  Маппинг: `tests/unit/use-cases/sync-base-set.test.ts`.
- **R03-7 (AC3, трактовка L0)** Given `AGENTS.md` без блока и без штампа, When
  `wolf upgrade` (не `init`), Then файл **не изменён** (mtime и хэш те же), блока
  нет, exit 0; When затем `wolf init`, Then блок добавлен append-веткой (R03-3).
  Маппинг: `tests/integration/b0-sync.test.ts`,
  `tests/unit/adapters/render/opencode-renderer.test.ts`.

### REQ-04 — init восстанавливает `mcp.wolf`

- **R04-1 (AC1)** Given проект с `opencode.json` без `mcp.wolf` (и с другими
  ключами), When `wolf init`, Then запись
  `{"type":"local","command":["wolf","mcp"],"enabled":true}` добавлена, все
  прочие ключи сохранены (сравнение распарсенного JSON до/после).
  Маппинг: `tests/unit/use-cases/init-project.test.ts`,
  `tests/integration/b0-init.test.ts`.
- **R04-2 (AC2)** Given проект после R04-1, When повторный `wolf init`, Then
  action `unchanged`, файл не изменён (mtime), дубля нет.
  Маппинг: те же.
- **R04-3 (AC3)** Given проект после R04-1, When `wolf doctor`, Then для него нет
  строки `opencode: wolf entry missing`.
  Маппинг: `tests/unit/use-cases/doctor.test.ts`.
- **R04-4 (граница)** Given `opencode.json` с `mcp.wolf` строкой (некорректная
  запись), When `wolf init`, Then action `replaced`, канонический блок, остальной
  JSON сохранён.
  Маппинг: `tests/unit/use-cases/init-project.test.ts`.
- **R04-5 (граница)** Given битый `opencode.json` (не JSONC), When `wolf init`,
  Then платформа `skipped` с причиной, файл не изменён, init не падает.
  Маппинг: тот же файл.
- **R04-6 (инвариант WP1)** Given проект без `opencode.json`, When `wolf init`,
  Then конфиг **не создаётся** (`writeConfig` не вызывается).
  Маппинг: `tests/unit/use-cases/init-project.test.ts` (существующий кейс
  сохраняется).
- **R04-7 (идемпотентность при кастомном `default_agent`)** Given валидный
  `mcp.wolf`, `default_agent` пользователя отличается от `DEFAULT_AGENT`, When
  повторный `wolf init`, Then action `unchanged`, файл не изменён, чужое значение
  `default_agent` сохранено (условие одно — внутри `writeConfig`).
  Маппинг: `tests/unit/use-cases/init-project.test.ts`.

### REQ-05 — ключ `protect` (нормализация и поведение)

- **R05-1 (AC1)** Given парк из двух проектов, где часть файлов с `protect`,
  When `wolf upgrade`, Then все проекты ok/current, exit 0, в сводке строка
  `N protected (intentional)`, exit не меняется.
  Маппинг: `tests/integration/upgrade-park.test.ts`,
  `tests/unit/use-cases/upgrade-projects.test.ts`.
- **R05-2 (AC2)** Given безштампованный файл (`foreign`) с `protect: true`, When
  `--check`, Then проект `current`, файл в реестре Protections, предупреждений
  нет, файл не тронут.
  Маппинг: `tests/integration/upgrade-check.test.ts`.
- **R05-3 (AC3)** Given `protect: 2.19.0` при базе 2.20.0, When `wolf upgrade`,
  Then файл молча держится (не изменён) и exit 0; When `--check`, Then info-строка
  «защищённое отставание» (маркер info, exit 0); When
  `--resolve <файл>=take`, Then ключ снят, взят эталон, локальное в бэкапе.
  Маппинг: `tests/integration/upgrade-check.test.ts`,
  `tests/unit/use-cases/decisions.test.ts`.
- **R05-4 (AC4)** Given любой проект с защитами, When сравнивается реестр
  Protections из `--check` с результатом `parseProtect().held` по тем же файлам,
  Then наборы путей совпадают. Oracle — **только распознанные frontmatter-ключи**
  (`grep 'protect:'` для этой проверки не годится: он находит и ключ в теле, и
  кавычки, которые по §4.1 защитой не считаются).
  Маппинг: `tests/integration/upgrade-check.test.ts` (сверка списков через
  `parseProtect`, не через grep).
- **R05-5 (AC5)** Given файл со свидетелем, When добавить `protect: true`, затем
  сменить на `2.19.0`, затем снять ключ (три отдельные правки), Then свидетель не
  меняется и `mutated` не возникает ни на одном шаге.
  Маппинг: `tests/unit/domain/protect-key.test.ts` (нормализация) +
  `tests/unit/adapters/render/opencode-renderer.test.ts` (три точки).
- **R05-6 (границы нормализации)** Given файлы: без frontmatter; с `protect:` в
  теле документа; с двумя ключами; с CRLF; с `protect: false`; с
  `protect: yes`; с `protect:` (пусто); с `"protect": true` (в кавычках), When
  `normalizeManaged`/`parseProtect`, Then: тело и кавычки не трогаются и не
  считаются защитой; дубли снимаются все, значение — первое; CRLF сохраняется;
  `false` — не защищён; `yes`/пусто — held + `unrecognized` (ADR-5).
  Маппинг: `tests/unit/domain/protect-key.test.ts`.
- **R05-7 (вставка/снятие)** Given файл с комментариями и порядком ключей, When
  `insertProtect` затем `removeProtect`, Then порядок и комментарии сохранены,
  ключ стоит последней строкой блока, EOL как у закрывающего `---`; файл без
  frontmatter → отказ `no-yaml-frontmatter`; битый результат → отказ без записи.
  Маппинг: `tests/unit/domain/protect-key.test.ts`.
- **R05-8 (protect × removed, F1-ревью m-4)** Given `removed`-цель карты с
  `protect: true` и подтверждённый список удалений, When `wolf upgrade`, Then
  файл цел, код `protected` (не `error`/`removed`, exit 0), подсказка
  `--resolve <путь>=keep`; When `keep` снимает ключ, Then следующий проход
  удаляет файл только с бэкапом (NFR-05).
  Маппинг: `tests/unit/use-cases/project-step.test.ts`,
  `tests/unit/use-cases/verify-against-map.test.ts`,
  `tests/unit/use-cases/decisions.test.ts`.

### REQ-06 — глаголы `--resolve`

- **R06-1 (AC1)** Given non-TTY прогон напечатал нумерованный список, When
  `wolf upgrade --resolve 3=protect`, Then решение применено к файлу строки 3,
  ключ `protect: true` вставлен атомарно, свидетель обновлён по нормализованному
  контенту.
  Маппинг: `tests/unit/use-cases/decisions.test.ts`,
  `tests/integration/upgrade-here.test.ts`.
- **R06-2 (AC2)** Given проект, When `--resolve .opencode/agents/foo.md=take`,
  Then файл заменён эталоном, локальная копия в `.wolf/backup/upgrade/<дата>/…`.
  Маппинг: `tests/unit/use-cases/decisions.test.ts`.
- **R06-3 (AC3)** Given неизвестный номер (`99=take`) и неизвестный путь в одной
  команде, When `--resolve`, Then exit 1, ошибки называют обе цели, ни один файл
  не изменён (снапшот).
  Маппинг: `tests/unit/use-cases/decisions.test.ts`.
- **R06-4 (AC4)** Given защищённый файл, When `--resolve …=take`, Then ключ снят,
  взят эталон, свидетель `origin:'render'`.
  Маппинг: `tests/unit/use-cases/decisions.test.ts`.
- **R06-5 (семантика keep)** Given mutated-файл, When `--resolve …=keep`, затем
  обычный `wolf upgrade`, Then файл **не перезаписан**, exit 0 (правило 6.5
  ADR-8); After правка файла пользователем, When проход, Then снова `mutated`.
  Маппинг: `tests/unit/use-cases/decisions.test.ts`,
  `tests/integration/upgrade-park.test.ts`.
- **R06-6 (матрица)** Given цели классов conflict/orphan/блочный AGENTS.md, When
  неподдерживаемый глагол (`keep` на orphan, `protect` на AGENTS.md без
  frontmatter, `protect` на AGENTS.md с ручным frontmatter), Then exit 1 с
  подсказкой «нет frontmatter», файл не изменён.
  Маппинг: `tests/unit/use-cases/decisions.test.ts`.
- **R06-7 (дубли и порядок)** Given `--resolve 2=take --resolve 2=keep` и
  `--resolve a.md=take --resolve ./a.md=keep`, When разбор, Then ошибка «target
  listed twice», записей нет; применение идёт в порядке реестра, не ввода.
  Маппинг: тот же файл.
- **R06-8 (идемпотентность)** Given применённое решение, When повтор того же
  `--resolve`, Then exit 0/2 по остатку, файл и свидетель без изменений.
  Маппинг: тот же файл.
- **R06-9 (диспетчеризация, design §4.18)** Given устаревший CLI и парковый
  `--resolve 3=protect`, When вызов, Then npm-фаза и re-exec **не выполняются**
  (мок npm/spawn не вызван), флаг не теряется, применено ровно решение 3; Given
  `--resolve 3=protect --yes`, Then exit 1 (несовместимая комбинация), записей и
  сети нет.
  Маппинг: `tests/unit/adapters/commands/memory-upgrade.here.test.ts`,
  `tests/integration/upgrade-park.test.ts`.

### REQ-07 — `--review`

- **R07-1 (AC1)** Given TTY и mutated-файл, When `--review` и выбран `p`, Then
  `protect: true` дописан атомарно (tmp+rename), файл больше не needs-decision.
  Маппинг: `tests/unit/adapters/commands/memory-upgrade.here.test.ts` (инъекция
  TTY и ответов).
- **R07-2 (AC2)** Given non-TTY и 2 needs-decision, When `--review`, Then
  напечатан нумерованный список с готовой командой `--resolve`, exit 2, файлы не
  изменены (снапшот mtime+хэш).
  Маппинг: `tests/unit/adapters/commands/memory-upgrade.here.test.ts`,
  `tests/integration/upgrade-park.test.ts`.
- **R07-3 (похожесть)** Given 4 цели: 3 agent/mutated и 1 skill/mutated, When
  выбран `t` и подтверждено «ко всем похожим», Then применены 3 agent-цели, skill
  остался; перечень показан до применения.
  Маппинг: `tests/unit/use-cases/decisions.test.ts`.
- **R07-4 (выход)** Given цикл, When `q` или EOF, Then уже принятые решения
  применены, остальные не тронуты, дайджест и exit по остатку.
  Маппинг: тот же файл.
- **R07-5 (diverged, решение L0)** Given парк, где остались только `diverged`
  лица (решений нет), When `--review` (TTY и non-TTY), Then напечатана отдельная
  секция `steward zone` с `owner_skill`/версией, `--resolve`-команда для него не
  предлагается, exit 2; When `--json --yes`, Then `diverged[]` непуст, exit 2.
  When bare non-TTY без `--yes` (текст или `--json`), Then exit 0 — отменённый
  проход (N01-3). Given `diverged` устранён Стюардом, When `--review`, Then exit 0,
  секции нет.
  Маппинг: `tests/unit/use-cases/decisions.test.ts`,
  `tests/integration/upgrade-park.test.ts`.
- **R07-6 (non-TTY, чистый парк)** Given non-TTY и **ноль** needs-decision, When
  `--review`, Then напечатано «no decisions» (список пуст), exit **0** (не 2),
  файлы не изменены.
  Маппинг: `tests/unit/adapters/commands/memory-upgrade.here.test.ts`,
  `tests/integration/upgrade-park.test.ts`.

### REQ-08 — `--show`

- **R08-1 (AC1)** Given `protect: 2.19.0` при базе 2.20.0, When
  `--show <файл>`, Then напечатаны значение protect, обе версии и diff
  локальный→эталон; файл и свидетель не изменены (снапшот).
  Маппинг: `tests/unit/use-cases/decisions.test.ts`,
  `tests/unit/domain/line-diff.test.ts`.
- **R08-2 (AC2)** Given номер `N` из non-TTY списка, When `--show N`, Then вывод
  идентичен `--show <файл>`.
  Маппинг: `tests/unit/use-cases/decisions.test.ts`.
- **R08-3 (граница)** Given файл, не входящий в решения (например идентичный),
  When `--show <путь>`, Then вывод строится (эталон есть), exit 0; неизвестный
  путь → exit 1 с подсказкой.
  Маппинг: тот же файл.
- **R08-4 (diff)** Given вход > лимита строк, When `line-diff`, Then вывод
  обрезан по лимиту с `… ещё N строк`, детерминирован на повторе.
  Маппинг: `tests/unit/domain/line-diff.test.ts`.
- **R08-5 (файл вне карты)** Given защищённый файл вне карты (`renderFreshFile`
  вернул `null`), When `--show <путь>`, Then напечатано `base: n/a (file outside
the update map)`, diff не строится, подсказки `=take` нет, exit 0, файл не
  изменён.
  Маппинг: `tests/unit/use-cases/decisions.test.ts`.

### REQ-09 — секция Protections

- **R09-1 (AC1)** Given парк, где защищённые файлы в двух проектах, When
  `--check`, Then секция Protections перечисляет все: путь, значение, дрейф.
  Маппинг: `tests/integration/upgrade-check.test.ts`.
- **R09-2 (AC2)** Given чистый парк без защит, When `--check`, Then секция
  печатается со строкой `Protections: none`.
  Маппинг: тот же файл.
- **R09-3 (AC3)** Given проект, When `--check` дважды, Then вывод идентичен,
  ни один файл (включая `wolf-sync-state.json`) не изменён.
  Маппинг: тот же файл (снапшот mtime+sha256).
- **R09-4 (граница)** Given значение вне грамматики (`protect: yes`), When
  `--check`, Then строка `unrecognized — treated as protected`, exit 0.
  Маппинг: `tests/integration/upgrade-check.test.ts`.
- **R09-5 (`--here --check`, C-1)** Given проект с mutated/differ/protect и
  `kept`-файлами, When `wolf upgrade --here --check` (в TTY и non-TTY), Then
  печатается инспекция только этого проекта + секция Protections, exit 0,
  снапшот mtime+sha256 всех файлов проекта (включая `wolf-sync-state.json`)
  идентичен, sync-state и бэкапов нет; npm-фаза и re-exec не вызываются; Given
  `--here --check` на файле, который был бы перезаписан проходом, Then файл не
  изменён (read-only гарантия NFR-03).
  Маппинг: `tests/integration/upgrade-check.test.ts`,
  `tests/unit/adapters/commands/memory-upgrade.check.test.ts`,
  `tests/integration/upgrade-here.test.ts`.

### REQ-10 — `--yes` без TTY

- **R10-1 (AC1)** Given не-TTY, необъявленная правка, When `wolf upgrade --yes`,
  Then локальная копия в `.wolf/backup/upgrade/<дата>/<путь>`, взят эталон,
  дайджест называет файл и путь бэкапа, exit 0.
  Маппинг: `tests/integration/upgrade-park.test.ts`,
  `tests/unit/adapters/commands/upgrade-projects.test.ts`.
- **R10-2 (AC2)** Given бэкап из R10-1, When скопировать файл обратно и выполнить
  `--resolve <файл>=protect`, Then файл заморожен (`protected`), проход его не
  меняет.
  Маппинг: `tests/unit/use-cases/decisions.test.ts`.
- **R10-3 (AC3)** Given protect/pin/kept-файлы, When `--yes`, Then они не тронуты
  и не бэкапированы (список бэкапов их не содержит).
  Маппинг: `tests/unit/adapters/commands/upgrade-projects.test.ts`.
- **R10-4 (отказные сценарии)** Given сбой бэкапа (мок хука бросает), When
  `--yes`, Then файл не перезаписан, свидетель не изменён, exit 1; Given сбой
  `saveSyncState`, When `--yes`, Then error-строка с явным предупреждением и
  exit 1.
  Маппинг: `tests/unit/adapters/render/opencode-renderer.test.ts`,
  `tests/unit/use-cases/decisions.test.ts`.
- **R10-5 (коллизия)** Given два take одного файла в один день, When `--yes` или
  `--resolve`, Then второй бэкап получает суффикс `-2`, первый не перезаписан.
  Маппинг: `tests/unit/use-cases/decisions.test.ts`.

### REQ-11 — `--json`

- **R11-1 (AC1)** Given проект с mutated-файлом и protect-файлом, When
  `wolf upgrade --json --yes`, Then stdout парсится как JSON, содержит
  `schema:"wolf.upgrade/1"`, per-project исходы с путями, `protections`.
  Маппинг: `tests/integration/upgrade-park.test.ts`,
  `tests/unit/adapters/commands/memory-upgrade.check.test.ts`.
- **R11-2 (AC2)** Given non-TTY прогон, When сравнить `decisions[].n` в JSON и
  номера текстового списка, Then совпадают один-в-один.
  Маппинг: `tests/integration/upgrade-park.test.ts`.
- **R11-3 (AC3)** Given три состояния (ok, needs-decision, error), When `--json`,
  Then `exit` в документе и код процесса совпадают с текстовым режимом.
  Маппинг: те же.
- **R11-4 (re-exec)** Given устаревший CLI и мок re-exec, When `--json`, Then в
  argv ребёнка есть `--json`, фаза 1 не печатает ни баннера, ни outcome; при
  падении npm-фазы документ с `exit:1` и `error`.
  Маппинг: `tests/unit/adapters/commands/memory-upgrade.check.test.ts` и
  `tests/unit/adapters/commands/upgrade-projects.test.ts` (оба в allowlist T11;
  отдельный новый файл не вводится).
- **R11-5 (комбинации)** Given `--json --check`, When вызов, Then
  `schema:"wolf.upgrade.check/1"`; Given `--json --review`, Then error и exit 1,
  второй документ не печатается; Given `--json --resolve 2=keep`, Then
  `mode:"resolve"`, `projects: []`, `backups` заполнены, `decisions` — остаток
  реестра, exit совпадает с процессом; Given `--json --show <путь>`, Then
  `mode:"show"`, `projects: []`.
  Маппинг: те же.
- **R11-6 (стабильность)** Given два non-TTY прогона без изменений состояния,
  When сравнить stdout, Then байт-идентичны (NFR-06).
  Маппинг: `tests/integration/upgrade-park.test.ts`.
- **R11-7 (`--json` в TTY)** Given stdout — TTY, When `--json --yes`, Then
  печатается тот же единственный документ, интерактивных вопросов нет, exit
  совпадает с текстовым режимом.
  Маппинг: `tests/unit/adapters/commands/memory-upgrade.check.test.ts`.
- **R11-8 (argv ребёнка, design §4.18)** Given устаревший CLI, When парковый
  `--json --yes`, Then argv ребёнка содержит `--json`, а `upgrade-projects`
  принимает эту опцию и печатает ровно один документ; Given `--json` с
  `--resolve`/`--show`, Then re-exec не вызывается вовсе.
  Маппинг: `tests/unit/adapters/commands/upgrade-projects.test.ts`,
  `tests/integration/upgrade-park.test.ts`.

### NFR-01 — exit-модель

- **N01-1** Given существующая таблица exit-модели unified-update (done/cancel/
  non-TTY без `--yes`/пустой реестр/error/needs-decision), When все сценарии,
  Then коды 0/0/0/0/1/2 без изменения ожиданий.
  Маппинг: `tests/unit/adapters/commands/upgrade-projects.test.ts` (существующие),
  `tests/integration/upgrade-park.test.ts`.
- **N01-2** Given исходы `protected`, `kept`, исцеление, When проход, Then exit не
  становится 2; `--check` всегда 0.
  Маппинг: `tests/integration/upgrade-park.test.ts`,
  `tests/integration/upgrade-check.test.ts`.
- **N01-3** Given парк, где остался только `diverged` лица, When по отдельности:
  `--review` (TTY и non-TTY), `--yes`, `--json --yes`, Then каждый вызов даёт
  exit 2 (NFR-01: 2 = есть needs-decision), `--resolve` не предлагает для него
  глагол; When bare `--json` или bare `upgrade` в non-TTY без `--yes`, Then exit
  **0** — отменённый проход не является разбором (паритет 2.19.0), даже если
  `diverged` есть; несовместимые пары (`--review --json`) дают exit 1 (§4.18).
  Given `diverged` нет, When `--review`, Then exit 0.
  Маппинг: `tests/integration/upgrade-park.test.ts`,
  `tests/unit/use-cases/decisions.test.ts`.

### NFR-02 — идемпотентность

- **N02-1** Given прогон завершился лечением/защитой/keep, When повторный
  `wolf upgrade`, Then exit 0 и ни один файл не изменён (снапшот mtime+sha256
  всех файлов проекта + `wolf-sync-state.json`).
  Маппинг: `tests/integration/upgrade-park.test.ts` (двойной прогон).
- **N02-2** Given `--resolve …=keep` затем обычный проход, When сравнение
  контента, Then файл байт-в-байт прежний (ADR-8).
  Маппинг: `tests/unit/use-cases/decisions.test.ts`.

### NFR-03 — `--check` строго read-only

- **N03-1** Given проект с mutated, differ, protect и `kept`-файлами, When
  `--check` (парковый и `--here`), Then снапшот mtime+sha256 всех файлов проекта
  идентичен до/после, `wolf-sync-state.json` не создан и не изменён; для
  `--here --check` дополнительно: sync-state и `.wolf/backup` отсутствуют,
  exit 0.
  Маппинг: `tests/integration/upgrade-check.test.ts`,
  `tests/unit/adapters/commands/memory-upgrade.check.test.ts`.
- **N03-2** Given `--show` и `--review` в non-TTY, When вызов, Then записей нет
  (тот же снапшот).
  Маппинг: `tests/unit/use-cases/decisions.test.ts`.

### NFR-04 — атомарность записей

- **N04-1** Given любые записи волны (файл base-set, frontmatter-правка,
  AGENTS-блок, sync-state, бэкап), When успешная операция, Then в каталогах не
  остаётся `*.tmp`, а содержимое появляется целиком (rename).
  Маппинг: `tests/unit/adapters/render/sync-state.test.ts`,
  `tests/unit/use-cases/decisions.test.ts`.
- **N04-2** Given ревью кода, When поиск прямых `writeFileSync(` по путям
  проекта, Then новых нет (только tmp+rename-хелперы).
  Маппинг: `tests/e2e/base-set.e2e.ts` (проверка отсутствия `*.tmp` после
  прогона) + ревью-чек в T14.

### NFR-05 — никакой потери данных без бэкапа

- **N05-1** Given локальный контент, отличный от эталона, When `take`/`--yes`/
  правило 7 без свидетеля, Then файл перезаписывается только после появления
  бэкапа с идентичным контентом (сравнение байтов).
  Маппинг: `tests/unit/use-cases/decisions.test.ts`,
  `tests/unit/adapters/render/opencode-renderer.test.ts`.
- **N05-2** Given сбой записи эталона после бэкапа, When операция, Then бэкап
  остаётся, свидетель не обновлён, exit 1, файл прежний.
  Маппинг: тот же.

### NFR-06 — детерминированность не-TTY вывода

- **N06-1** Given неизменное состояние парка, When два non-TTY прогона
  (`--check`, `--json`, `--review`), Then порядок строк и нумерация идентичны,
  `diff` пуст.
  Маппинг: `tests/integration/upgrade-park.test.ts`,
  `tests/integration/upgrade-check.test.ts`.
- **N06-2** Given разный порядок проектов в реестре, When сбор реестра решений,
  Then порядок задаётся реестром → картой → AGENTS.md → алфавитом (тест на
  фикстуре с перемешанным порядком).
  Маппинг: `tests/unit/use-cases/decisions.test.ts`.

## Прогоны

Точечные (по задачам, до полного гейта):

```
npx vitest run tests/unit/domain/protect-key.test.ts tests/unit/domain/line-diff.test.ts
npx vitest run tests/unit/adapters/render/sync-state.test.ts tests/unit/adapters/render/opencode-renderer.test.ts
npx vitest run tests/unit/use-cases/verify-against-map.test.ts tests/unit/use-cases/sync-base-set.test.ts
npx vitest run tests/unit/use-cases/decisions.test.ts tests/unit/use-cases/upgrade-projects.test.ts
npx vitest run tests/unit/use-cases/init-project.test.ts tests/unit/use-cases/doctor.test.ts
npx vitest run tests/unit/adapters/commands/memory-upgrade.check.test.ts tests/unit/adapters/commands/memory-upgrade.here.test.ts tests/unit/adapters/commands/upgrade-projects.test.ts
npx vitest run tests/integration/upgrade-check.test.ts tests/integration/upgrade-here.test.ts tests/integration/upgrade-park.test.ts tests/integration/b0-init.test.ts tests/integration/b0-sync.test.ts
npx tsc --noEmit
```

Полный гейт (T14, обязателен перед выпуском):

```
npm run check      # english-surface → prettier --check → tsc → build → vitest (все файлы)
npm run e2e        # сборка + tests/e2e (правило проекта: E2E после каждого плана)
```

Ручные/полу-ручные проверки:

- **Парк-фикстура (3 проекта)**: `--check` → `--resolve` → `--json` → повторный
  прогон; ожидание: `--check` 0 и неизменный вывод, `--resolve` exit 0/2 по
  остатку, `--json` парсится и совпадает по номерам, повторный прогон — exit 0 и
  ноль записей. Изолированный tmp-каталог, live-проекты не участвуют.
- **TTY `--review`**: воспроизводимая процедура — 2 mutated-файла, по одному
  решение `t` и `p`, «ко всем похожим» на группе из 3; ожидание — экраны с diff,
  после `p` файл `protected`, повтор `--check` без needs-decision.
- **Провайдерский риск `protect` (spike R-01) — regression guard, не ворота
  волны:** изолированный tmp-каталог, один
  `opencode run --agent <agent с protect>` против живого провайдера (модель —
  самый дешёвый настроенный алиас); ожидание — ответ 200 **и** отсутствие
  `protect` в теле запроса (живой прогон 2026-10-25, design §5: 200, ключ не
  уходит). Если новая версия opencode начнёт пробрасывать ключ и провайдер
  ответит 400 — записать в troubleshooting, снять ключ `--resolve …=keep`;
  волну это не блокирует (среда изменилась, не дизайн). Результат — в отчёт T14.

Ожидаемые ограничения: тесты не запускают реальный `npm` (мок), реальный
`opencode` (кроме ручного провайдерского шага), не пишут в домашний каталог
пользователя; «сегодня» — инъекция часов, чтобы имена бэкапов были
детерминированы.
