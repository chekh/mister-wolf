# src/zetaflowlab/atlas/gaps.py
"""Слой гэпов инструмента: полная популяция overnight/weekend (спека v2 §2, §4.1, §5.6).

Отдельный риск-слой от ``gap_flags`` на путях экскурсий
(:mod:`zetaflowlab.atlas.rollout`, Task 2): здесь — **полная популяция гэпов**
инструмента за всю историю (не только на путях конкретных экскурсий), с
классификацией overnight/weekend и сводкой квантилей/хвостов. На горизонте дней
стоп не гарантирует выход по уровню (§2) → гэпы — обязательный слой риска;
хвосты питают бюджет ``Y_max`` (§5.6). Прогноз П5 (§9.2): «медиана мала
относительно ATR_d, недельный хвост значим» — проверяется продуктом слоя.

Семантика (фиксируется здесь и в тестах ``tests/test_atlas_gaps.py``):

    gap(i) ⇔ timestamp[i] − timestamp[i−1] > 1 мин   (_GAP_MINUTE_THRESHOLD)
    gap_bps(i) = (open[i] − close[i−1]) / close[i−1] × 1e4   (со знаком)
    weekend ⇔ между timestamp[i−1] и timestamp[i] есть суббота или воскресенье
    overnight ⇔ гэп, не являющийся weekend

**Классификация — календарная** (FX EURUSD торгуется 24/5): единственный
систематический длинный разрыв — через выходные (weekend); ночная пауза в будние
(если есть в данных) — overnight. Порог ``dt > 1 мин`` (≡
:func:`zetaflowlab.atlas.rollout._compute_gaps`) отделяет «гэп» от нормального
1-мин бара; формула размера — та же (согласованность с gap_flags на путях).

**Детерминизм (AGENTS.md §2.2).** ``float64``; вычисления векторизованы в NumPy,
порядок строк фиксирован (сортировка по ``bar_idx``), повторный прогон побитово
воспроизводим. Без numba: число гэпов ≪ числа баров (на EURUSD M1 — сотни против
~1.9M), Python-цикл классификации по календарю не узкое место.
"""

from __future__ import annotations

import datetime as dt
from typing import cast

import numpy as np
import polars as pl
from loguru import logger

#: Знаменатель перевода отклонения цены в bps (≡ rollout._BPS_DENOM).
_BPS_DENOM: float = 10_000.0

#: Порог гэп-интервала: разрыв торгового времени > 1 мин → гэп
#: (≡ :data:`zetaflowlab.atlas.rollout._GAP_MINUTE_THRESHOLD`).
_GAP_MINUTE_THRESHOLD: float = 1.0

#: Дни недели субботы/воскресенья (Python ``date.weekday()``: пн=0, вс=6).
_WEEKEND_WEEKDAYS: frozenset[int] = frozenset({5, 6})

#: Схема вывода :func:`extract_gaps` — одна строка на гэп-интервал.
_GAPS_SCHEMA: dict[str, pl.DataType] = cast(
    "dict[str, pl.DataType]",
    {
        "bar_idx": pl.Int64,
        "timestamp": pl.Datetime("us"),
        "kind": pl.Utf8,
        "gap_bps": pl.Float64,
        "direction": pl.Utf8,
    },
)

#: Схема вывода :func:`gap_summary` — одна строка на представленный kind.
_SUMMARY_SCHEMA: dict[str, pl.DataType] = cast(
    "dict[str, pl.DataType]",
    {
        "kind": pl.Utf8,
        "n": pl.Int64,
        "q50_abs_bps": pl.Float64,
        "q95_abs_bps": pl.Float64,
        "q99_abs_bps": pl.Float64,
        "up_share": pl.Float64,
        "down_share": pl.Float64,
    },
)

#: Метки kind в стабильном порядке вывода summary.
_KIND_ORDER: tuple[str, ...] = ("overnight", "weekend")

#: Квантили хвостов |gap_bps| (§5.6: «Квантили и хвосты гэпов»).
_SUMMARY_QUANTILES: tuple[float, ...] = (0.50, 0.95, 0.99)


def _spans_weekend(prev_dt: dt.datetime, curr_dt: dt.datetime) -> bool:
    """Разрыв пересекает субботу/воскресенье (календарный признак FX 24/5).

    Проверяются календарные дни в полуинтервале ``(prev_date, curr_date]``: если
    среди них есть сб (weekday 5) или вс (6) — выходные в гэпе. Гэп в пределах
    одних суток (``prev_date == curr_date``) выходных не содержит.

    Args:
        prev_dt: timestamp закрытия бара перед разрывом (бар ``i−1``).
        curr_dt: timestamp открытия бара после разрыва (бар ``i``).

    Returns:
        True, если между ``prev_dt`` и ``curr_dt`` лежит суббота или воскресенье.
    """
    day = prev_dt.date() + dt.timedelta(days=1)
    end = curr_dt.date()
    while day <= end:
        if day.weekday() in _WEEKEND_WEEKDAYS:
            return True
        day += dt.timedelta(days=1)
    return False


