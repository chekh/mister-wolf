# WolfEval v1 — analysis-скореры (WA7)

Детерминированные скореры Фазы A (bash + python3, **без LLM и без запуска
аудита**): стоимость (CPSC), Campaign Success Rate (CSR), детектор кандидатов
критических событий (CFR) и вторичные метрики. Спека —
`docs/superpowers/specs/2026-09-04-wolfeval-v1-design.md` §6; план —
`docs/plans/2026-09-04-wolfeval-v1.md`, задача WA7.

## Слепой скоринг

Скореры **не запускают** campaign-audit и оракулы. Они только потребляют:

- телеметрию лаунчера (`sessions.jsonl`) — пишет `wolf-session.sh`;
- манифест атрибуции (`runs.tsv`) — заполняет **оператор** при запусках;
- вердикты аудитов (`audit-verdicts.jsonl`) — заполняет оператор при прогоне
  `campaign-audit.sh` (слепой скоринг: скрытые оракулы не вскрываются до
  окончания скоринга);
- логи сессий (JSONL opencode).

Все артефакты скореров (`costs.csv`, `csr.jsonl`, `cfr-events.jsonl`,
`invalid-run.jsonl`, `secondary.jsonl`) пишутся в **текущий каталог** —
запускайте скореры из скоринг-каталога, а не из репозитория.

## Форматы входов

### sessions.jsonl (лаунчер wolf-session.sh)

Одна строка = один запуск:

```json
{
  "ts": "…",
  "cwd": "…",
  "agent": "…",
  "model": "…",
  "exit": 0,
  "secs": 120,
  "tokens": { "input": 1000, "cache_read": 2000, "output": 200, "weight": 2200 },
  "log": "/abs/path/session-log.jsonl"
}
```

- `weight = input + 0.1×cache_read + 5×output` (формула лаунчера);
- `exit`: `0` ok, `124` timeout, `1` error, `2` silent truncation (F25);
- `log` — путь к логу сессии (JSONL opencode: события step-finish,
  tool-вызовы, ассистентские text).

### runs.tsv — манифест атрибуции (ведёт оператор)

Лаунчер не пишет arm/episode/repeat — атрибуция заполняется вручную рядом со
scoring-артефактами. TSV **с заголовком** (колонки — в любом порядке), таб —
разделитель:

```tsv
log	repeat	arm	episode	planned_kill
/abs/path/log.jsonl	r1	WOLF	e5	1
```

- `log` — путь, совпадающий с полем `log` в sessions.jsonl (допустим fallback
  по уникальному basename);
- `repeat` — идентификатор повтора кампании (например `r1`);
- `arm` — `BASE` | `WOLF`;
- `episode` — `e1…e6b` (нормализуется к нижнему регистру);
- `planned_kill` — `1`, если запуск — штатная точка обрыва E5, иначе `0`
  (значения `1/true/yes/y`).

Джойн sessions.jsonl ↔ runs.tsv идёт по `log`. Сессия без матча —
предупреждение в stderr, в выходы не попадает; строка runs.tsv без сессии —
предупреждение.

### audit-verdicts.jsonl — вердикты кампаний (ведёт оператор)

Заполняется при прогоне `campaign-audit.sh` (по одному прогону на кампанию):

```json
{ "repeat": "r1", "arm": "WOLF", "verdict": "PASS", "audit_log": "/abs/path/audit.log" }
```

- `verdict` — `PASS` | `FAIL` (итоговая строка `CAMPAIGN AUDIT:` скрипта);
- `audit_log` — путь к полному логу аудита (используется cfr.sh для
  построчных вердиктов; недоступен — кампания-уровневые классы просто не
  эмитируются, с предупреждением);
- несколько строк на один `(repeat, arm)` — конфликт: предупреждение,
  консервативно `FAIL`.

### Логи сессий (JSONL opencode)

Скореры распознают события двух форматов:

- современный: `{"type":"…","part":{"type":"tool-call"|"text"|"step-finish", …}}`;
- legacy: `{"type":"message","info":{"role":"assistant","content":[{"type":"text","text":…}]}}`.

Не-JSON строки (заголовок лаунчера, артефакты stderr) пропускаются.

## cost.sh — по-эпизодная стоимость + CPSC

```text
usage: cost.sh <sessions.jsonl> <runs.tsv> [audit-verdicts.jsonl] [costs.csv]
```

Выход: `costs.csv` (в файл-аргумент или stdout; строки `CPSC …` печатаются в
stdout после CSV) со колонками
`ts,repeat,arm,episode,input,cache_read,output,weight,secs,exit,planned_kill`.

