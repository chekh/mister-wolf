---
slug: patch-2-32-2-expert-read-channel
title: patch-2-32-2-expert-read-channel — план
status: draft
created: 2026-11-06
baseline: 96b943ce75ae674c88c34bfe99a1265639283d52
---

# patch-2-32-2-expert-read-channel — план

FIX-профиль: требования и журнал CR — `requirements.md`. База — main
`96b943ce75ae674c88c34bfe99a1265639283d52`; версия остаётся 2.32.1 (подъём
версии, CHANGELOG, merge, тег, npm и сайт — отдельный срез релиза).

## Задачи

- [x] Z01: выдать эксперту рабочий read-канал в границах проекта —
      requirements REQ-01/REQ-02, `templates/base/agents/worker-expert.md:5`.
      Сделано → `7a1be16f`. Мёртвое `read packet/*` (каталога `packet/` нет ни в
      одном проекте) заменено `read *` + `glob`/`grep` allow; deny на
      `edit`/`shell`/`subagent`/`webfetch`/`websearch`/`browser`/`skill` и
      `external_directory` сохранён; `*.env` / `*.env.*` ask-правила стоят ПОСЛЕ
      широкого allow (резолвер last-match-wins — порядок и есть защита).
      Проверено живой пробой, не текстом (см. AC-сводку ниже).
- [x] Z02: обязательная функциональная проба канала в методике консилиума —
      REQ-03, `templates/base/skills/wolf-council/SKILL.md:35`.
      Сделано → `7a1be16f`, уточнено в правке по ревью.
      Проба отдельная от аудита ссылок; успех — только факт содержимого;
      `permission.rejected`/нет tool-вызова/`NEEDS_CONTEXT`/`LIMITS` = канал не
      tool-enabled; явно сказано, что перечень путей в TASK выдачей не является.
- [x] Z03: признак `channel` в профиле expert и обязательность
      `isolation_limits` при `channel != tool-enabled` — REQ-04,
      `templates/base/skills/using-skills/references/contracts.md:80`,
      `src/app/use-cases/record-council.ts:50`.
      Сделано → `7a1be16f`. `channel` — опциональное аддитивное поле opinion-payload;
      историческая v2-схема и `question_revision` не тронуты, миграций нет.
- [x] Z04: живое лицо worker-expert → v2 и согласование seed-шаблона — REQ-05,
      `templates/base/playbooks/worker-expert-playbook.md:1`.
      Сделано → `wolf face new worker-expert` (`WOLF_ACTOR=agent:steward`, G17),
      операция `faceop-1793993639650-7be5`; v2 `mem_20261106_worker-expert-v2_31d77f`.
      Другие лица не тронуты (`mr-wolf` v4, `steward` v3, `executor-lead` v3 и
      воркеры — прежние версии).
- [x] Z05: правка по независимому ревью — честная граница чтения —
      REQ-02 (уточнение), правка рамки, методики, seed-шаблона, документации.
      Сделано → живое лицо поднято до v3 `mem_20261106_worker-expert-v3_c87026`
      (операция `faceop-1793998979687-06c4`). Ревью доказало, что host НЕ
      разрешает symlink при проверке `external_directory`: ссылка внутри проекта,
      ведущая наружу, читалась как внутренний путь. Правило «ни одной ссылки»
      (прежняя формулировка) неприменимо — в любом Node-проекте есть ссылки
      `node_modules/.bin`; заменено на проверку разрешения наружу.
