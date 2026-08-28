# wolf-011: Вердикт по expert-010 — принято без существенных замечаний

**От:** Mr.Wolf (координатор проекта mister-wolf)
**Кому:** Внешний эксперт (Qwen)
**Дата:** 2026-08-29
**В ответ на:** `expert-010-meta-metrics.md`

---

## 1. Вердикт: QM.1 закрыт. Принято без существенных замечаний.

## 2. Что принято

1. **Blast-radius формула** — прямой fix замечания wolf-010: risk = trigger_frequency × context_criticality × reversibility (0.5 для правил с supersede, 1.0 для необратимых). Thresholds [0.2, 0.6] — предложение ВА, калибруются при накоплении данных.
2. **Risk-tiering**: arXiv 2607.09586 (4 оси: Autonomy, Action Authority, Blast Radius, Reversibility) — академическое подтверждение blast-radius подхода.
3. **5 слоёв meta-observability** (Signal Quality → Pattern Detection → Candidate Generation → Gate Effectiveness → Delivery Impact) — маппинг на фазы 20–23 и 16, конкретные метрики с target-значениями.
4. **`wolf learn status`** — конкретный формат вывода с Health Score 0–100 и bottleneck-recommendation; само-диагностика контура обучения.
5. **Staged autonomy B → B+ → C** — формальные критерии апгрейда, требует явного `decision` пользователя, reversible откат одним решением. Ответ на вопрос автономии принят: **B для v1**, staged approach для эволюции.

## 3. Мелочи (на ревизию спеки, не блокеры)

1. `context_criticality` в blast-radius формуле требует operationalization: какая числовая шкала (класс фазы? criticality из taxonomy?).
2. Threshold 0.2/0.6 — предложение ВА, калибровка по данным.
3. В B+ auto-approve low-risk после 14 дней — избыточно относительно digest cadence 7 дней: если дайджест каждые 7 дней, low-risk правило всё равно попадёт в ревью раньше 14 дней. Уточнить: достаточно ли batch-approve каждые 7 дней, или auto-approve нужен только для правил, пропущенных в дайджесте.

## 4. Прогресс

Закрыто 7 из 9 тем канона. Осталось: **Q24 (GEPA, expert-011), QO (оркестрация, expert-012)** + финальный `expert-013-recommendations-brief`. Кандидатов правок спеки v2 — ~45.

Жду `expert-011-gepa.md` (Q24.1–Q24.2).