Правила:

- **weight пересчитывается** по формуле лаунчера
  `input + 0.1×cache_read + 5×output`; расхождение с полем `weight` в
  sessions.jsonl — предупреждение, используется пересчёт;
- эпизод = группа строк `(repeat, arm, episode)`: E5 = 2 запуска
  (planned_kill-обрыв + восстановление) агрегируются в одну строку — суммы
  input/cache_read/output/weight/secs, `exit` через `;`, `planned_kill=1`,
  если у любой строки;
- **CPSC<arm>** = Σ weight всех смэтченных сессий руки / число успешных
  кампаний руки. Успешная кампания = `verdict PASS` **И** ≥1 смэтченная сессия
  этого повтора: вердикт без сессий считается незапущенной кампанией
  (предупреждение, в знаменатель не идёт); сессии без вердикта —
  предупреждение, считаются неуспехом;
- без `audit-verdicts.jsonl`: знаменатель = все повторы руки с сессиями,
  вывод помечается `assume_all_success=true`;
- 0 успешных кампаний → `CPSC <arm>: n/a` + предупреждение (не крэш);
- invalid-кандидаты (F21/F22/F25, см. cfr.sh) **не исключаются**: выбытие —
  решение триажа; CSV по-эпизодный, пересчёт после триажа возможен.

## csr.sh — Campaign Success Rate

```text
usage: csr.sh <audit-verdicts.jsonl>
```

Выход: `csr.jsonl` в текущем каталоге — `{"repeat":"r1","arm":"WOLF","success":1}`
на каждый `(repeat, arm)`; сводка в stdout: `CSR <arm>: k/n`.

Правила: вердикт берётся дословно; неполные строки и verdict ∉ {PASS, FAIL} —
предупреждение и пропуск; конфликт строк на один `(repeat, arm)` —
предупреждение, консервативно FAIL. csr видит **только** вердикты: повторы,
отсутствующие в файле, этим скриптом не обнаружимы (нет списка ожидаемых
прогонов) — прогалы «сессии есть, вердикта нет» предупреждают cost.sh/cfr.sh.

## cfr.sh — кандидаты критических событий + выбытия

```text
usage: cfr.sh <sessions.jsonl> <runs.tsv> <audit-verdicts.jsonl> [логи…]
```