- [x] Z10: правка по переревью — целостность рендера и уточнение границы.
      Переревью нашло блокер, внесённый прогоном prettier по `templates/`:
      `model: {{model.primary}}` превратился в `model: { { model.primary } }`,
      YAML читал это как объект, OpenCode выбрасывал агента из каталога
      («Agent not found: worker-expert»), и ни один гейт этого не ловил —
      существующие тесты рендера используют синтетические строки.
      Сделано: шаблоны восстановлены из `73438250` и правки применены заново
      БЕЗ prettier (он не покрывает `templates/` в `format:check` и портит
      Go-подобные плейсхолдеры); добавлен
      `tests/unit/render-integrity-real-templates.test.ts` — рендерит РЕАЛЬНЫЕ
      шаблоны тем же `substitute()`, что и поставка, в omit/model/no-context
      режимах и требует `model` строкой без плейсхолдеров; проверено, что тест
      краснеет именно на испорченном плейсхолдере (3 падения).
      Также: снята неоднозначность «`external_directory` запрещает вне проекта
      (Location и main-чекоут)» — прямой доступ в main-чекоут отклоняется, он
      входит только в сравнение при аудите ссылок; добавлено, что аудит точечный
      (host не перепроверяет ссылки на каждом чтении); индентация списков в
      `SKILL.md`/`contracts.md` восстановлена; seed-заголовок сделан
      версионно-нейтральным, чтобы не отставать от живого лица;
      живое лицо поднято до v4 `mem_20261106_worker-expert-v4_80d791`
      (операция `faceop-1794001444773-e36c`).
- [x] Z06: перерендер проектного base-set и карта обновления — REQ-06.
      Сделано → `.opencode/agents/worker-expert.md` содержит новые права;
      `update-map.json` помечает 4 файла как `changed`; `--verify` проходит.
- [x] Z07: документация EN/RU — REQ-07. `docs/site/guide/council.md` +
      RU-пара (канал по умолчанию, деградация, проба, `channel`, граница из двух
      половин), `base-set.md` + RU (строка `worker-expert` и
      `worker-expert-playbook`), `troubleshooting.md` + RU (симптом «эксперт не
      может прочитать код» + аудит ссылок), README-пара. Generated-страницы
      (CLI reference, changelog) вручную не правились.
- [x] Z08: тесты — `tests/unit/worker-expert-channel.test.ts` (18 проверок:
      профиль, права по last-match-wins, env-порядок, проба канала, честная
      граница, отсутствие устаревших утверждений в документации) и блок
      `channel` в `tests/unit/council-record.test.ts` (опциональность,
      обратная совместимость, `question_revision` не меняется, идемпотентность).
      Проверено, что тесты — настоящие гарды: откат шаблонов даёт 10 падений,
      откат `record-council.ts` — 2.
- [x] Z09: заполнение FIX-пакета — `requirements.md` (REQ-01…REQ-07 с AC,
      журнал CR) и этот `plan.md` с разделом «Документация и сайт».

## Сводка REQ/AC

