# src/zetaflowlab/atlas/costs.py
"""Пол позитивности: издержки + свопы как функция длительности (спека v2 §4.5).

Граница единиц (§3): модуль **не знает о барах** — только таблица ставок и
издержек (:class:`~zetaflowlab.atlas.config.PositivityFloor` /
:class:`~zetaflowlab.atlas.config.SwapRates`). Расчёт — чистые функции от
длительности удержания (минуты) и направления; никакого знания о rollout,
режимах или конкретном инструменте.

Формула §4.5 verbatim::

    floor(h, dir) = commission + spread + slippage + swaps(h, dir)
    swaps(h, dir) = swap_rate(dir) × days(h)
    days(h)       = h_minutes / trading_day_minutes

Комиссия/спред/проскальзывание — фиксированы (не зависят от длительности);
свопы накапливаются линейно по числу торговых дней удержания. Модель издержек
v1 сохраняется (commission — круговая, slippage — на вход taker; спека §4.5).

Семантика свопов (линейная модель):
    * ``swap_rate ≥ 0`` — удержание стоит; пол нестрого возрастает по h (§8).
    * ``swap_rate < 0`` — брокер платит за удержание (бывает на FX); пол
      **убывает** по h. Это честное поведение, не ошибка — фиксируется здесь и
      в docstring. Потребитель (aggregate/rotation) обязан учитывать знак при
      поиске «максимума над полом».

Sensitivity-аудит (§4.5): пересчёт ключевых сводок при ``slippage ∈ {1, 2} bps``
— контролируемый однократный пересчёт, не подгонка. Дельта пола от смены
slippage ровно ``Δslippage`` на каждом горизонте (свопы от slippage не зависят).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import cast

import polars as pl

from zetaflowlab.atlas.config import (
    TRADING_DAY_MINUTES,
    AtlasConfig,
    PositivityFloor,
)

#: Допустимые направления удержания (соответствуют :class:`SwapRates`).
DIRECTIONS: frozenset[str] = frozenset({"long", "short"})

#: Схема кадра :func:`floor_curve`.
_FLOOR_CURVE_SCHEMA: dict[str, pl.DataType] = cast(
    "dict[str, pl.DataType]",
    {
        "horizon_min": pl.Int64,
        "direction": pl.Utf8,
        "floor_bps": pl.Float64,
    },
)

#: Схема кадра :func:`sensitivity_floors`.
_SENSITIVITY_SCHEMA: dict[str, pl.DataType] = cast(
    "dict[str, pl.DataType]",
    {
        "horizon_min": pl.Int64,
        "direction": pl.Utf8,
        "slippage_bps": pl.Float64,
        "floor_bps": pl.Float64,
    },
)


def _swap_rate(direction: str, swaps: PositivityFloor) -> float:
    """Ставка свопа по направлению с валидацией ``direction``.

    Args:
        direction: ``"long"``/``"short"``; иначе :class:`ValueError`.
        swaps: блок positivity_floor (использует поле ``swaps``).

    Returns:
        ``long_bps_per_day`` или ``short_bps_per_day`` (bps за торговый день).
    """
    if direction == "long":
        return swaps.swaps.long_bps_per_day
    if direction == "short":
        return swaps.swaps.short_bps_per_day
    raise ValueError(f"direction: ожидается 'long'/'short', получено {direction!r}")


def floor_bps(
    h_minutes: float,
    direction: str,
    floor_cfg: PositivityFloor,
    *,
    trading_day_minutes: int = TRADING_DAY_MINUTES,
) -> float:
    """Пол позитивности для одного горизонта и направления (§4.5).

    ``floor = commission + spread + slippage + swap_rate(direction) × days(h)``.
    Чистая функция от длительности и направления; издержки — из ``floor_cfg``
    (контракт :class:`PositivityFloor`: commission/spread/slippage ≥ 0;
    свопы могут быть отрицательными).

    Args:
        h_minutes: горизонт удержания в минутах «живого» торгового времени
            (1 торговый день = ``trading_day_minutes``, FX 24ч = 1440).
        direction: ``"long"``/``"short"`` (выбор ставки свопа).
        floor_cfg: блок издержек и ставок свопов.
        trading_day_minutes: число минут в торговом дне (для перевода h → дни).

    Returns:
        Пол позитивности в bps.

    Raises:
        ValueError: ``direction`` не ``long``/``short``; ``h_minutes < 0``;
            ``trading_day_minutes <= 0``.
    """
    if h_minutes < 0:
        raise ValueError(f"h_minutes: горизонт не может быть отрицательным ({h_minutes})")
    if trading_day_minutes <= 0:
        raise ValueError(f"trading_day_minutes: должно быть > 0 ({trading_day_minutes})")
    days = h_minutes / trading_day_minutes
    swap_rate = _swap_rate(direction, floor_cfg)
    return float(
        floor_cfg.commission_bps + floor_cfg.spread_bps + floor_cfg.slippage_bps + swap_rate * days
    )


def floor_curve(
    horizons_min: Sequence[int],
    direction: str,
    cfg: AtlasConfig,
) -> pl.DataFrame:
    """Пол позитивности по лестнице горизонтов (§4.5, §8).

    Вызывает :func:`floor_bps` на каждом горизонте с ``cfg.positivity_floor`` и
    ``cfg.trading_day_minutes``. Порядок строк — порядок входа (лестница
    конфига уже строго возрастает).

    Args:
        horizons_min: лестница горизонтов (минуты).
        direction: ``"long"``/``"short"``.
        cfg: конфиг атласа (берёт ``positivity_floor``, ``trading_day_minutes``).

    Returns:
        Кадр схемы :data:`_FLOOR_CURVE_SCHEMA`: ``(horizon_min, direction,
        floor_bps)``; пустой кадр со схемой при пустой лестнице.
    """
    # Валидация direction даже при пустой лестнице — детерминированный отказ.
    _swap_rate(direction, cfg.positivity_floor)
    if not horizons_min:
        return pl.DataFrame(schema=_FLOOR_CURVE_SCHEMA)
    rows: list[dict[str, int | str | float]] = [
        {
            "horizon_min": int(h),
            "direction": direction,
            "floor_bps": floor_bps(
                float(h),
                direction,
                cfg.positivity_floor,
                trading_day_minutes=cfg.trading_day_minutes,
            ),
        }
        for h in horizons_min
    ]
    return pl.DataFrame(rows, schema=_FLOOR_CURVE_SCHEMA)


def sensitivity_floors(
    horizons_min: Sequence[int],
    direction: str,
    cfg: AtlasConfig,
    slippages: Sequence[float],
) -> pl.DataFrame:
    """Пересчёт пола по сетке slippage — sensitivity-аудит (§4.5).

    Для каждой пары ``(h, slippage)`` считает пол с подменой
    ``positivity_floor.slippage_bps``; свопы и фиксированные издержки не
    меняются. Дельта пола от смены slippage = ``Δslippage`` (константа по h).

    Args:
        horizons_min: лестница горизонтов (минуты).
        direction: ``"long"``/``"short"``.
        cfg: конфиг атласа (база positivity_floor).
        slippages: сетка slippage для пересчёта (bps, ≥ 0; дефолт аудита {1, 2}).

    Returns:
        Кадр схемы :data:`_SENSITIVITY_SCHEMA` (long format):
        ``(horizon_min, direction, slippage_bps, floor_bps)``; пустой кадр со
        схемой при пустом ``horizons_min`` или ``slippages``.

    Raises:
        ValueError: ``direction`` невалиден; ``slippages`` содержат отрицательные.
    """
    _swap_rate(direction, cfg.positivity_floor)
    if any(s < 0 for s in slippages):
        raise ValueError(
            f"slippages: sensitivity-сетка должна быть неотрицательной ({list(slippages)})"
        )
    if not horizons_min or not slippages:
        return pl.DataFrame(schema=_SENSITIVITY_SCHEMA)
    rows: list[dict[str, int | str | float]] = []
    for h in horizons_min:
        for s in slippages:
            fc = cfg.positivity_floor.model_copy(update={"slippage_bps": float(s)})
            rows.append(
                {
                    "horizon_min": int(h),
                    "direction": direction,
                    "slippage_bps": float(s),
                    "floor_bps": floor_bps(
                        float(h),
                        direction,
                        fc,
                        trading_day_minutes=cfg.trading_day_minutes,
                    ),
                }
            )
    return pl.DataFrame(rows, schema=_SENSITIVITY_SCHEMA)


__all__ = [
    "DIRECTIONS",
    "floor_bps",
    "floor_curve",
    "sensitivity_floors",
]
