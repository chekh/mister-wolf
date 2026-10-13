---
slug: wolf-2-17-1-subrelease
title: "2.17.1 — тест-план (REQ-01…REQ-07, NFR-01…NFR-03)"
status: draft
created: 2026-10-13
requirements: docs/dev/2026-10-13-wolf-2-17-1-subrelease/requirements.md
design: docs/dev/2026-10-13-wolf-2-17-1-subrelease/design.md
plan: docs/dev/2026-10-13-wolf-2-17-1-subrelease/plan.md
review: pending
---

# 2.17.1 — тест-план

- Источник ожидаемых результатов: requirements.md (AC) + design.md (контракты §3.1–3.6, состояния §3.3, отказные сценарии §5). Из кода ожидаемое не выводится.
- Трассировка «REQ-0x (R0y)» — во всех сценариях. Уровни: unit (vitest), integration (реальное хранилище/CLI, vitest), e2e (реальный диалог/CLI-сессии, traces), manual (воспроизводимая процедура).
- Инъекция сбоев (fault injection) — тестовый seam в слое записи: ошибка бросается ПОСЛЕ завершения указанного шага (данные шага на диске, следующий не начат); воспроизводимо в vitest, без ретраев и без скрытия нестабильности.
- Правило чистоты: свежие установки — в tmp-каталогах (прецедент `/tmp/wolf-2171-verify/r01-fresh`); без реальных секретов и внешних побочных действий; управляемое время для TTL-тестов.

## R2-02 — эталон «корректных режимов Task-агентов» (решение L0: владелец — test-plan)

Источник истины — шаблоны пакета: `templates/base/agents/*.md`, frontmatter `mode:` (фактический состав на базе `8ca53af`): `mr-wolf` → `primary`; `executor-lead`, `steward`, `worker-implementer`, `worker-researcher`, `worker-reviewer` → `all`. Дополнительные поля эталона: `description`, `permission` (у executor-lead: `task: worker-* allow, * deny`), подстановка `{{model.primary}}`. Проверка установки/обновления (S-55): установленные `.opencode/agent/*.md` проекта побайтово/полевo соответствуют шаблонам версии пакета; ожидаемый состав профилей/скиллов — содержимое `templates/base/**` (agents, playbooks, skills, commands, AGENTS.md).

## Сценарии

### REQ-01 (R01) — playbook Стюарда: установка и обновление

Терминология design (наблюдение ревьюера фазы 2 учтено): обновление live-лица — путь **re-init** (`wolf init --yes`, initiator `seed`, reason `template update: …`) по §3.6; отдельной «healing-команды обновления» в design нет — healing в design-терминах это дозавершение legacy-перехода миграции (§3.4), а восстановление незавершённых операций — `wolf face new --op-id` / `wolf face recover <opId> --abort` (§3.3). Сценарии ниже используют только эти имена.

- **S-01** (e2e/install, задача T4) — свежая установка.
  - Given: чистый tmp-каталог, установленный пакет. When: `wolf init --full --platform opencode`. Then: `wolf face show steward` содержит `wolf face new` и все 7 полей G17; НЕ содержит `wolf add --type playbook` как путь мутации; version/след seeded-лица корректны.
  - Oracle: REQ-01 AC-1. Маппинг: новый e2e/интеграционный тест установки (T4).
- **S-02** (integration, T4) — мутация по новой методике. Given: проект после S-01, env-атрибуция `WOLF_ACTOR=agent:steward`. When: выполнить `wolf face new` с полным G17 (по новой методике шаблона). Then: ровно одна новая версия, G17-запись + связи; второй generic supersede отсутствует (supersede выполняет сама команда).
  - Oracle: REQ-01 AC-2.
- **S-03** (integration, T4) — чужие рамки не затронуты. Given: память с лицами/правилами других агентов. When: мутация методики Стюарда (S-02). Then: diff памяти до/после — только новая версия лица steward + её след; агрегация уроков — на разрешённом механизме launcher'а (evidence: diff/лог).
  - Oracle: REQ-01 AC-3.
- **S-04** (integration, T4) — неуполномоченный актор отклонён guard'ом (регресс).
  - Oracle: REQ-01 AC-4.
