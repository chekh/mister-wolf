# Task Brief — REVIEW-001, итерация orch-1

## Metadata
- Задача: REVIEW-001 / orch-1
- Тип: итеративное ревью спецификации с изоляцией перспектив
- Исполнитель: executor-author
- Рабочий каталог: `review-task/orch-1/`
- Корень проекта: `/Users/chekh/Development/RestAdviser/ZetaFlow/wolf-experiment`

## Task

Исходная спека: `review-task/orch-1/spec-v0.md` (1043 строки).
Код-референс: `review-task/orch-1/code-ref/` — **read-only**.

Выполнить РОВНО 3 раунда ревью.

### Раунд N (N = 1, 2, 3)

1. Спавнить тулом `task` ревьюера по перспективе:
   - N=1 → `executor-reviewer-security`
   - N=2 → `executor-reviewer-completeness`
   - N=3 → `executor-reviewer-consistency`
   
   Промпт ревьюеру должен содержать:
   - путь к текущей версии спеки: `review-task/orch-1/spec-v(N-1).md`;
   - для раунда консистентности (N=3) — также путь к `review-task/orch-1/code-ref/`;
   - требование формата вывода:
     - таблица `| ID | Severity (critical/major/minor) | Раздел | Проблема | Предложение |`
     - строка `SUMMARY: X critical / Y major / Z minor`.

2. Сохранить вывод ревьюера **дословно** в `review-task/orch-1/issues/round-N.md`.

3. Применить обоснованные замечания точечными правками к спеке →
   `review-task/orch-1/spec-vN.md`. Спорные замечания отклонять с указанием
   причины (фиксировать в отчёте).

### Отчёт автора

По каждому раунду: найдено / применено (critical/major/minor), главные
изменения, отклонённые замечания с причинами. Отчёт сохранить в
`executor/report-review-orch-1.md` и вернуть краткий статус (2–5 строк).

## Acceptance Criteria

- Существуют файлы `review-task/orch-1/issues/round-1.md`, `round-2.md`, `round-3.md`
  (дословные выводы ревьюеров, с таблицей и SUMMARY-строкой).
- Существуют файлы `review-task/orch-1/spec-v1.md`, `spec-v2.md`, `spec-v3.md`.
- Ровно 3 раунда, перспективы в порядке: security → completeness → consistency.
- Формат таблиц и SUMMARY-строк соблюдён.

## Constraints

- `spec-v0.md` и `code-ref/` — не изменять (read-only).
- Ничего не удалять из спеки; структуру и язык (русский) сохранять.
- Только точечные правки по замечаниям; рефакторинг «для красоты» запрещён.
- Не выходить за пределы каталога `wolf-experiment/`.
