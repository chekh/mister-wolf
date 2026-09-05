# Protected suite — TF-1 «infra-hardening» (WolfEval v1, кампания WEV-001)

Защищённые проверки инстанса: то, что агент обязан сохранить зелёным, меняя код
под эпизоды E1–E6b. Используется сквозным аудитом `campaign-audit.sh`
(раздел «protected suite»); нарушение любого пункта кампанию проваливает.

## 1. Собственный `npm run check` инстанса

`npm run check` = `format:check + lint (tsc --noEmit) + build + test:run`.
Должен оставаться зелёным после работы агента в каждом эпизоде (ожидаемый итог
каждого промпта: «проверки проекта остаются зелёными»). Запускается аудитом
из корня инстанса; `--skip-protected` пропускает (только для smoke-прогонов).

## 2. G-чеклисты фиксов (маркер → GREEN-признак)

Источник — реальная git-история фиксов wolf 2.0.0–2.1.0 (не воображение).
Формат: дефект → RED-маркер (дефект жив) → GREEN-признак (фикс применён) →
дифф-коммит. Эти же признаки проверяют эпизодные оракулы `oracle-e*.sh`.

| Дефект | Файл инстанса                                | RED-маркер (дефект жив)                                               | GREEN-признак (фикс)                                                                        | Дифф    |
| ------ | -------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------- |
| F4     | `src/app/use-cases/init-project.ts`          | содержит `'no platform detected'` (skipped-ветка)                     | строки нет; конфиг пишется безусловно (+ поведенчески: песочница)                           | bf63fab |
| F8     | `src/app/use-cases/init-project.ts`          | содержит `scanProject` (авто-scan при init)                           | строки нет; scan — отдельная команда                                                        | bf63fab |
| F15    | `src/adapters/platforms/opencode-adapter.ts` | НЕ содержит `subagent_depth`                                          | `SUBAGENT_DEPTH`/`subagent_depth` в адаптере + регресс-тест                                 | 8a077f7 |
| F5+F6  | `src/adapters/cli/commands/memory-init.ts`   | НЕ содержит `formatBaseSetLine`; есть `'Restart your agent platform'` | `formatBaseSetLine`/`formatPlatformLine`, шаблон `[skill] … → …`; безусловный restart убран | 190ff6a |
| F13    | `src/adapters/cli/cli-entry.ts`              | НЕ содержит `safeCwd`                                                 | `safeCwd()` оборачивает `process.cwd()` в runCli + unit-тест веток                          | 3bdc117 |
| F14    | `scripts/bench/lib.sh`                       | НЕ содержит `XDG_CONFIG_HOME`                                         | XDG-изоляция + `bench_tmp`/`bench_cleanup` + `trap … EXIT`                                  | 1dd71e6 |
| F16    | `tests/setup.ts` + `vitest.config.ts`        | setup отсутствует/без XDG                                             | `tests/setup.ts` с `XDG_CONFIG_HOME` + `setupFiles` в конфигах                              | 190ff6a |

Дополнительно к G-чеклистам оракулы проверяют: регрессионные тесты эпизодов
(E1: init + config/opencode.json/platform; E2: subagent_depth; E5: обе ветки
safeCwd), поведенческие исходы в изолированной tmp-песочнице (E1: opencode.json
с первого init; E4: 0 doc-файлов после init без флагов, scan в CLI help) и
актуальность пользовательских доков (E4: README/docs не утверждают, что init
сканирует).

## 3. Использование и семантика для CFR

- Используется: `campaign-audit.sh <инстанс> [--arm BASE|WOLF] [--skip-protected]`
  — protected suite запускается по умолчанию, вместе с эпизодными оракулами,
  проверкой границ diff и (WOLF) инвариантами памяти по правилу E4.
- CFR-класс «повреждение защищённых файлов»: событие фиксируется, когда
  кампания провалена по protected suite (check красный) или G-чеклист
  демонстрирует регрессию уже закрытого в кампании дефекта (фикс от более
  раннего эпизода сломан поздним). Триаж событий — человек (спека §6.3 #8).

## Smoke (Фаза A)

Дата: 2026-09-05, worktree `.worktrees/wolfeval-phase-a`, инстансы-расходники
`/tmp/wolfeval-v1/wa3-gate` (fresh, 6/6 RED) и `/tmp/wolfeval-v1/wa5-mockfix`
(копия wa3-negcheck + мок-фикс F15 в opencode-adapter.ts). Дословные итоговые
строки прогонов:

```text
# 1) свежий инстанс: все 7 оракулов FAIL, аудит FAIL (негативная проверка
#    «заведомо провальное состояние → аудит фейлится»); exit 1
$ campaign-audit.sh /tmp/wolfeval-v1/wa3-gate --arm BASE --skip-protected
ORACLE E1: FAIL
ORACLE E2: FAIL
ORACLE E3: FAIL
ORACLE E4: FAIL
ORACLE E5: FAIL
ORACLE E6a: FAIL
ORACLE E6b: FAIL
AUDIT: границы diff (изменённые пути внутри разрешённых) — PASS
CAMPAIGN AUDIT: FAIL

# 2) мок-фиксы F4+F15: пункты кода зеленеют, итоги оракулов остаются FAIL,
#    пока эпизод не выполнен полностью (нет теста/поведения); exit 1
$ oracle-e1.sh /tmp/wolfeval-v1/wa5-mockfix
E1: (a) init-project.ts не содержит skipped-ветку 'no platform detected' [bf63fab] — PASS
E1: (b) песочница: первый init пишет opencode.json (валидный JSON, mcp.wolf; rc=0) — FAIL
E1: (в) регрессионный тест в tests/ (init + config/opencode.json/platform) — FAIL
ORACLE E1: FAIL

$ oracle-e2.sh /tmp/wolfeval-v1/wa5-mockfix
E2: (a) opencode-adapter.ts содержит subagent_depth (мердж 2) [8a077f7] — PASS
E2: (б) регрессионный тест на subagent_depth в tests/ [8a077f7] — FAIL
ORACLE E2: FAIL
```

На fresh-инстансе пункты-гарды E4 (б) scan-команда в CLI help и (г) нейтральные
доки — PASS по построению (scan зарегистрирован до фикса; пользовательские доки
утверждений «init сканирует» не содержали) — итог эпизода всё равно FAIL по (а)
и (в). Полные построчные выводы — в отчёте воркера WA5.