- **S-05** (e2e/install, T4) — обновление 2.16.3 → 2.17.1. Given: проект с legacy howto Стюарда, без face. When: `npm i -g mister-wolf@2.17.1` + `wolf init --yes`. Then: одна операция `seed` с шагом `supersede_legacy`; активное лицо = новый шаблон; legacy-howto поглощён, дублей канона нет.
  - Oracle: REQ-01 AC-5 + design §3.6 (популяция 2.16.3).
- **S-06** (e2e/install, T4) — обновление 2.17.0 → 2.17.1. Given: проект с лицом initiator seed/migration, body = старый шаблон. When: re-init `wolf init --yes`. Then: новая версия через общий журналируемый механизм §3.3 (полный след), initiator `seed`, reason `template update: …`.
  - Oracle: REQ-01 AC-5 + §3.6.
- **S-07** (integration, T4) — steward-мутнувший проект. Given: лицо с initiator steward и изменённым body. When: re-init. Then: outcome `diverged` в отчёте; лицо не изменено (зона Стюарда, D4).
- **S-08** (integration, T4) — `wolf sync` не меняется. Given: проект с локальными правками лиц. When: `wolf sync`. Then: лицо не обновляется; mutated-skip конфликты — как сейчас (без изменений поведения).
  - Oracle: REQ-01 AC-5.

### REQ-02 (R02) — изоляция рабочих копий

- **S-10** (integration, T1) — legacy-инъекция. Given: копия W (linked worktree), в ней записана call-injection с legacy-scope `worktree:<name>`. When: `wolf call` в W / в main / в другой копии. Then: доставляется только в W.
  - Oracle: REQ-02 AC-1, NFR-01.
- **S-11** (integration, T1) — keyword-урок. Given: урок из копии W. When: `wolf call` в другой копии и в main. Then: урок не доставляется ни одной ветвью отбора без promote.
  - Oracle: REQ-02 AC-2, ADR-2.
- **S-12** (integration, T1) — негативный тест на КАЖДУЮ ветвь отбора (5 ветвей §3.2: call-injections/alias-note, keyword-уроки, keyword-правила, fallback-правила, thread-блокеры): объект каждого типа из чужой копии не доходит ни одной ветвью. Позитивный контроль REQ-02 AC-4: main/project-scoped правила и thread-блокеры доставляются как раньше; состав видимых типов не расширяется.
  - Oracle: REQ-02 AC-2, AC-4 + ADR-2 «новая ветвь = обязательный isVisible».
- **S-13** (integration, T1) — два basename. Given: копии `a/task` и `b/task`. When: резолв идентичности + встреча legacy-токена `worktree:task`. Then: разные WT-ID; токен не присвоен ни одной копии — конфликт в `scopeConflicts` (stderr `wolf call` + doctor).
  - Oracle: REQ-02 AC-3.
- **S-14** (integration, T1) — unknown/broken git metadata. Given: копия с испорченным git (или вне git). When: `wolf call`. Then: fail-closed — legacy-токены не маппятся, чужой scope недоступен, предупреждение в выводе.
  - Oracle: REQ-02 AC-5, §5.
- **S-15** (integration, T1) — promote из копии. Given: объекты владельца с WT-ID и с однозначным legacy-именем. When: `wolf promote` из копии. Then: оба токена → `main`, содержание не изменено.
  - Oracle: REQ-02 AC-6, §3.2.
- **S-16** (integration, T1) — promote неоднозначного legacy-имени: конфликт в отчёте, объекты не переписаны.
- **S-17** (integration, T1) — promote из main (`id === null`; наблюдение ревьюера фазы 2). Given: main-чекоут, у копии идентичность null. When: `wolf promote`. Then: множество токенов владельца пусто → честный отчёт (0 promoted, явное сообщение), объекты не изменены, процесс не падает. Derivation: design §3.2 «резолвит WorktreeIdentity текущей копии» при null-идентичности даёт пустое множество токенов; fail-closed §3.1. ⚠ Открытый вопрос к L0: точный ожидаемый exit (0 с отчётом — принято здесь); при несогласии — CR, не тихая правка.
- **S-18** (integration, T1) — новые записи получают WT-ID в scope (defaultScope при записи из копии); запись с явным `--scope` работает как раньше.
  - Oracle: REQ-02 AC-1 + §3.2 (данные не мигрируют, NFR-02).

