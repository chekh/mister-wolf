---
slug: b05-git-inspect
title: B0.5 — read-only git inspect — дизайн
status: draft
created: 2026-11-03
---

# B0.5 — read-only git inspect — дизайн

## Глоссарий

- **GitRunner** — порт запуска git: `(args: string[], opts: {cwd, timeoutMs?}) => {code, stdout, stderr}`; реализация `execFile('git', …)` без shell.
- **Факт-поле** — поле JSON-вывода со значением из одного наблюдения; **observation** — способ+время получения (для remote-знаний).
- **Живое наблюдение** — `git ls-remote <remote> <ref>` с таймаутом; **tracking-ref** — локальная upstream-ссылка (`refs/remotes/…`), может устареть.

## Компоненты и ответственность

- `src/app/use-cases/git-inspect.ts` — весь смысл среза. `collectGitFacts(deps, opts)` собирает факты; `computeVerdict(facts)` — чистая функция вердикта/reasons/actions; тип `GitInspectReport`. Ввод-вывод git только через внедрённый GitRunner и `fs`-зависимость (проверка незавершённых операций по `.git`-файлам).
- `src/adapters/cli/commands/git-inspect.ts` — commander-обвязка: опции `--baseline/--target/--owner`, печать JSON, exit-код по вердикту. Паттерн — как `src/adapters/cli/commands/memory-scan.ts`.
- `src/adapters/cli/cli-entry.ts` — регистрация `git-inspect` ленивым импортом (паттерн строк ~100–160).
- `templates/base/skills/wolf-git/SKILL.md` — §G0 ссылается на команду; §«Что не поставлено» — правка по REQ-06.
- Тесты: `tests/unit/use-cases/git-inspect.test.ts` (логика на фейковом раннере), `tests/e2e/git-inspect.e2e.ts` (реальные временные репозитории + собранный CLI, хелперы `tests/e2e/helpers.js`).

## Контракты

`GitInspectReport` (JSON в stdout, ключи — английские, `schema_version: 1`):

```
{ schema_version, verdict: 'PASS'|'VIOLATION'|'UNKNOWN', observed_at: ISO,
  repository: { root, is_bare, origin_url_sanitized|null },
  worktree: { path, kind: 'main'|'linked' },
  branch: string|null,            // null = detached HEAD
  head: sha|null,
  baseline: { sha, relationship: 'equal'|'ancestor-of-head'|'diverged'|'unresolved' }|null,
  target: string|null,            // как задан входом
  dirty: { value: bool, entries: n },   // git status --porcelain
  unfinished_git_operation: 'merge'|'rebase'|'cherry-pick'|'revert'|null,
  local_vs_remote: {
    upstream: ref|null, remote: name|null,
    relation: 'in-sync'|'ahead'|'behind'|'diverged'|'remote-ahead-unfetched'|'no-remote'|'no-upstream',
    ahead: n|null, behind: n|null, remote_head: sha|null },
  branch_owner: string|null,      // только из --owner
  freshness_of_remote_observation: { observed_at: ISO|null, method: 'ls-remote'|'tracking-ref'|'none', reachable: bool|null },
  reasons: string[],              // по одной на проверку: что проверено + исход
  allowed_next_actions: string[] }
```

Сбор фактов (все вызовы только читающие): `rev-parse --show-toplevel/--git-dir/HEAD`, `branch --show-current`, `status --porcelain`, `worktree list --porcelain`, `remote -v` (санитизация NFR-01), `merge-base --is-ancestor`, `rev-list --left-right --count`, `ls-remote` (таймаут NFR-02). Незавершённые операции — наличие `MERGE_HEAD|rebase-merge|rebase-apply|CHERRY_PICK_HEAD|REVERT_HEAD` в `--git-dir`.

Таблица решений вердикта (детерминированная, порядок — сверху вниз, первое сработавшее определяет компонент):

| Условие                                                                         | Компонент                                             |
| ------------------------------------------------------------------------------- | ----------------------------------------------------- |
| не репозиторий / git-команда упала                                              | UNKNOWN                                               |
| remote/upstream существует, но ls-remote недоступен                             | UNKNOWN (reason «remote unreachable»)                 |
| `dirty.value = true`                                                            | VIOLATION                                             |
| `unfinished_git_operation ≠ null`                                               | VIOLATION                                             |
| `baseline.diverged` (baseline не предок HEAD и не сам HEAD)                     | VIOLATION                                             |
| `relation = diverged \| behind \| remote-ahead-unfetched`                       | VIOLATION                                             |
| `relation = ahead`                                                              | PASS + reason «unpublished commits present»           |
| `relation = no-remote`/`no-upstream` и входы не требуют remote                  | PASS + reason «not applicable»                        |
| `relation = no-remote`/`no-upstream`, но вход требует remote (`--target` задан) | UNKNOWN — наблюдение требуется, а невыполнимо (ADR-4) |
| иначе (in-sync, всё проверено)                                                  | PASS                                                  |

`allowed_next_actions` выводятся из фактов той же таблицей (например: dirty → `commit or discard changes before handoff (if authorized)`; unreachable → `verify network/remote access; do not assume clean`; ahead → `publish if authorized`; PASS → `read-only observation complete; no git action required`).

## ADR-карточки

- **ADR-1 (branch_owner).** Контекст: roadmap «если владелец известен Wolf»; команда обязана быть переносимой и не читать память Wolf. Решение: `branch_owner` только из `--owner`, иначе `null`. Последствия: знание Wolf передаёт вызывающий агент (L1/B0), второй сборщик не создаётся.
- **ADR-2 (наблюдение remote без fetch).** Контекст: refs менять нельзя, а «позади» без fetch иногда несчётно. Решение: живое `ls-remote` с таймаутом; сравнение SHA и локальная ancestry; если remote-SHA отсутствует в локальном объектном хранилище — `remote-ahead-unfetched`, счёт `null`. Последствия: честный UNKNOWN/VIOLATION вместо выдуманных чисел.
- **ADR-3 (exit-коды).** 0/1/2 = PASS/VIOLATION/UNKNOWN: UNKNOWN не возвращает 0 — скрипты не примут «не удалось проверить» за успех. Совместимо с обычаями CLI (0 = успех).
- **ADR-4 (unknown-политика remote).** Remote не настроен/нет upstream → проверка неприменима (PASS не блокирует); настроен, но недоступен → UNKNOWN. Основание: B0 §6.5 — «не удалось проверить» ≠ успех только там, где наблюдение требуется.
- **ADR-5 (единый сборщик).** Модуль — первый и единственный структурный сборщик; wolf-git/B0 и L1 ссылаются на вывод, собственных не заводят. Проверка: текст скилла (REQ-06).

## Ссылки на NFR

- NFR-01 (секреты): санитизация URL в `collectGitFacts`; unit-проверка.
- NFR-02 (время): таймаут 10 c в GitRunner-реализации `ls-remote`; unit-проверка фейком; e2e недоступности — несуществующий remote-URL без реальной сети.
- NFR-03 (совместимость/стиль): только plumbing/porcelain git ≥ 2.30; english-surface — строки команды/вывода английские.
