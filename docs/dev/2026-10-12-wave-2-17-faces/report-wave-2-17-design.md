# Отчёт: wave-2-17-design — дизайн волны 2.17 «Лица: артефакт, версии, мутация»

- task_id: wave-2-17-design
- Тред: `mem_20261012_2_17_litsa_artefakt_versii_mutatsiya_vol_b69113`
- Статус: DONE_WITH_CONCERNS — дизайн готов и отревьюен; утверждает владелец через L0
  (открытые вопросы и визы — ниже)
- Дата: 2026-10-13. Baseline кода: `859cb4a` (main).

## Изменения

1. **requirements.md** — CR-2026-10-13-01 (решение владельца
   `mem_20261012_vladelets_utverdil_trebovaniya_volny_2_1_d4078e`): поле «границы
   применимости» возвращено в контракт сигнала «предложение» (REQ-08: требование,
   обоснование, новый AC об обязательности поля); открытый вопрос §6 закрыт;
   статус → approved. prettier --write прогнан.
2. **design.md** — полный дизайн по методике wolf-design (FULL): глоссарий,
   компоненты и ответственность, контракты (тип face, механика версий, guard,
   сигнал-фасет proposal, запись мутации G17, CLI, миграция, события, точная
   сводка схемных изменений), 6 ADR, отказы/конкурентность/восстановление,
   наблюдаемость, целостность (doctor), карта покрытия REQ-01…10 + NFR-01…03,
   бюджеты NFR, решения для визы владельца. Статус: review.
3. **review.md** — раунды 2–3 ревью дизайна (след ниже).

plan.md / test-plan.md не тронуты (следующий этап — после утверждения дизайна).
Код реализации не писался (запрещено брифом). Чужие области (hotfix 2.16.3,
templates/, tests/ в .worktrees/hotfix-2.16.3) не тронуты.

## Ревью-след (wolf-review 2.16.2)

- Раунд 2 (независимый, worker-reviewer через `opencode run`, фон): линзы Design +
  security/trust. SUMMARY: 1 critical / 4 major / 3 minor; VERDICT:
  CHANGES_REQUIRED. Находки: F-1 гвард breakglass нежизнеспособен
  (ensureCliSessionId всегда ставит WOLF_SESSION); F-2 инвариант «не переключать
  посередине» не обеспечен механикой; F-3 нет события отказа guard; F-4
  нереентерабельный lock в псевдокоде; F-5 facet-guard блокирует proposal на
  не-note; F-6 миграция без активного head; F-7 isPlaybookNote не знает face;
  F-8 MCP-поверхность.
- Ответ автора: все 8 приняты; F-1/F-4/F-5 верифицированы по коду до правки
  (`actor.ts:27`, `tool-librarian.ts:167`, `add-memory-object.ts:96`,
  TTL-тест `wolf-router-plugin.test.ts:218`). Исправления внесены в design.md
  (guard по префиксу opc-/cli-; паттерн внешнего lock; memory.face.denied;
  facet-guard расширение + путь saveProposal; skip без head; isPlaybookNote+face;
  MCP-ограничение v1).
- Раунд 3 (верификация закрытия): **SUMMARY: 0 critical / 0 major / 1 minor —
  VERDICT: APPROVED**. F-1…F-8 — CLOSED (кодовые ссылки правок верифицированы
  ревьюером по baseline); новая minor N-1 (расхождение payload memory.face.denied)
  закрыта автором в той же ревизии (псевдокод дополнен полем command). Полный след:
  review.md, раунд 3.

## Проверки (EVIDENCE)

- `npx prettier --write docs/dev/2026-10-12-wave-2-17-faces/requirements.md
docs/dev/2026-10-12-wave-2-17-faces/design.md` — «All files formatted correctly».
- `npm run check` (cwd репо, 2026-10-13): english-surface gate OK (85 files),
  prettier check OK, tsc OK, build OK, vitest — Test Files 163 passed (163),
  Tests 1222 passed (1222).
- Повторные гейты после правок дизайна: `node scripts/check-english-surface.mjs` —
  OK; `npx prettier --check "docs/**/*.md"` — OK.
- `wolf doctor`: артефакт-папка 2026-10-12-wave-2-17-faces — находок нет (показанные
  doctor-находки касаются чужих волн 2.16.x — вне scope, не трогал).
- CLI-факты — из живого дампа `node dist/bootstrap/cli.js --help` (+ add/list/
  search/tool/note/complaint/relation) на baseline; проектируемые команды в
  design.md помечены.

## Открытые вопросы владельцу (не решал сам)

1. **REQ-05 AC2 ↔ NFR-01** (design.md, «Решения для визы» п.4): остаточный случай
   переключения версии в живой сессии после TTL, если рантайм пересобирает
   system-текст. Вариант А (рекомендация L1): принять + e2e-тест допущения;
   Вариант Б: правка плагина в волне с корректировкой NFR-01/TTL-теста.
2. **MCP-поверхность** (п.5): подтвердить ограничение v1 (CLI + существующий MCP
   add) или вернуть MCP-обёртки face/propose в scope.
3. Визы продуктовых решений: ADR-3 (сигнал-фасет на любых core-типах, словарь
   note 7→8), ADR-6 (initiator += 'seed'), граница «следующего задания» = новая
   сессия/чат.

## Риски

- Допущение персистентности system-текста чата в opencode (основа инварианта
  REQ-05 AC2) — проверяется e2e-сценарием в test-plan; снятие допущения =
  решение владельца (вопрос 1).
- FTS-ранжирование мигрированных face vs note — закрыто тестом «мигрированное
  лицо резолвится router-путём» (ADR-4) до релиза.
- Спуфинг env-атрибуции — residual-риск кооперативной модели, принят требованиями
  (§6), журналируется.

## Для перехода к плану (wolf-plan + wolf-testplan)

Нужно от владельца через L0: утверждение design.md (с решением вопросов 1–2 и
визой ADR-3/ADR-6/границы задания). После утверждения — назначение wolf-plan и
wolf-testplan на эту папку.

## FRICTION

- `rtk run_command` (1×): множит shell-перенаправления (`>`, `&&` парсятся как
  аргументы npm) и не возвращает код завершения; обход — разбор строк сводки
  vitest и отдельные команды без редиректов.
