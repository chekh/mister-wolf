# Concept v2 Publication Report

**Date:** 2026-05-05
**Scope:** Publication Pass для Concept v2

---

## Созданные файлы

| Файл | Описание |
|------|----------|
| `docs/concept-v2.md` | Основной документ Concept v2. Editorial copy of `scenario-lab/generated/concept-v2-draft-final-candidate.md`. |
| `docs/concept-v2-open-questions.md` | 5 открытых вопросов с MVP assumptions, обоснованием defer и trigger для revisit. |
| `docs/concept-v2-summary.md` | Краткий индекс: что такое Wolf, 10 key decisions, ссылки на документы. |
| `scenario-lab/generated/concept-v2-publication-report.md` | Этот отчёт. |

## Обновлённые файлы

| Файл | Изменения |
|------|----------|
| `README.md` | Добавлена ссылка на `docs/concept-v2.md` в разделе Documentation. Добавлена короткая строка: «Concept v2 describes Mr. Wolf as an agentic control plane with artifact-first execution and policy-governed capabilities.» |

## Смысловые правки, которые НЕ делались

- Структура секций (§1–§17) сохранена без изменений.
- Терминология, enum values, technical keys оставлены на английском.
- Архитектурные решения (MVP Boundary, PolicyCore scope, hard-deny rules, artifact model) не изменены.
- Artifact chains, execution classification, conversation mode — все оригинальные формулировки сохранены.
- Evidence counts, scenario references, design decisions — без изменений.
- Не добавлены новые концепты, не описанные в final candidate.

## Редакционные правки, которые применены

- `docs/concept-v2.md`: заголовок изменён с «Concept v2 Draft (Final Candidate)» на «Concept v2».
- `docs/concept-v2.md`: статус изменён на «Concept v2 / Final Candidate».
- `README.md`: минимальное обновление (ссылка + строка описания).

## Open questions, вынесенные в отдельный документ

1. **ArtifactStore for Source Artifacts** — отдельный RepositoryArtifactStore vs foreign key в основном ArtifactStore.
2. **ExecutionArtifact vs TraceEvent threshold** — heuristic для MVP, formal decision tree deferred.
3. **Conversation promotion detection** — explicit user signal для MVP, intent classification deferred.
4. **SessionTrace retention** — session-scoped для MVP, long-term deferred.
5. **Domain-specific receipt taxonomy** — domain pack level для MVP, controlled vocabulary deferred.

## Подтверждения

| Проверка | Статус |
|----------|--------|
| Roadmap не добавлен | ✅ Подтверждаю |
| JSONL source of truth не изменён | ✅ Подтверждаю |
| Scenario Lab data (generated/*) не изменена, кроме publication report | ✅ Подтверждаю |
| Schemas/templates/vocabularies не изменены | ✅ Подтверждаю |
| Новые Scenario Cards не созданы | ✅ Подтверждаю |
| Новые архитектурные решения не добавлены | ✅ Подтверждаю |

---

*Report generated after Concept v2 Publication Pass.*