### REQ-03 (R04) — восстанавливаемый commit мутации лица

Матрица fault injection (все — integration с seam-инъекцией, задача T2). Ожидаемые состояния — таблица §3.3 design; проверка NFR-02 (след читаем) — в каждом сценарии.

| # | Точка сбоя (после записи шага) | Состояние | Then (проверки) | Сценарий |
|---|---|---|---|---|
| F1 | `add_face` | «не применено» | candidate не выдаётся доставкой; прежняя версия active; resume → ровно одна версия; abort → candidate archived | S-20 |
| F2 | `g17_record` | «не применено» | как F1; повтор не создаёт вторую G17/версию | S-21 |
| F3 | `proposal_relation` | «не применено» | как F1 | S-22 |
| F4 | `activate` | «не применено» (activation не завершён) либо «применено, требуется след» (завершён) — различимо из журнала+store; доставка соответствует состоянию | resume доводит; повтор по opId — без второй версии | S-23 |
| F5 | `supersede_prev` | «применено, требуется восстановление следа» | новая версия полная и active, доставка выдаёт её; resume дозавершивает только след (supersede/announce/committed); окно «два активных» закрыто детерминизмом activeFace | S-24 |
| F6 | `announce` | «применено, требуется восстановление следа» | как F5 (остались supersede_prev/announce/comitted) | S-25 |
| F7 | запись `op_committed` | операционно завершена, финальное событие отсутствует | reconcile закрывает; повтор идемпотентен | S-26 |
| F8 | сбой обновления FTS-индекса | первичные данные целы (event log + объекты) | операция не считается несостоявшейся; `rebuild-index` лечит; индекс вне операционного журнала | S-27 |

Общие проверки матрицы (в каждом F-сценарии): (1) повтор с тем же `--op-id` не создаёт вторую версию вслепую (идемпотентность шагов §3.3); (2) после восстановления одна операция = одна версия с полным следом; (3) rollback/abort не уничтожает историю (NFR-02); (4) доставка не выдаёт неполный канон (REQ-03 AC-3).

- **S-28** (integration, T2) — усыновление. Given: candidate с `op_id` в extra, журнал неполон. When: resume. Then: совпадающий op_id — усыновляется; чужой/пустой op_id при незавершённой операции — конфликт в отчёт, вслепую не усыновляется.
- **S-29** (integration, T2) — авто-resume: следующая мутация того же owner_skill дозавершивает незавершённую операцию под тем же lock до старта новой (детерминированно из input).
- **S-30** (integration, T2) — doctor: `op_started` без `op_committed`/`op_aborted` → issue «неполный след мутации» с opId; abort после activation отклоняется (только вперёд, restore штатный); abort до activation → archived + op_aborted.

### REQ-04 (R05) — миграция и healing

- **S-32** (integration, T3) — сбой на каждом шаге миграции (матрица F1–F7 с command `migrate` + шаг `supersede_legacy`) + повтор `wolf face migrate`: дозавершение; завершённые владельцы не откатываются.
  - Oracle: REQ-04 AC-1.
- **S-33** (integration, T3) — детект докомпьютерного частичного перехода на РЕАЛЬНОМ формате 2.17.0: face.reason точно `` `migrated from playbook note <head.id> (2.17)` `` (anchored, с суффиксом) → healing (supersede_legacy + announce, body не пишется). Негатив: усечённый/изменённый формат НЕ матчится → конфликт/идемпотентный разбор, не healing.
  - Oracle: REQ-04 AC-1/AC-2, ADR-4 (риск «формат сломает детект» — тест фиксирует контракт).
- **S-34** (integration, T3) — неоднозначности (несколько активных head, reason не матчится, несколько лиц владельца): запись в `report.conflicts` + exit ≠ 0; записи не изменены; «успех» не объявляется по idempotent-skip частичного случая.
  - Oracle: REQ-04 AC-2.
- **S-35** (integration, T3) — изменённый пользователем объект не перезаписывается старым body: healing/resume никогда не пишут body (только переходы статусов и события).
  - Oracle: REQ-04 AC-3, §3.4.