def extract_gaps(bars: pl.DataFrame) -> pl.DataFrame:
    """Извлечь полную популяцию гэпов инструмента (overnight/weekend).

    Гэп-интервал открывает бар ``i`` (``i ≥ 1``), если
    ``timestamp[i] − timestamp[i−1] > 1 мин`` (разрыв торгового времени). Размер
    гэпа — ``(open[i] − close[i−1]) / close[i−1] × 1e4`` bps со знаком (≡
    :func:`zetaflowlab.atlas.rollout._compute_gaps`). Классификация ``kind``:
    ``weekend`` ⇔ между соседними timestamps есть сб/вс; иначе ``overnight``.

    Args:
        bars: кадр OHLC с timestamp (схема bars_1m_enriched; используются
            колонки ``timestamp, open, close``).

    Returns:
        Кадр по схеме :data:`_GAPS_SCHEMA` (одна строка на гэп, отсортированный
        по ``bar_idx``); пустой кадр со схемой при пустом входе / ``n < 2`` /
        отсутствии разрывов ``dt > 1 мин``.
    """
    n = bars.height
    if n < 2:
        return pl.DataFrame(schema=_GAPS_SCHEMA)

    ts_ns = bars["timestamp"].dt.epoch("ns").to_numpy().astype(np.int64)
    open_ = bars["open"].to_numpy().astype(np.float64, copy=False)
    close = bars["close"].to_numpy().astype(np.float64, copy=False)
    ts_np = bars["timestamp"].to_numpy()
    ts_py: list[dt.datetime] = ts_np.tolist()

    dt_min = (ts_ns[1:] - ts_ns[:-1]) / 60e9
    is_gap = dt_min > _GAP_MINUTE_THRESHOLD
    if not bool(is_gap.any()):
        return pl.DataFrame(schema=_GAPS_SCHEMA)

    idx = np.nonzero(is_gap)[0]  # индекс пары [0, n-2]; открывающий бар = idx+1
    bar_idx = (idx + 1).astype(np.int64)
    prev_close = close[idx]
    curr_open = open_[idx + 1]
    gap_bps = (curr_open - prev_close) / prev_close * _BPS_DENOM
    direction = np.where(gap_bps > 0.0, "up", np.where(gap_bps < 0.0, "down", "none"))

    kinds_list: list[str] = []
    for k in idx:
        kk = int(k)
        kinds_list.append("weekend" if _spans_weekend(ts_py[kk], ts_py[kk + 1]) else "overnight")

    ts_open = ts_np[bar_idx]
    out = pl.DataFrame(
        {
            "bar_idx": bar_idx,
            "timestamp": pl.Series(ts_open, dtype=pl.Datetime("us")),
            "kind": pl.Series(kinds_list, dtype=pl.Utf8),
            "gap_bps": gap_bps,
            "direction": pl.Series(direction, dtype=pl.Utf8),
        },
        schema=_GAPS_SCHEMA,
    )
    n_overnight = sum(1 for k in kinds_list if k == "overnight")
    logger.debug(
        "atlas.gaps: {} баров → {} гэпов (overnight={}, weekend={})",
        n,
        out.height,
        n_overnight,
        out.height - n_overnight,
    )
    return out.sort("bar_idx", maintain_order=True)


def gap_summary(gaps: pl.DataFrame) -> pl.DataFrame:
    """Сводка квантилей/хвостов гэпов и направления — отдельно по kind.

    Для каждого представленного kind (``overnight``/``weekend``) считает:
    ``n`` — число гэпов; ``q50/q95/q99_abs_bps`` — квантили ``|gap_bps|``
    (медиана + хвосты, §5.6); ``up_share``/``down_share`` — доли up/down
    направления (бары с ``gap_bps == 0`` — ``direction="none"`` — не входят ни в
    одну долю). Квантили — через ``np.quantile`` (linear interpolation,
    детерминизм). kind без гэпов в сводку не входят.

    Args:
        gaps: кадр от :func:`extract_gaps` (схема :data:`_GAPS_SCHEMA`).

    Returns:
        Кадр по схеме :data:`_SUMMARY_SCHEMA` (одна строка на представленный
        kind, порядок ``overnight`` → ``weekend``); пустой кадр со схемой при
        пустом входе.
    """
    if gaps.height == 0:
        return pl.DataFrame(schema=_SUMMARY_SCHEMA)

    abs_bps_all = np.abs(gaps["gap_bps"].to_numpy().astype(np.float64, copy=False))
    kinds_all = gaps["kind"].to_numpy()
    dirs_all = gaps["direction"].to_numpy()

    kinds_out: list[str] = []
    n_out: list[int] = []
    q50: list[float] = []
    q95: list[float] = []
    q99: list[float] = []
    up: list[float] = []
    down: list[float] = []
    for kind in _KIND_ORDER:
        mask = kinds_all == kind
        n_k = int(mask.sum())
        if n_k == 0:
            continue
        a = abs_bps_all[mask]
        qs = np.quantile(a, _SUMMARY_QUANTILES)
        d = dirs_all[mask]
        kinds_out.append(kind)
        n_out.append(n_k)
        q50.append(float(qs[0]))
        q95.append(float(qs[1]))
        q99.append(float(qs[2]))
        up.append(float((d == "up").sum()) / n_k)
        down.append(float((d == "down").sum()) / n_k)

    return pl.DataFrame(
        {
            "kind": pl.Series(kinds_out, dtype=pl.Utf8),
            "n": pl.Series(n_out, dtype=pl.Int64),
            "q50_abs_bps": pl.Series(q50, dtype=pl.Float64),
            "q95_abs_bps": pl.Series(q95, dtype=pl.Float64),
            "q99_abs_bps": pl.Series(q99, dtype=pl.Float64),
            "up_share": pl.Series(up, dtype=pl.Float64),
            "down_share": pl.Series(down, dtype=pl.Float64),
        },
        schema=_SUMMARY_SCHEMA,
    )


__all__ = ["extract_gaps", "gap_summary"]
