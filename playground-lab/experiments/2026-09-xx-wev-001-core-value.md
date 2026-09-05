# EXP-2026-09-xx-WEV-001: core-value — продольный эффект накопления

<!-- Карточка создана в Фазе A (pre-launch freeze). Дата в имени файла и поле
     «Дата» проставляются при старте Фазы C, до первого прогона; после старта
     карточка НЕ редактируется (гейт E4 п.1, спека §3.4). -->

- Статус: planned <!-- planned | running | analyzed | concluded -->
- Дата: 2026-09-xx
- experiment_id: WEV-001
- Гипотеза: продольный эффект накопления — полная кампания с механизмом
  накопления Wolf стоит дешевле на успешную кампанию: CPSC(WOLF) < CPSC(BASE)

## Фиксация до запуска (pre-launch freeze)

- claim_ids: PIL-004, PIL-003, MEM-001, MEM-006 (из claims.yaml)
- primary_metrics: CSR, CPSC, CFR
- safety_metrics: CFR-классы (ложная приёмка / повреждение защищённых файлов /
  superseded-правило E4 / scope violation / потеря данных — не усредняются,
  каждое событие разбирается отдельно)
- arms: BASE (strong-baseline), WOLF (full-wolf, wolf init v2.5.0) — arms.yaml
- minimum_practical_effect (спека §7.3, дословно):
  CPSC(WOLF) ≤ 0.85 × CPSC(BASE) при CSR(WOLF) ≥ CSR(BASE) и
  CFR(WOLF) ≤ CFR(BASE); интерпретация — направленный сигнал + обкатанная
  инфраструктура (даунгрейд при 2 кластерах: раздел «Бюджет сессий» плана),
  недостижение = отсутствие свидетельств, НЕ доказательство отсутствия эффекта
- runs_per_campaign: 2 (бюджет v1: потолок 40 сессий; 3-й повтор — кандидат
  в первое расширение; то же решение сокращает A/A до 1 пары)
- stopping_rule: fixed (досрочных остановок и добавлений нет)
- task_set_hash: bb3a09ba325f203939807df7295615a2d7679df6
- scorer_hash: 02246ecb59b016da4f7422ccf31e5e58e9c2028d
- environment-lock:
  playground-lab/measurements/WEV-001/environment-lock.json
  (sha1 ec3f81573ed3b91cfcf7e0accb3b01efeab536bb)
- Порядок: r1 = BASE→WOLF, r2 = WOLF→BASE, сид 20260905 — run-configs/wev-001.yaml

## Сетап

| Вариант | Агенты/конфигурация                                                                                                            | Отличие от базового   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| BASE    | срез wolf-pre-2.0.0 без волчьих артефактов; default opencode, `--agent` не передаётся; заметки разрешены (strong baseline, П2) | —                     |
| WOLF    | тот же срез + wolf init v2.5.0: память .wolf, MCP mr-wolf-\*, AGENTS.md, opencode.json                                         | + механизм накопления |

Инстанс: fixtures/wolf-pre-2.0.0.md (срез 9637506, все 6 дефектов живы —
verify-fixtures 6/6 RED как pre-run gate F24). Обе руки — один агент без
субагентов; промпты e1–e6b дословно одинаковы (task_set_hash выше).

## Метод измерения

Лаунчер wolf-session.sh (hang-guard, sessions.jsonl с весовыми токенами:
weight = input + 0.1×cache_read + 5×output; exit 0/124/1/2, F25-валидация).
Оценка конечным состоянием: скрытые оракулы E1–E6b + campaign-audit
(границы diff, protected suite, инварианты памяти E4 для WOLF) — до
пересборки. Скореры analysis/ (scorer_hash выше): cost/CPSC, csr, cfr
(+ invalid-run: F21/F22/F25), secondary. Слепой скоринг (скореры аудит не
запускают). Bootstrap по кластерам = повторам кампании; CI заведомо широки —
заявленная граница, а не спрятанная.

## Сценарии

Эпизоды E1–E6b (реплеи F4, F15, F5+F6, F8, F13+F21, F14, F16) —
task-families/TF-1-infra-hardening/family.md и instances/WEV-001/e\*.md.
Дефекты: playground-lab/registry/findings.md.

## Ожидаемое поведение

Если гипотеза верна: CPSC(WOLF) ≤ 0.85 × CPSC(BASE) при нехудших CSR/CFR;
вторично — кеш-прогрев, меньше duplicate-work у WOLF в эпизодах-потребителях
(E2/E3/E6b), memory-contact у WOLF, симметрия решений E6a/E6b.

## Протокол

<!-- заполняется при прогонах: ход, отклонения; сырьё — measurements/WEV-001/ -->

## Находки

<!-- F-id из registry/findings.md по мере появления -->

## Вердикт

<!-- по зафиксированным метрикам после WC3; формулировки — evidence-state -->