- **S-36** (integration + doc, T3) — аудит путей изменения face: документ `face-change-paths-audit.md` существует (путь → кому разрешён → защита, все пути §7 design); негативный тест use-case-уровня: generic `transition`/`supersede`/`edit` на face-тип отклонены в use-case слое (вызов use-case напрямую, минуя CLI, → отказ).
  - Oracle: REQ-04 AC-4.

### REQ-05 (R06) — claim владения

- **S-38** (integration, T5) — два одновременных claim одного артефакта (параллельные процессы/потоки): ровно один успешен, второй — `ClaimHeldError` с идентификатором владельца.
  - Oracle: REQ-05 AC-1, ADR-5.
- **S-39** (integration, T5) — проверяемость: `wolf claim list` показывает who/when/what (artifact, owner, session, pid, cwd, acquired_at) из файла реестра, не из брифа.
  - Oracle: REQ-05 AC-2.
- **S-40** (integration, T5) — запись общего артефакта без claim отклонена на уровне use-case (вызов use-case напрямую, минуя CLI): `UserFacingError` с именем владельца и путём claim-файла.
  - Oracle: REQ-05 AC-3.
- **S-41** (integration, T5) — release только владельцем (owner+session+pid); `--transfer-to` передаёт владение явно; чужой release отклонён.
- **S-42** (integration, T5) — смерть/зависание владельца + повтор: мёртвый PID (`ESRCH`) ИЛИ возраст > TTL (24h, управляемое время в тесте) → перехват, старый файл в следе `<slug>.<epochMs>.json`; порченый claim (не JSON) → трактован stale, исходные байты сохранены в следе.
  - Oracle: §5 (отказные сценарии), NFR-02.

### REQ-06 (R08) — интеграционные проверки и сквозные сценарии

- **S-44** (integration, T7) — для каждого изменённого пути интеграционный тест на реальном хранилище/CLI: face-мутация (механизм §3.3 + обновление шаблона §3.6), scope-доставка (все ветви), claim (acquire/guard), миграция (включая healing), установка (свежая + обновление). Маппинг — соответствующие S выше; здесь фиксируется требование «реальное хранилище/CLI», не mock-файлы.
- **S-45** (e2e, T7) — сценарий 1: Стюард-мутация с G17.
  - Given: развёрнутый проект (свежая установка 2.17.1), сессия Стюарда с env-атрибуцией. When: Стюард выполняет мутацию лица по методике (tool call `wolf face new` с 7 полями G17). Then:
    1. trace содержит фактический вызов `wolf face new` (команда, аргументы, exit 0);
    2. `wolf face show steward` — новая версия с G17-записью;
    3. новое задание/процесс получает новую версию лица при доставке (tool call `wolf call`/face-выдача в trace);
    4. активное задание удерживает прежнюю версию (в границах ограничения R03 §6 требований: к следующему запуску процесса/задания — фиксируется в сценарии явно).
  - **Критерий засчитывания**: засчитывается пара «tool call + артефакт» — сохранённая запись вызова (команда+аргументы+exit) и вывод команды-проверки (face show / call), файлы в папке артефактов с revision и датой. Фраза «применяю скилл» не засчитывается.
  - Oracle: REQ-06 AC-2.
- **S-46** (e2e, T7) — сценарий 2: доставка между рабочими копиями.
  - Given: main + две копии (W1, W2). When: запись из W1 → `wolf call` в W1 / W2 / main → `wolf promote` из W1 → повторные `wolf call`. Then: в W1 доставляется; в W2 и main — нет; после promote — доставляется всем. Каждый шаг — tool call в trace + вывод команды как артефакт.
  - **Критерий засчитывания**: как S-45 (tool call + артефакт, revision, команды).
  - Oracle: REQ-06 AC-3.
- **S-47** (manual/procedure, T7) — сохранение evidence: traces и артефакты сценариев лежат в `docs/dev/2026-10-13-wolf-2-17-1-subrelease/artifacts/` (или worktree T7 → переносится при вливании) с указанием revision (SHA) и команд воспроизведения.
  - Oracle: REQ-06 AC-4.

### REQ-07 (R07) — установка и документы