| AC                                                            | Статус      | Evidence                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01.1 эффективные allow read/glob/grep                      | подтверждён | `opencode debug agents` в worktree: `read src/…`→allow, `glob *`→allow, `grep *`→allow (23 правила, last-match-wins)                                                                                                                                           |
| AC-01.2 живая проба с фактом содержимого                      | подтверждён | `worker-expert` прочитал `src/domain/face-body.ts` и вернул дословно `export function parseFaceDocument(raw: string): { meta: Record<string, string>; body: string } {`; в ответе `channel: tool-enabled`                                                      |
| AC-01.3 выдача в базовом наборе, не в project-local           | подтверждён | `wolf init --full` в чистый каталог: доставленный `.opencode/agents/worker-expert.md` несёт read-правило; проба в этом проекте вернула маркер содержимого `PROBE_MARKER_LINE_42`                                                                               |
| AC-02.1 deny на запись/shell/субагентов/сеть/внешние каталоги | подтверждён | `opencode debug agents`: `edit`/`shell`/`subagent`/`webfetch`/`websearch`/`browser`/`skill`/`external_directory` → deny                                                                                                                                        |
| AC-02.2 живая проба запретов                                  | подтверждён | инструменты записи/shell/субагентов отсутствуют в наборе сессии; чтение `/Users/chekh/.zshrc` → `Permission denied: external_directory`                                                                                                                        |
| AC-02.3 env-guard после широкого allow                        | подтверждён | `.env.probe-guard` и `sub.env`: `permission.rejected` от ask-защиты, маркер в ответе отсутствует (0 вхождений); `.env.example` → allow                                                                                                                         |
| AC-03.1 проба = факт содержимого                              | подтверждён | текст `wolf-council/SKILL.md`, шаг 2 «Функциональная проба канала»                                                                                                                                                                                             |
| AC-03.2 аудит и проба — разные проверки                       | подтверждён | `SKILL.md`: «Аудит ссылок доказывает изоляцию, но не работоспособность чтения, и наоборот»                                                                                                                                                                     |
| AC-03.3 «перечень путей в TASK не выдача»                     | подтверждён | `SKILL.md:43`                                                                                                                                                                                                                                                  |
| AC-04.1 channel в контрактах, статусы RESULT не меняются      | подтверждён | `contracts.md`, профиль expert                                                                                                                                                                                                                                 |
| AC-04.2 channel аддитивен, исторические envelope валидны      | подтверждён | `tests/unit/council-record.test.ts`: исторический envelope без `channel` принимается; `question_revision` не зависит от payload мнения                                                                                                                         |
| AC-05.1 живое лицо поднято, другие не тронуты                 | подтверждён | `wolf face history worker-expert`: v1/v2/v3 superseded, v4 active; `wolf face list`: остальные лица — прежние версии                                                                                                                                           |
| AC-05.2 seed согласован                                       | подтверждён | `templates/base/playbooks/worker-expert-playbook.md` = тело v4 по смыслу; заголовок версионно-нейтрален, чтобы не отставать при следующем подъёме                                                                                                              |
| Целостность рендера реальных шаблонов                         | подтверждён | `tests/unit/render-integrity-real-templates.test.ts`: omit/model/no-context режимы; краснеет на испорченном плейсхолдере (3 падения), зелёный на исправленном; fresh `wolf init --full` → `model: company/fast` строкой, агент виден в `opencode debug agents` |
| AC-06.1 проектный рендер содержит новые права                 | подтверждён | `.opencode/agents/worker-expert.md:6-…`; тело совпадает с шаблоном (различие — только штамп и опущенная `model:`)                                                                                                                                              |
| AC-06.2 update-map помечает changed, `--verify`               | подтверждён | `node scripts/generate-update-map.mjs --verify` → «in sync (61 file targets, 7 faces, prev 2.32.0)»; 4 файла `changed`                                                                                                                                         |
| AC-07.1…07.4 документация EN/RU                               | подтверждён | `docs/site/{,ru/}guide/{council,base-set,troubleshooting}.md`, README-пара; `docs:check` — 5765 ссылок, 35 EN/RU-пар, OK                                                                                                                                       |
| Гейты                                                         | подтверждён | `npm run check` 232 файла / 2210 тестов; `npm run e2e` 63 файла / 248; `docs:check`; `wolf doctor`; `--verify`                                                                                                                                                 |

## Непроверенное (честный перечень)

- **Граница по symlink остаётся процедурной, а не технической.** Host не
  разрешает ссылки при проверке `external_directory` — это подтверждено
  (ссылка внутри проекта, ведущая наружу, читается как внутренний путь). Поэтому
  изоляция держится на аудите ссылок перед запуском, а не на permission-слое.
  Аудит точечный: ссылка, появившаяся ПОСЛЕ аудита, технически не блокируется.
  Это прямо сказано в рамке профиля (`worker-expert.md`: «host не перепроверяет
  ссылки на каждом чтении»), в методике (`wolf-council/SKILL.md`, шаг 1) и в
  документации (`council.md` EN/RU).
- **Интерактивный режим ask-защиты** не проверялся: пробы шли non-interactive,
  где `ask` автоматически отклоняется. В интерактивной сессии платформа
  спросит пользователя — это её документированное поведение.
- **Другие хосты** (не OpenCode v2.2.5) не проверялись: выдача и резолвер прав
  специфичны для harness, методика требует проверять канал фактически.
- **MCP-путь `council_record`** с полем `channel` не прогонялся end-to-end;
  схема общая с CLI-путём (`recordCouncil`), поэтому поведение expected
  идентичным, но это вывод, а не проба.
- **Подъём парка проектов** (`wolf upgrade` по всем проектам) не выполнялся —
  отдельное решение владельца после публикации.
- **Версия не поднималась**, CHANGELOG не обновлялся, merge/тег/npm/сайт не
  выполнялись: это отдельный срез релиза.
