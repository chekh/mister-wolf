# WEV-001 — сводный скоринг кампании (WC3)

Сводные артефакты скореров Фазы C по двум повторам (r1+r2). Сырьё —
`../{r1,r2}/`; скореры — `benchmarks/wolfeval-v1/analysis/`
(scorer_hash `05d56fac…`, без изменений с заморозки). Живых сессий НЕ
запускалось: скореры детерминированные, потребляют только опубликованные
измерения.

## Входы (собраны конкатенацией, порядок фиксирован)

- `sessions.jsonl` = `r1/base` + `r1/wolf` + `r2/base` + `r2/wolf` (34 строки);
- `runs.tsv` = `r1/runs.tsv` + `r2/runs.tsv` (34 строки, без заголовка —
  колонки по порядку `log,repeat,arm,episode,planned_kill`);
- `audit-verdicts.jsonl` = кампания-уровневые вердикты r1+r2 (4 строки, все FAIL).

## Прогон (дословные команды и вывод — `scorer-run.log`)

Из этого каталога:

```text
bash ../../../benchmarks/wolfeval-v1/analysis/csr.sh audit-verdicts.jsonl
bash ../../../benchmarks/wolfeval-v1/analysis/cost.sh sessions.jsonl runs.tsv audit-verdicts.jsonl costs.csv
bash ../../../benchmarks/wolfeval-v1/analysis/cfr.sh sessions.jsonl runs.tsv audit-verdicts.jsonl
bash ../../../benchmarks/wolfeval-v1/analysis/secondary.sh sessions.jsonl runs.tsv
```

Итог (stdout): CSR base 0/2, wolf 0/2; CPSC base n/a, wolf n/a (0 успешных
кампаний); cfr-events 0, invalid-run 4 (F21-hang=3, F25=1); secondary 28
эпизодов.

## Выходы

- `csr.jsonl`, `costs.csv`, `cfr-events.jsonl`, `invalid-run.jsonl`,
  `secondary.jsonl` — артефакты скореров;
- `bootstrap.py` + `bootstrap.txt` — точный (перечислимый) bootstrap по
  кластерам-повторам для описательных стоимостных дельт;
- `cfr-triage.jsonl` — операторский триаж критических событий (детектор
  лог-зависимые классы не эмитировал, см. ниже).

## Деградация детектора (зафиксировано честно)

JSONL-логи сессий r1/r2 не сохранены (в git — телеметрия sessions.jsonl,
вердикты и oracle-выводы; A/A-логи сохранены, r1/r2 — нет) и полные
campaign-audit-логи (`r1/audit-base.log` и т.п.) не опубликованы. Следствия:

- `false_acceptance` не детектируется (нужен финальный ассистентский text
  лога) — 0 кандидатов НЕ означает отсутствия событий;
- `protected_damage`/`superseded_rule_e4`/`scope_violation`/`data_loss` из
  audit_log не эмитируются (файлы недоступны — предупреждения в scorer-run.log);
- `iterations`/`memory_contact`/`duplicate_work`/`stale_usage`/`symmetry_e6`
  в secondary.jsonl = 0/null по той же причине — не реальные нули.

Операторский триаж этих классов по журналам кампаний — `cfr-triage.jsonl`
(источники: r1/notes.md, r2/notes.md, карта эксперимента).

## Воспроизведение

```bash
cd playground-lab/measurements/WEV-001/scoring
bash ../../../benchmarks/wolfeval-v1/analysis/csr.sh audit-verdicts.jsonl
# ... команды выше; сверка с scorer-run.log и bootstrap.txt
python3 bootstrap.py
```
