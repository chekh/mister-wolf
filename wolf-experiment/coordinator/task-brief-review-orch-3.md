# Task Brief: REVIEW-001, итерация orch-3

## Metadata

- **ID**: REVIEW-001 / orch-3
- **Тип**: итеративное ревью спецификации с изоляцией перспектив
- **Исполнитель**: executor-author
- **Корень проекта**: `/Users/chekh/Development/RestAdviser/ZetaFlow/wolf-experiment`
- **Рабочий каталог**: `review-task/orch-3/`
- **Исходная спека**: `review-task/orch-3/spec-v0.md` (1043 строки) — read-only
- **Код-референс**: `review-task/orch-3/code-ref/` — read-only

## Task

Выполнить РОВНО 3 раунда ревью. Каждый раунд N (N = 1, 2, 3):

1. **Спавн ревьюера** тулом `task` (один ревьюер на раунд, по одному):
   - N=1 → `executor-reviewer-security`
   - N=2 → `executor-reviewer-completeness`
   - N=3 → `executor-reviewer-consistency`
   
   Промпт ревьюеру должен содержать:
   - путь к текущей версии спеки `review-task/orch-3/spec-v(N-1).md`;
   - для консистентности (N=3) — также путь к `review-task/orch-3/code-ref/`;
   - требование формата вывода: таблица
     `| ID | Severity(critical/major/minor) | Раздел | Проблема | Предложение |`
     + строка `SUMMARY: X critical / Y major / Z minor`.
2. **Сохранить вывод ревьюера дословно** в `review-task/orch-3/issues/round-N.md`.
3. **Применить обоснованные замечания** точечными правками к спеке → создать
   `review-task/orch-3/spec-vN.md` (полная новая версия файла). Спорные
   замечания отклонять с указанием причины (фиксировать в отчёте).

## Acceptance Criteria

- [ ] Существуют `issues/round-1.md`, `issues/round-2.md`, `issues/round-3.md` —
  каждый содержит таблицу с колонками ID/Severity/Раздел/Проблема/Предложение
  и строку `SUMMARY: X critical / Y major / Z minor`.
- [ ] Существуют `spec-v1.md`, `spec-v2.md`, `spec-v3.md` — полные версии спеки,
  структура и язык исходной спеки сохранены.
- [ ] Раунды выполнены строго в порядке security → completeness → consistency,
  ревьюер раунда N получал spec-v(N-1).md.
- [ ] `spec-v0.md` и `code-ref/` не изменены.

## Constraints

- `spec-v0.md` и весь `code-ref/` — НЕ трогать (read-only).
- Ничего не удалять: ни замечания, ни разделы спеки без замены.
- Структуру, нумерацию разделов и язык спеки сохранять.
- Правки — только точечные, по обоснованным замечаниям; спорные отклонять
  с причиной.
- Не выходить за пределы `review-task/orch-3/`.

## Отчёт автора (вернуть wolf'у)

- По каждому раунду: найдено / применено (critical/major/minor), сколько
  отклонено и почему (кратко).
- Главные изменения в спеке после всех раундов.
- Путь к файлам результатов.
