# Интеграция харнессов: жизненный цикл памяти и координация

Гайд для внешних акторов — агентов, воркеров, обёрток — как фиксировать в
сигнальном логе (а) что память реально использовалась, (б) факты координации
между ролями. Две команды, обе пишут в `.wolf/metrics/session-metrics.jsonl`
(формат событий — [signal-log.md](./signal-log.md)); обе дешёвые и безопасные:
сбой телеметрии не должен ломать основной поток — оборачивай в try/catch.

## `cited` / `applied`: что память сработала

Стадии `retrieved` (поиск выдал объект) и `injected` (объект попал в контекст)
пишутся автоматически (`wolf search`/`get`, `brief`/`call`). Дальше — только
ты знаешь, помогла ли память:

- **cited** — процитировал объект памяти в ответе/отчёте пользователю или
  lead'у (сослался на решение, урок, правило);
- **applied** — внедрил содержимое объекта в код/решение (применил правило,
  воспроизвёл урок, реализовал решение).

```bash
wolf memory-stage --stage cited --ids mem_20260904_use_append_only_jsonl_… --actor agent:worker
wolf memory-stage --stage applied --ids mem_20260904_use_append_only_jsonl_… --actor agent:worker
```

- `--ids` — одно или несколько id через запятую; пустой список — ошибка;
- `--actor` — кто применил/процитировал (`agent:<имя>` для агентов; дефолт —
  `WOLF_ACTOR` env или `user:cli`);
- `--session <id>` — id сессии; для applied не обязателен, но полезен для
  сквозной атрибуции (см. [analytics.md](./analytics.md)).

### `WOLF_SESSION`: связка авто-писателей с сессией

Авто-писатели (`wolf search`/`get` → retrieved, `wolf brief`/`call` → injected)
берут id сессии из env `WOLF_SESSION` (симметрия с `WOLF_ACTOR`): харнес
выставляет его на старте сессии агента — тогда `injected`-события связываются
с `task_evaluated` по `session_id`, и атрибуция
(`attributionCoveragePct`) видит инъекции авто-путей. Без env события пишутся
с `session_id: null` и в атрибуции не участвуют. `wolf memory-stage` без
явного `--session` тоже подхватывает `WOLF_SESSION` — с выставленным env
связка applied/cited с сессией получается бесплатно.

Пиши честно и лениво: одно событие на пачку объектов, применённых одним
действием (`--ids id1,id2,id3`) — не по событию на объект. Ничего не
применил — ничего не пиши.

## `wolf coord`: координационные события

Фиксируй переходы задачи между ролями — кто, кому и что передал:

```bash
wolf coord --kind handoff --from "L0:wolf" --to "L1:lead" --ref mem_…_report --note "P2 wave C"
```

| kind         | Когда пишет                                                          |
| ------------ | -------------------------------------------------------------------- |
| `handoff`    | L0-координатор передал задачу/контекст исполнителю (диспетчеризация) |
| `review`     | ревьюер принял/провел ревью результата (`--from` = ревьюер)          |
| `acceptance` | задача/фаза принята (`--from` = тот, кто принял)                     |
| `blocker`    | работа встала на блокере (`--ref` = id blocker-объекта)              |
| `escalation` | эскалация наверх: воркер не справился, вопрос выше своего уровня     |

- `--from` — инициатор (дефолт: `WOLF_ACTOR` env или `user:cli`), `--to` —
  адресат, если есть;
- `--ref` — id связанных объектов (отчёт, блокер, задача), можно несколько
  через запятую и повторять флаг;
- `--note` — короткий контекст свободным текстом.

Кто пишет: L0-координатор — `handoff`/`escalation`; lead и ревьюер —
`review`/`acceptance`; `blocker` — тот, кто столкнулся (обычно lead/воркер),
причём `--ref` должен быть id реального blocker-объекта (`wolf blocker add`),
тогда аналитика закроет пару по `wolf blocker resolve` (см.
[analytics.md](./analytics.md), «`--view coordination` — координация»).

Агрегация: `wolf analytics --view coordination` (counts kind×from, последние
события, blocker-пары) и `--view memory` (воронка стадий + attribution).

## Кампании: прогоны с памятью и без

Сценарий A/B «та же задача, с памятью и без»: одна задача, N прогонов в
сессиях с injected-памятью (обычный поток `wolf call`/`brief` с выставленным
`WOLF_SESSION`) и M прогонов без памяти; все раны и вердикты помечаются одним
id кампании:

```bash
# arm «с памятью»: инъекции пишутся в сессию (WOLF_SESSION у авто-писателей)
WOLF_SESSION=ses-ab-wolf wolf call
wolf run --agent dev --title "fix-failing-test" --session ses-ab-wolf \
  --campaign eval-01 --task-id fix-failing-test "Fix the failing test"
# ... ещё N-1 прогонов той же кампании в этой сессии
wolf task-eval --verdict accepted --session ses-ab-wolf \
  --task-id fix-failing-test --campaign eval-01

# arm «без памяти»: та же задача, отдельная сессия без инъекций
wolf run --agent dev --title "fix-failing-test" --session ses-ab-base \
  --campaign eval-01 --task-id fix-failing-test "Fix the failing test"
# ... ещё M-1 прогонов
wolf task-eval --verdict rejected --session ses-ab-base \
  --task-id fix-failing-test --campaign eval-01

# разбор: когорты with_memory/no_memory, медианы, accepted-доля, честные n/a
wolf analytics --view campaign
```

Когорта рана определяется по его `session_id` — была ли в сессии
`memory_stage injected` (механика join — в [analytics.md](./analytics.md),
«Кампании и ROI»), поэтому держи армы в разных сессиях, иначе сплит
нечестный. Когорта с n < 3 и кампания без вердиктов дают `n/a` с reason —
не подкручивай выборку, копи раны. Витрина корреляционная:
`--view campaign` — повод для гипотезы, не доказательство.