- **S-49** (build, T6) — `npm run docs:build` проходит; версии в полном X.Y.Z; каталоги legacy не переименованы, ссылки живы (проверка сборки + линк-проверка Vitest/vitepress на битые ссылки).
- **S-50** (manual+doc, T6) — главная сайта и getting-started: два явных пути (память / организация OpenCode); примечание «npx try-out не пишет конфиги и базовый сет».
  - Oracle: REQ-07 AC-1.
- **S-51** (integration, T6) — каждая документированная команда-пример выполнена чисто в tmp и вывод сверен с документом (минимум: `wolf init`, `wolf init --full --platform opencode`).
  - Oracle: REQ-07 AC-2.
- **S-52** (manual, T6) — отчёт 2.17: итоговые статусы отражают завершение; журнал append-only (существующие записи не переписаны — diff); roadmap 2.17 без «ожидается» по исполненному.
  - Oracle: REQ-07 AC-3.
- **S-53** (manual, T6) — maturity-формулировки сверены с реализованным (face/rollback/proposal реализованы; council — спроектированный runtime; измеренное снижение ошибок не заявляется; восьмой тип ≠ вся система).
  - Oracle: REQ-07 AC-4.
- **S-54** (integration, T6) — sync-отчёт: в проекте с локальными мутациями `wolf sync` показывает mutated-skip/unstamped конфликты в тексте отчёта; статус этих объектов НЕ «updated».
  - Oracle: REQ-07 AC-7.
- **S-55** (integration, T6) — установка/обновление доставляют эталон R2-02: свежая установка в tmp и обновление копии 2.16.3/2.17.0 → состав профилей/скиллов = `templates/base/**`; frontmatter режимов Task-агентов установленных `.opencode/agent/*.md` = эталону раздела R2-02 (6 агентов, mode/description/permission).
  - Oracle: REQ-07 AC-6.

### NFR

- **NFR-01 (R02)** → S-10, S-13, S-16: regression-набор legacy-инъекций (своя видит, чужие нет; конфликт отчётом, не молча); записи не переписываются (S-18).
- **NFR-02 (R04/R05/R07)** → встроено в матрицу F1–F8 (после каждого сценария восстановления полный след читаем: версии, supersede-цепочки, события), S-30 (abort = archived), S-42 (claim-перехват сохраняет старую запись), S-52 (append-only журнал 2.17).
- **NFR-03 (R02)** → doc-тест (T6): страница/раздел «изоляция чтения» существует, список = замороженному списку design §6 (изолирован `wolf call` CLI+MCP все режимы; остальное — вся память); автотест: состав изолированных путей в коде соответствует списку (нет нового изолированного типа без изменения требований). Oracle: NFR-03 AC + §6.

## Прогоны

- Точечные (по задачам): `npx vitest run <путь к файлам задачи>` — T1…T6.
- Интеграционные/e2e: `npx vitest run <integration-набор>` (T7) + ручные e2e-сценарии S-45/S-46 по процедурам T7.
- Полный гейт (обязателен для пакета приёмки, финальная интеграция T7): `npm run check`.
- Доки: `npm run docs:build` (T6, T7).
- Evidence: для каждого прогона — команда, cwd, revision (SHA), exit-код, путь к логу/артефакту (контракт EVIDENCE).
- Изоляция: свежие проекты — tmp; копии для S-10…S-18 — `git worktree add` во временных каталогах; TTL-тесты — управляемое время; следы тестов не пишут в реальную память площадки.

## Карта покрытия

| REQ/NFR | Сценарии | Задача |
| --- | --- | --- |
| REQ-01 (R01) | S-01…S-08 | T4 |
| REQ-02 (R02) | S-10…S-18 | T1 |
| NFR-01 (R02) | S-10, S-13, S-16, S-18 | T1 |
| REQ-03 (R04) | S-20…S-30 (матрица F1–F8) | T2 |
| REQ-04 (R05) | S-32…S-36 | T3 |
| REQ-05 (R06) | S-38…S-42 | T5 |
| REQ-06 (R08) | S-44…S-47 | T7 |
| REQ-07 (R07) | S-49…S-55 | T6 |
| NFR-02 (R04/R05/R07) | F1–F8, S-30, S-42, S-52 | T2/T5/T6 |
| NFR-03 (R02) | doc-тест раздела NFR | T6 |
| Сквозной гейт | полный `npm run check` + e2e S-45/S-46 | T7 |
