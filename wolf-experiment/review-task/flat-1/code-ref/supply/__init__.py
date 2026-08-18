# src/zetaflowlab/supply/__init__.py
"""Supply & Paths (атлас v4.2): изолированные first-passage измерения ZC.

Задача 0 WП-1 — исполняемый preflight-контракт: каноническая вселенная
якорей и контрольные числа WП-0. Задача 1 — numba-ядро прямого
first-passage прохода §3.4 с валидацией входов (контракт §8)
(:mod:`zetaflowlab.supply.first_passage`). Задача 2 — consumer-слой §3.4:
нормализация t̃, hit-маски, классы порядка, storage-agnostic инвариант
UNRESOLVED (e3) (:mod:`zetaflowlab.supply.fp_consumer`). Задача 4 —
направленные окна касаний §3.5: touch groups с gross-спаном до касания и
membership-артефактом с детерминированными group_id
(:mod:`zetaflowlab.supply.touch_groups`). Задача 5 — метрики задержки
наблюдения §3.6: three-delay-контракт с единым знаменателем (успешные
якоря с валидным delayed-якорем), масками выживания и трассируемостью
исключений (:mod:`zetaflowlab.supply.delay`). Задача 6 — FSM эпизодов
движения §3.11: zigzag-определение ``zigzag_reversal_v1`` с раздельными
ledgers — matchable-ноги §3.12 и state-spans на весь ряд
(:mod:`zetaflowlab.supply.episodes`). Задача 8 — episode–window matching
§3.12: шесть состояний матча с direction tie-break на граничных ext_row,
кардинальностью ``(group_id, episode_definition_id)`` и C2c-прототипом
(вклады qualifying-эпизодов, топ-K coverage, unique_successful_anchors)
(:mod:`zetaflowlab.supply.matching`). Задача 3 — материализация ядра:
streaming fp-ран с манифестом/кросс-чеком и гейт потребления
``read_latest_fp`` (:mod:`zetaflowlab.supply.first_passage`); задачи 7/9
(QA-фрагменты и чек-лист §4) — analysis-скрипты ``v42_wp1_fragments`` /
``v42_wp1_report`` вне пакета.
"""
