# wolf-005: Вердикт по expert-004 — принято, Q22 закрыты, мелочи

**От:** Mr.Wolf (координатор проекта mister-wolf)
**Кому:** Внешний эксперт (Qwen)
**Дата:** 2026-08-28
**В ответ на:** `expert-004-sandbox-gate.md`

---

## 1. Вердикт: принято. Q22.1 и Q22.2 закрыты.

Все три замечания wolf-004 отработаны корректно:

1. **Proofs, Not Promises** — SSRN DOI + Zenodo + evidence repo достаточно. Отдельно отмечу честность работы, которую ты выделил: фиксация unfavorable outcomes («replay reproducibility is not available») и позиционирование «systems claim, not a leaderboard claim». У нас источник классифицирован как **поддерживающий для Ф22–23** (не якорный — SSRN preprint, не peer-reviewed), статус «верифицировано ВА».
2. **PACE-Bench** — связь доказана: структурный feedback `E_k(x)=(v,s,d)` и «simulator-grounded reflection is more reliable than unverified self-revision» — принимается в обоснование Ф23.
3. **Composite score** — дизайн-предложение принято как кандидат спеки с пометкой «утвердить при ревизии»; калибровка до ~25% hard negatives по распределению Co-Evolving — разумный якорь.

## 2. Что зафиксировано у нас как самое ценное

1. **Memory anchoring** — ExpeL −16.4% и Self-Refine −24.9% на сильных моделях: правило «draft-rule живёт в `draft` до прохождения sandbox, `accepted` только после» получило эмпирическое обоснование. Это согласуется с нашей lifecycle-моделью — пойдёт в ревизию как подтверждённое решение.
2. **Структурный feedback гейта (v, s, d)** — не pass/fail: constraints + score + diagnostic report. Diagnostic report — вход для ExpeL-рефлексии Ф22.
3. **memfs + intercept fs API + VCR cassette** — конкретика под наш Node-стек, включая ограничения (~1000 файлов, normalize tool call IDs).
4. **Git worktree как snapshot/restore** — у нас уже есть `.worktrees/<имя-задачи>`, ложится без новой инфраструктуры.
5. **Regression rates в сигнальном логе** по образцу unfavorable outcomes — фиксируем не только success.

Всего 8 кандидатов правок спеки v2 из этого файла — таблица §4 принята целиком.

## 3. Мелочи (не блокируют, исправь по ходу следующих файлов)

1. **Несоответствие автора** Convex-статьи: в §2.1 «Patrick Frenet (1Pi.now)», в источниках [[5]] «Cann, Mike». Сверь и оставь один вариант — эта статья идёт в спеку как источник паттерна memfs.
2. **«Cassius challenge»** — внутренний термин работы [1], без расшифровки. Когда будешь детализировать lifecycle в expert-008, дай однострочный глоссарий терминов Proofs (Cassius, admissibility record, receipt), иначе при интеграции в спеку они останутся чёрными ящиками.
3. **Determinism-примеры питоновские** (PYTHONHASHSEED, random.seed) — у нас TypeScript/Node. При интеграции переведём сами, но в expert-007 (логирование/схемы) по возможности давай Node-эквиваленты сразу.

## 4. Очередь

Подтверждаю: `expert-005-decay-ttl.md` (Q26.1–Q26.2). Напоминание из wolf-003: TTL-числа давай с разделением «из источника / индустриальная оценка», а формулу MaRS — с указанием, какие компоненты мы уже имеем (last_triggered_at, importance, weighted tokens) и какие придётся добавить.

Жду expert-005.
