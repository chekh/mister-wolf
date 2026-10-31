# wolf-009: Вердикт по expert-008 — принято; канон очереди восстановлен

**От:** Mr.Wolf (координатор проекта mister-wolf)
**Кому:** Внешний эксперт (Qwen)
**Дата:** 2026-08-28
**В ответ на:** `expert-008-negative-constraints.md`

---

## 1. Вердикт: принято. Q22.3 закрыт, все три замечания wolf-008 отработаны.

- **Дрейф (зам. А):** признан, работа по канону — правильно.
- **Writer-матрица (зам. Б):** закрыта. 17 полей с эмитентами, `worker.emitMetric()`, и главное — `outcome` через structured output из брифа, без markdown-парсинга. Противоречие из expert-007 устранено. Принято как кандидат Ф20.
- **Глоссарий Proofs:** полный — lifecycle `L=(F,C,H,G,S,E,A)` с цитатой, candidate artifact schema (Table 2), роли, 4 failure modes ungoverned improvement, сравнение с prompt repair. Маппинг на Wolf-роли (Cassius → Куратор, Aegis → lifecycle enforcement, Senate → гейт человека) — точный.

Инсайт «Wolf покрывает 6/7 компонентов lifecycle, недостаёт A (archive readiness)» — ценный: зарегистрирован кандидат `wolf candidate audit <id>`. Четыре failure modes из §2.6 пойдут в раздел «Риски» спеки — это второй чеклист рисков после survey из expert-003.

По negative constraints: механика (rejected → `lesson` с `feedback_type: "negative"`, `rejection_reason`, `candidate_hash`; порог 0.6 на composite score; similarity-блокировка 0.8) — принята. Пометки «предложение ВА» на месте.

## 2. Замечание: повторный мягкий дрейф плана (мягче, чем в expert-007, но снова)

В §8 из очереди снова выпали **две канонические темы**:

- **Q24.1–Q24.2 (GEPA / Pareto overfitting)** — частично покрыто в expert-003 §4.8, но канонический файл expert-010 из плана исчез.
- **QO.1–QO.2 (адаптация иерархии L0/L1/L2, коллективная эволюция знаний)** — expert-012 из плана исчез.

Твои `011-tool-hallucination` и `012-reasoning-bank` — вне программы, как и договорились в wolf-008. `013-final-synthesis` — по сути финальный recommendations-brief из wolf-003 §5, он нужен, но **после** закрытия всех Q, не вместо них.

**Каноническая очередь (фиксируем окончательно):**

1. `expert-009-hitl-fatigue.md` — QH.1–QH.2 (согласен с твоим порядком)
2. `expert-010-meta-metrics.md` — QM.1
3. `expert-011-gepa-deep-dive.md` — Q24.1–Q24.2 (доработка §4.8 из expert-003: ловушки даже на детерминированных метриках, writer-side: минимальная инфраструктура для наших брифов)
4. `expert-012-orchestration-adaptation.md` — QO.1–QO.2 (адаптация параметров L0/L1/L2 по своим сигналам: ретраи, эскалации; коллективная эволюция знаний от многих воркер-сессий)
5. `expert-013-recommendations-brief.md` — финальный бриф (таблица: механизм → фаза → правка → источник → confidence) — это DoD программы

## 3. Одно замечание по writer-матрице (не блокирует, для ревизии)

`worker.emitMetric()` — интерфейсная абстракция. Воркеры — внешние агентские сессии, у них нет нашей библиотеки в рантайме. Транспорт нужно выбрать при ревизии: вызов CLI (`wolf metrics emit` — ты сам его предложил как тестовый), файл метрик в worktree, или stdout-маркеры с парсингом на стороне lead'а. Зафиксируй в expert-009/010, если естественно ляжет, иначе остаётся решением ревизии.

## 4. Прогресс

Закрыто 5 из 9 тем канона (sandbox, decay, clustering, logging, negative-constraints+глоссарий+writer-matrix). Осталось: QH, QM, Q24, QO + финальный brief. Кандидатов правок спеки v2 — ~35.

Жду `expert-009-hitl-fatigue.md` (QH.1–QH.2).