Детерминированный детектор **кандидатов**; финальный триаж — человек (спека
§6.3 #8). Выходы в текущем каталоге:

- `cfr-events.jsonl` — по строке на событие:
  `{"class","repeat","arm","episode","evidence"}`; `episode:"*"` — событие
  кампания-уровневое;
- `invalid-run.jsonl` — выбытия (НЕ CFR-класс):
  `{"repeat","arm","episode","log","exit","reason"}`.

Дополнительные `[логи…]`-аргументы включаются в пул логов; атрибуция — только
если путь есть в runs.tsv.

### CFR-классы (фиксированы до запуска, события не усредняются)

| Класс                | Детекция (детерминированная)                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `false_acceptance`   | Финальный ассистентский text лога эпизода содержит маркер завершения (фиксированный список, без учёта регистра: `выполнено`, `готово`, `сделано`, `завершено`, `закончил`, `done`/`DONE`), а вердикт кампании FAIL ИЛИ построчный вердикт оракула этого эпизода FAIL (`ORACLE E<n>: FAIL` в audit_log). Для многострочного эпизода (E5) берётся текст последней по ts сессии (восстановление). |
| `protected_damage`   | В audit_log строка «protected suite … — FAIL» (npm run check инстанса красный; семантика — protected-suite.md).                                                                                                                                                                                                                                                                                |
| `superseded_rule_e4` | В audit_log строки инвариантов памяти E4 с вердиктом FAIL («правило E4 … — FAIL», «активный объект … — FAIL») — активный объект памяти противоречит правилу E4 без superseded.                                                                                                                                                                                                                 |
| `scope_violation`    | В audit_log строки «scope violation … — FAIL» (правки вне разрешённых путей).                                                                                                                                                                                                                                                                                                                  |
| `data_loss`          | Консервативно: в audit_log зафиксировано отсутствие накопленного состояния (WOLF: «.wolf отсутствует»; BASE: строка про отсутствующий NOTES.md), при том что в логах кампании есть контакты с этим состоянием (WOLF: tool-вызовы `mr[-*]wolf\*`; BASE: tool-обращения к NOTES.md/notes/). Признаков нет — класс не эмитируется.                                                                |

### Механика invalid_run (выбытие)

Прогон — кандидат на выбытие, если выполняется любое условие:

- `exit 124` **без** `planned_kill=1` в runs.tsv — F21-hang (зависание);
- `exit 2` — F25 silent truncation (RC=0 при оборванном логе — дефект
  лаунчера, см. его header);
- нулевые токены во всех каналах (input=cache_read=output=0) — F22.

`exit 124` при `planned_kill=1` — **штатный** сценарий E5, НЕ выбытие. Причины
в invalid-run.jsonl перечисляются через `;`, тег причины — префикс до `:`
(`F21-hang`, `F25`, `F22`).

## secondary.sh — вторичные метрики по эпизодам

```text
usage: secondary.sh <sessions.jsonl> <runs.tsv> [логи…]
```

Выход: `secondary.jsonl` в текущем каталоге — строка на эпизод (E5-пара
агрегируется) + сводка `SYM E6 <repeat>/<arm>: …` в stdout.

| Поле                      | Правило подсчёта                                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `first_pass`              | 1 ⟺ ровно один запуск эпизода, `exit=0`, токены не нулевые и нет invalid-признаков (F21/F22/F25). Второй запуск E5 (planned_kill + восстановление) и invalid-прогоны → 0.                                                                                                                                                                              |
| `wall_clock`              | Сумма `secs` запусков эпизода, сек.                                                                                                                                                                                                                                                                                                                    |
| `input/cache_read/output` | Суммы токенов по компонентам.                                                                                                                                                                                                                                                                                                                          |
| `iterations`              | Число событий tool-вызовов в логе(ах) эпизода. **Tool-вызов** = JSONL-событие, у которого `part.type` или верхнеуровневый `type` содержит `tool` (`tool-call`/`tool_call`); имя инструмента — `part.tool`/`tool`.                                                                                                                                      |
| `memory_contact`          | WOLF: tool-вызовы с именем, матчащим `mr[-_]?wolf` (регистронезависимо). BASE: tool-вызовы `read/edit/write/grep/glob/cat`, в JSON-строке которых есть `NOTES.md` или `/notes/`.                                                                                                                                                                       |
| `duplicate_work`          | Только эпизоды-потребители: `e2`/`e3` — счёт read-обращений (`read/grep/glob/cat`) к зоне производителя E1 (`src/app/use-cases/init-project.ts`, `src/adapters/`); `e6b` — к зоне E6a (`scripts/bench/lib.sh`). Выше счёт = больше повторного исследования. Для остальных эпизодов — `null`.                                                           |
| `stale_usage`             | Только E4+ (`e4,e5,e6a,e6b`): 1, если любой ассистентский text лога матчит `init.{0,120}(авто-?скан\|сканир\|auto-?scan\|scan at init\|scans)` (regex как в campaign-audit). Консервативно: отрицания («init не сканирует») тоже флагуются — флаг для триажа, не приговор. Для e1–e3 — `null`.                                                         |
| `symmetry_e6`             | Только `e6a`/`e6b`: 1 ⟺ в логах **обоих** эпизодов кампании `(repeat,arm)` есть упоминание XDG/изоляции (regex `XDG\|изол`, без регистра). **Метод — по логам, не по коду инстанса** (у скорера нет инстанса): консервативный прокси; помечен метод здесь, upgrading — confirmatory-фаза. Если одного из эпизодов нет — `null`, сводка печатает `n/a`. |

## scorer_hash

Хэш всех скореров и скрытых оракулов (глоб-порядок алфавитный —
детерминированный). Команда (из `playground-lab/benchmarks/wolfeval-v1/`):

```text
cat analysis/*.sh task-families/TF-1-infra-hardening/hidden-oracles/*.sh | shasum
```

Порядок файлов: `analysis/{cfr.sh,cost.sh,csr.sh,secondary.sh}` +
`hidden-oracles/{campaign-audit.sh,oracle-e1.sh…oracle-e6b.sh}`.

```text
scorer_hash: 05d56fac2087b25044d3e916c27490b59fc1edb4
```

Хэш переходит в карту эксперимента WA8 (pre-launch freeze).

## Синтетическая самопроверка (Фаза A)

Полигон: `/tmp/wolfeval-v1/wa7-synth/` (системный tmp). Фикстуры:

- `sessions.jsonl` — 5 строк: (1) валидный ok-прогон E1 BASE с ненулевыми
  токенами; (2) invalid `exit 124` без planned_kill (r1 WOLF e2); (3) invalid
  нулевые токены + `exit 0` (r2 WOLF e3); (4) E5-пара: `exit 124` с
  `planned_kill=1` + ok-восстановление (r1 WOLF e5);
- `runs.tsv` — атрибуция r1/r2 × BASE/WOLF;
- `audit-verdicts.jsonl` — r1 WOLF PASS, r1 BASE FAIL, r2 оба PASS
  (audit-мини-логи: r1-base — FAIL с protected/scope/E1-FAIL, остальные PASS);
- `logs/*.jsonl` — мини-логи (tool-события, step-finish reason=stop, финальный
  text «Готово…» у BASE r1 — кейс false_acceptance; «…завершено…» у e5-восстановления —
  негативный контроль: маркер при вердикте PASS события НЕ даёт).

Ожидания сформулированы ДО прогона (см. ниже); выводы дословные.

### cost.sh (с вердиктами)

```text
$ bash analysis/cost.sh …/sessions.jsonl …/runs.tsv …/audit-verdicts.jsonl …/scoring/costs.csv
cost.sh: r2/BASE: вердикт есть, смэтченных сессий нет — в знаменатель CPSC не идёт
cost.sh: CPSC BASE: 0 успешных кампаний — деление на ноль, вывод n/a
costs.csv: 4 эпизодов -> /tmp/wolfeval-v1/wa7-synth/scoring/costs.csv
CPSC BASE: n/a (0 успешных кампаний)
CPSC WOLF: 2262.50
```

`costs.csv` дословно:

```csv
ts,repeat,arm,episode,input,cache_read,output,weight,secs,exit,planned_kill
2026-09-05T10:00:00Z,r1,BASE,e1,1000,2000,200,2200,120,0,0
2026-09-05T10:10:00Z,r1,WOLF,e2,2000,0,5,2025,480,124,0
2026-09-05T10:20:00Z,r2,WOLF,e3,0,0,0,0,90,0,0
2026-09-05T10:30:00Z,r1,WOLF,e5,1300,4000,160,2500,500,124;0,1
```

Ручной пересчёт weight (формула `input + 0.1×cache_read + 5×output`):

- e1: `1000 + 0.1×2000 + 5×200 = 1000 + 200 + 1000 = 2200` ✓ (совпало с полем
  weight лаунчера в фикстуре);
- e2: `2000 + 0.1×0 + 5×5 = 2025` ✓;
- e5-пара: kill `500 + 0.1×1000 + 5×10 = 650`; восстановление
  `800 + 0.1×3000 + 5×150 = 1850`; эпизод `650 + 1850 = 2500` ✓, secs
  `300+200=500`, exit `124;0`, planned_kill `1` ✓.

Ручной пересчёт CPSC:

- WOLF: Σ weight = 2025 (e2) + 0 (e3) + 2500 (e5) = 4525; успешные кампании =
  r1 (PASS, сессии есть) + r2 (PASS, сессия e3 есть) = 2 → `4525/2 = 2262.5` ✓;
- BASE: Σ = 2200 (только r1, вердикт FAIL); успешных с сессиями = 0 →
  `n/a` + предупреждение, крэша нет ✓ (r2 BASE PASS без сессий — в знаменатель
  не идёт, предупреждение ✓).

Без вердиктов (`cost.sh sessions.jsonl runs.tsv`):

```text
CPSC BASE: 2200 (assume_all_success=true)
CPSC WOLF: 2262.50 (assume_all_success=true)
```

### csr.sh

На полном файле вердиктов (4 строки: r1 WOLF PASS, r1 BASE FAIL, r2 оба PASS):

```text
$ bash analysis/csr.sh …/audit-verdicts.jsonl
CSR BASE: 1/2
CSR WOLF: 2/2
csr.jsonl: 4 строк -> csr.jsonl
```

На r1-only подмножестве (дополнительный прогон, `head -2`):

```text
$ bash analysis/csr.sh …/audit-verdicts-r1only.jsonl
CSR BASE: 0/1
CSR WOLF: 1/1
csr.jsonl: 2 строк -> csr.jsonl
```

### cfr.sh

```text
$ bash analysis/cfr.sh …/sessions.jsonl …/runs.tsv …/audit-verdicts.jsonl
cfr-events.jsonl: 3 (false_acceptance=1, protected_damage=1, scope_violation=1)
invalid-run.jsonl: 2 (F21-hang=1, F22=1)
```

`invalid-run.jsonl` дословно (обе invalid-строки зафлагованы; planned_kill-строка
e5 НЕ флагована — штатно):

```jsonl
{"repeat": "r1", "arm": "WOLF", "episode": "e2", "log": "/tmp/wolfeval-v1/wa7-synth/logs/e2-wolf-r1.jsonl", "exit": 124, "reason": "F21-hang: exit 124 без planned_kill"}
{"repeat": "r2", "arm": "WOLF", "episode": "e3", "log": "/tmp/wolfeval-v1/wa7-synth/logs/e3-wolf-r2.jsonl", "exit": 0, "reason": "F22: нулевые токены во всех каналах"}
```

Событие false_acceptance (BASE r1, DONE-текст + FAIL-вердикт) дословно:

```jsonl
{
  "class": "false_acceptance",
  "repeat": "r1",
  "arm": "BASE",
  "episode": "e1",
  "evidence": "log=/tmp/wolfeval-v1/wa7-synth/logs/e1-base-r1.jsonl; маркер «готово» в финальном ассистентском text; вердикт кампании FAIL (audit-verdicts); CAMPAIGN AUDIT: FAIL (audit_log); ORACLE e1: FAIL (audit_log)"
}
```

Прочие события — protected_damage и scope_violation по r1/BASE (строки FAIL из
audit-мини-лога). Отрицательные контроли сошлись: e5-восстановление содержит
маркер «завершено», но вердикт WOLF r1 PASS → события НЕТ; superseded_rule_e4 и
data_loss на чистых audit-логах не эмитированы.

Живая цепочка data_loss (ревью-фикс: campaign-audit эмитирует
data_loss-кандидат для BASE при отсутствии NOTES.md/notes; cfr подхватывает
строку при контактах с заметками в логах). В `audits/r1-base.log` добавлена
строка аудита, прогон с r1-only вердиктами:

```text
$ bash analysis/cfr.sh …/sessions.jsonl …/runs.tsv …/audit-verdicts-r1only.jsonl …/logs/*.jsonl
cfr-events.jsonl: 4 (data_loss=1, false_acceptance=1, protected_damage=1, scope_violation=1)
invalid-run.jsonl: 2 (F21-hang=1, F22=1)
```

Событие data_loss дословно (контактов с NOTES.md в логах — 2):

```jsonl
{
  "class": "data_loss",
  "repeat": "r1",
  "arm": "BASE",
  "episode": "*",
  "evidence": "audit_log=/tmp/wolfeval-v1/wa7-synth/audits/r1-base.log; NOTES.md (заметки BASE) отсутствует на аудите; контактов с состоянием в логах кампании: 2"
}
```

### secondary.sh

```text
$ bash analysis/secondary.sh …/sessions.jsonl …/runs.tsv
secondary.jsonl: 4 эпизодов
SYM E6 r1/BASE: n/a (нет строк эпизода e6a)
SYM E6 r1/WOLF: n/a (нет строк эпизода e6a)
SYM E6 r2/WOLF: n/a (нет строк эпизода e6a)
```

`secondary.jsonl` (ключевые поля; сверка с ожиданиями):

| эпизод     | first_pass      | wall_clock | iterations | memory_contact       | duplicate_work            | stale_usage |
| ---------- | --------------- | ---------- | ---------- | -------------------- | ------------------------- | ----------- |
| r1 BASE e1 | 1 ✓             | 120 ✓      | 2 ✓        | 1 ✓ (read NOTES.md)  | null ✓                    | null ✓      |
| r1 WOLF e2 | 0 ✓ (F21)       | 480 ✓      | 1 ✓        | 1 ✓ (mr-wolf_search) | 0 ✓                       | null ✓      |
| r1 WOLF e5 | 0 ✓ (2 запуска) | 500 ✓      | 2 ✓ (1+1)  | 0 ✓                  | null ✓                    | 0 ✓         |
| r2 WOLF e3 | 0 ✓ (F22)       | 90 ✓       | 1 ✓        | 0 ✓                  | 1 ✓ (read src/adapters/…) | null ✓      |

Примечание: `duplicate_work` у e2 = 0 (не null) — e2 эпизод-потребитель, зоны
производителя он не читал; null только у непотребителей (e1, e5).

Детерминизм: повторные прогоны cfr.sh и secondary.sh дают побайтово идентичные
выходы (проверено diff-ом).

### Известное отклонение от ТЗ-ожидания

В ТЗ ожидание «csr: CSR WOLF 1/1, BASE 0/1» несовместимо с также указанным там
же полным файлом вердиктов (r2 оба PASS): csr.sh читает только вердикты, на
полном файле корректный вывод `2/2` и `1/2`. Ожидание ТЗ воспроизводится на
r1-only подмножестве вердиктов (прогон приведён выше) — обе проверки задокументированы.
