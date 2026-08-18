# src/zetaflowlab/supply/delay.py
"""Метрики задержки наблюдения §3.6 (задача 5 WП-1, атлас v4.2).

«Достижима ли цель k из отложенного наблюдения»: вход якоря сдвигается на
``delta`` баров (``delayed_row = row + delta``), и ``t_hit`` delayed-якоря
читается из **полного row-aligned массива** ``tau_full`` (контракт:
``delayed τ = tau_full[row + delta]``; ``t_hit`` delayed считается от
своего входа ``close[t + delta]``, а не от исходной сделки). Условия успеха
(estimand-таблица §3.6):

.. code-block:: text

    same_touch_survival          = 1[delayed_row < touch_row(t)
                                       ∧ touch_id(delayed) = touch_id(t)
                                       ∧ 0 < t_hit(t+δ) ≤ h − δ]
    original_horizon_survival    = 1[0 < t_hit(t+δ) ≤ h − δ]   # остаток окна
    renewed_horizon_availability = 1[0 < t_hit(t+δ) ≤ h]       # новое окно

**Знаменатель единый для всех трёх метрик** (§3.6, зарегистрированное решение
ревью): успешные якори ``0 < τ(t) ≤ h`` с валидным delayed-якорем —
``row + delta`` в scope, не в OOS и ``window_len[row + delta] ≥ h``;
per-metric знаменатели не вводятся. ``n_raw``/``n_excluded``/
``excluded_share`` публикуются отдельно (трассируемость исключений);
доли при пустом знаменателе — NaN.

Соглашения: ``touch_row(t) = row + τ(t)`` и ``touch_id = ts[touch_row]``
(§3.3, lookup по ряду — арифметика ``timestamp + τ`` запрещена);
``touch_id(delayed)`` определён только для успешного delayed-якоря
(``0 < τ_d ≤ h``) — иначе индикатор ``same_touch`` = 0; сравнения τ — только
после маски ``τ > 0`` (:func:`zetaflowlab.supply.fp_consumer.hit_mask`).
Отсюда монотонность ``same ⊆ original ⊆ renewed`` (проверяется тестами
вместе с инвариантом ``τ_d = τ(t) − δ`` для same-touch выживших).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import numpy.typing as npt
from loguru import logger

from zetaflowlab.supply.fp_consumer import hit_mask


@dataclass(frozen=True)
class DelaySurvivors:
    """Маски выживания трёх метрик §3.6 (длина = ``len(rows)``).

    ``True`` — якорь попал в знаменатель и удовлетворяет условию метрики;
    исключённые (невалидный delayed-якорь) и неуспешные якори — ``False``
    во всех трёх масках. Включение ``same ⊆ original ⊆ renewed`` —
    проверяемый инвариант.

    Attributes:
        same_touch: маска ``same_touch_survival``.
        original_horizon: маска ``original_horizon_survival``.
        renewed_horizon: маска ``renewed_horizon_availability``.
    """

    same_touch: npt.NDArray[np.bool_]
    original_horizon: npt.NDArray[np.bool_]
    renewed_horizon: npt.NDArray[np.bool_]


@dataclass(frozen=True)
class DelayResult:
    """Результат метрик задержки §3.6 для одной ячейки (dir, k, h) и сдвига δ.

    Attributes:
        same_touch_share: доля same-touch выживаний в общем знаменателе.
        original_horizon_share: доля выживаний в остатке исходного окна
            (``t_hit(t+δ) ≤ h − δ``).
        renewed_horizon_share: доля доступностей в новом полном окне
            (``t_hit(t+δ) ≤ h``); систематически мягче original и публикуется
            только вместе с ним.
        n_raw: успешные якори ``0 < τ(t) ≤ h`` на входе (до исключений).
        n_excluded: успешные якори с невалидным delayed-якорем (scope/OOS/
            ``window_len < h``).
        excluded_share: ``n_excluded / n_raw`` (NaN при ``n_raw = 0``).
        survivors: маски трёх метрик, выровненные с входными ``rows``.
    """

    same_touch_share: float
    original_horizon_share: float
    renewed_horizon_share: float
    n_raw: int
    n_excluded: int
    excluded_share: float
    survivors: DelaySurvivors


def _share(numerator: int, denominator: int) -> float:
    """Доля ``numerator / denominator``; NaN при пустом знаменателе.

    Args:
        numerator: числитель (≥ 0).
        denominator: знаменатель (≥ 0).

    Returns:
        Долю float64 либо NaN, если знаменатель 0.
    """
    if denominator == 0:
        return float("nan")
    return numerator / denominator


def _validate_delay_inputs(
    rows: npt.NDArray[np.int64],
    tau_full: npt.NDArray[np.int64],
    ts: npt.NDArray[np.int64],
    window_len: npt.NDArray[np.int64],
    oos_cut: int,
    k: float,
    h: int,
    delta: int,
) -> None:
    """Проверить входы метрик задержки; production-политика — стоп.

    Правила (каждое — ``ValueError`` с указанием первого нарушителя):
    ``k > 0``; ``0 < h``; ``0 < delta``; все массивы 1-D;
    ``tau_full``/``ts``/``window_len`` равной длины (row-aligned);
    ``0 ≤ oos_cut ≤ len(ts)``; ``0 ≤ rows[i] < len(ts)``.

    Args:
        rows: позиции якорей ячейки, int64.
        tau_full: полный row-aligned массив τ всех якорей вселенной
            (sentinel −1), int64.
        ts: timestamps всего ряда баров, epoch ns, int64.
        window_len: row-aligned длины окон якорей, баров, int64.
        oos_cut: позиция первого OOS-бара (delayed-якорь обязан быть раньше).
        k: уровень цели, bps (контекст ячейки).
        h: горизонт окна, observed M1 bars.
        delta: задержка наблюдения, баров.

    Raises:
        ValueError: при нарушении любого правила.
    """
    if not k > 0.0:
        raise ValueError(f"k > 0 нарушено: k = {k}")
    if not h > 0:
        raise ValueError(f"0 < h нарушено: h = {h}")
    if not delta > 0:
        raise ValueError(f"0 < delta нарушено: delta = {delta}")
    for name, arr in (
        ("rows", rows),
        ("tau_full", tau_full),
        ("ts", ts),
        ("window_len", window_len),
    ):
        if arr.ndim != 1:
            raise ValueError(
                f"{name} должен быть 1-D массивом, получен shape={arr.shape}"
            )
    n_bars = ts.shape[0]
    if not (tau_full.shape[0] == n_bars == window_len.shape[0]):
        raise ValueError(
            f"tau_full/ts/window_len должны быть равной длины (row-aligned): "
            f"tau_full={tau_full.shape[0]}, ts={n_bars}, "
            f"window_len={window_len.shape[0]}"
        )
    if not 0 <= oos_cut <= n_bars:
        raise ValueError(
            f"oos_cut вне ряда: 0 ≤ oos_cut ≤ len(ts)={n_bars} нарушено: "
            f"oos_cut={oos_cut}"
        )
    rows_out = (rows < 0) | (rows >= n_bars)
    if bool(rows_out.any()):
        i = int(np.argmax(rows_out))
        raise ValueError(
            f"rows за пределами ряда: rows[{i}] = {rows[i]} "
            f"(требуется 0 ≤ row < len(ts)={n_bars})"
        )


def delay_metrics(
    rows: npt.NDArray[np.int64],
    tau_full: npt.NDArray[np.int64],
    ts: npt.NDArray[np.int64],
    window_len: npt.NDArray[np.int64],
    oos_cut: int,
    k: float,
    h: int,
    delta: int,
) -> DelayResult:
    """Три метрики задержки наблюдения §3.6 с единым знаменателем.

    Пайплайн: успешные якори ``0 < τ(t) ≤ h`` (:func:`hit_mask` — маска
    ``τ > 0`` до любых сравнений) → валидность delayed-якоря
    (``row+delta`` в scope, не в OOS, ``window_len[row+delta] ≥ h``;
    исключённые — ``n_excluded``) → ``τ_d = tau_full[row+delta]`` → метрики:
    ``renewed = 0 < τ_d ≤ h``, ``original = 0 < τ_d ≤ h−δ``,
    ``same = original ∧ delayed_row < touch_row(t) ∧ touch_id(delayed) =
    touch_id(t)`` (``touch_id(delayed)`` — только для успешного delayed,
    lookup ``ts[touch_row]``, §3.3). Детерминизм: позиционная арифметика
    int64, фиксированный порядок условий.

    Граничный случай ``δ ≥ h``: ``original``/``same`` пусты по построению
    (условие ``0 < τ_d ≤ h − δ ≤ 0`` невыполнимо) — их доли ``0.0`` при
    непустом знаменателе; ``renewed`` остаётся содержательным.

    Args:
        rows: позиции якорей ячейки в ряду баров, int64; предполагаются
            уникальными (контракт ячейки — один якорь на бар).
        tau_full: полный row-aligned массив τ всех якорей вселенной
            (sentinel −1), int64; ``delayed τ = tau_full[row + delta]``.
        ts: timestamps всего ряда баров, epoch ns, int64.
        window_len: row-aligned длины окон якорей, баров, int64
            (условие ``window_len[row+delta] ≥ h``).
        oos_cut: позиция первого OOS-бара; ``row+delta`` обязан быть раньше.
        k: уровень цели, bps (контекст ячейки, в вычисления не входит).
        h: горизонт окна, observed M1 bars.
        delta: задержка наблюдения, баров (δ > 0).

    Returns:
        :class:`DelayResult` — три доли в общем знаменателе
        (``n_raw − n_excluded``), счётчики исключений и маски выживания.

    Raises:
        ValueError: нарушения контракта входов
            (см. :func:`_validate_delay_inputs`) либо touch_row успешного
            якоря (или успешного delayed из same-кандидатов) за пределами
            ряда — ``touch_id`` lookup невозможен.
    """
    _validate_delay_inputs(rows, tau_full, ts, window_len, oos_cut, k, h, delta)
    n = rows.shape[0]
    n_bars = ts.shape[0]

    tau_t = tau_full[rows]
    success = hit_mask(tau_t, h)
    n_raw = int(success.sum())

    touch_rows_t = rows[success] + tau_t[success]
    out = (touch_rows_t < 0) | (touch_rows_t >= n_bars)
    if bool(out.any()):
        i = int(np.argmax(out))
        raise ValueError(
            f"touch_row за пределами ряда: rows[{int(rows[success][i])}] + "
            f"tau={int(tau_t[success][i])} → touch_row={int(touch_rows_t[i])} "
            f"(требуется 0 ≤ touch_row < len(ts)={n_bars}) — "
            "touch_id lookup невозможен"
        )

    delayed = rows + delta
    in_scope = delayed < n_bars
    not_oos = delayed < oos_cut
    win_at = window_len[np.where(in_scope, delayed, 0)]
    denom_mask = success & in_scope & not_oos & (win_at >= h)

    idx = np.nonzero(denom_mask)[0]
    denom_n = int(idx.shape[0])
    n_excluded = n_raw - denom_n

    same = np.zeros(n, dtype=np.bool_)
    orig = np.zeros(n, dtype=np.bool_)
    renewed = np.zeros(n, dtype=np.bool_)

    if denom_n > 0:
        d_rows = delayed[idx]
        tau_d = tau_full[d_rows]
        renewed_d = hit_mask(tau_d, h)
        orig_d = hit_mask(tau_d, h - delta)
        touch_t = rows[idx] + tau_t[idx]
        # touch_id(delayed) определён только для успешного delayed-якоря:
        # orig ⊆ успешные (0 < τ_d ≤ h), для остальных индикатор = 0
        cand = orig_d & (d_rows < touch_t)
        same_d = np.zeros(denom_n, dtype=np.bool_)
        if bool(cand.any()):
            touch_d = d_rows[cand] + tau_d[cand]
            bad = (touch_d < 0) | (touch_d >= n_bars)
            if bool(bad.any()):
                i = int(np.argmax(bad))
                raise ValueError(
                    f"touch_row delayed за пределами ряда: delayed_row="
                    f"{int(d_rows[cand][i])} + tau={int(tau_d[cand][i])} → "
                    f"touch_row={int(touch_d[i])} (требуется "
                    f"0 ≤ touch_row < len(ts)={n_bars}) — "
                    "touch_id lookup невозможен"
                )
            same_d[cand] = ts[touch_d] == ts[touch_t[cand]]
        same[idx[same_d]] = True
        orig[idx[orig_d]] = True
        renewed[idx[renewed_d]] = True

    same_share = _share(int(same.sum()), denom_n)
    orig_share = _share(int(orig.sum()), denom_n)
    renewed_share = _share(int(renewed.sum()), denom_n)
    excluded_share = _share(n_excluded, n_raw)
    logger.info(
        "delay §3.6 k={} h={} δ={}: n_raw={}, excluded={} ({}), "
        "знаменатель={}, same={}, original={}, renewed={}",
        k, h, delta, n_raw, n_excluded, excluded_share, denom_n,
        same_share, orig_share, renewed_share,
    )
    return DelayResult(
        same_touch_share=same_share,
        original_horizon_share=orig_share,
        renewed_horizon_share=renewed_share,
        n_raw=n_raw,
        n_excluded=n_excluded,
        excluded_share=excluded_share,
        survivors=DelaySurvivors(
            same_touch=same, original_horizon=orig, renewed_horizon=renewed
        ),
    )