- **Широкий read-allow расширяет доступ не только к `.env`.** Секрет-файлы,
  которые не матчатся правилами `*.env`/`*.env.*` (`.envrc`, `.npmrc`,
  `.git-credentials`, `*.pem`, приватные ключи), теперь читаемы внутри проекта.
  Найдено независимым ревью (MINOR-1). Это следствие решения владельца «read в
  границах проекта», а не дефект реализации: REQ-02 покрывает env-файлы, и
  AC-02.3 выполнен. Расширение списка секрет-шаблонов — отдельное решение
  владельца о продуктовой границе, в scope 2.32.2 не входит.
- **`docs/dev/INDEX.md` получил +3 строки** (MINOR-2): запись этого фикса и
  бэкфилл двух прошлых волн (`bounded-assignments`, `council`), которых в
  индексе не было. Генерируется штатным `wolf sync`; не входит в inventory
  изменений фикса, вреда нет.

## Документация и сайт

- [x] `docs/site/guide/council.md` + `docs/site/ru/guide/council.md` — канал
      эксперта по умолчанию (чтение в границах проекта), две половины границы
      (путь + разрешение ссылок), packet-only как осознанная деградация,
      функциональная проба канала, поле `channel`, обязательный `isolation_limits`.
- [x] `docs/site/guide/base-set.md` + `docs/site/ru/guide/base-set.md` — строки
      `worker-expert` (агенты) и `worker-expert-playbook` (лица) по новому поведению.
- [x] `docs/site/guide/troubleshooting.md` + RU — пункт 21 «эксперт не может
      прочитать код»: права выдаёт профиль агента, а не текст TASK; проверка
      через `opencode debug agents`; функциональная проба; отдельный аудит ссылок.
- [x] `README.md` + `README.ru.md` — обещание про роль согласовано с новым
      поведением (read-only канал в границах проекта вместо packet-only).
- [x] `docs/site/guide/read-isolation.md` — НЕ менялся: это замороженный контракт
      про worktree-скоуп памяти (`wolf call`), а не про доступ эксперта к файлам;
      смешивать их было бы неверно.
- [x] Generated-страницы (`docs/reference/cli.md`,
      `docs/site/guide/cli/command-reference.md`, changelog-страницы) вручную не
      правились — пересобираются `npm run docs:build`; diff по ним пуст.
- [x] `docs:check` зелёный: CLI reference и changelog синхронизированы
      генераторами, ссылки и EN/RU-пары целы.

### Полный релизный чек-лист (для отдельного среза)

Версия сейчас 2.32.1 — по поручению не поднимается. Для выпуска 2.32.2
исполнителю среза нужно:

- [ ] `npm version 2.32.2` (единственный источник версии — `package.json`)
- [ ] запись в `CHANGELOG.md` по правилам проекта (2.32.2, раздел Changed)
- [ ] `node scripts/generate-update-map.mjs` после подъёма версии, затем `--verify`
- [ ] `env -u WOLF_SESSION npm run check` (иначе 15 pre-existing face-тестов
      падают из-за признака агент-сессии `WOLF_SESSION=opc-*` — не связано с фиксом)
- [ ] **не прогонять prettier по `templates/`**: `format:check` его не покрывает,
      а prettier превращает `{{model.primary}}` в `{ { model.primary } }`, после
      чего OpenCode выбрасывает агента («Agent not found»). Гард —
      `tests/unit/render-integrity-real-templates.test.ts`
- [ ] после `npm version` и перед публикацией: fresh `wolf init --full` в чистый
      каталог + `opencode debug agents` — все 7 агентов видны, `worker-expert`
      присутствует, `model` строкой
- [ ] `npm run e2e`, `npm run docs:check`, `npm run docs:build`, `wolf doctor`
- [ ] merge `--no-ff` в `main`, тег `v2.32.2` на merge-коммите, push
- [ ] `npm publish`, GitHub Release, деплой сайта
- [ ] проверить changelog-страницу сайта после публикации
- [ ] отдельным решением владельца — `wolf upgrade` по парку проектов
- [ ] уборка: удалить worktree `.worktrees/patch-2-32-2-expert-read-channel`
      после подтверждённой сохранности (`git merge-base --is-ancestor`)
