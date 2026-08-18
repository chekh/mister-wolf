# src/zetaflowlab/atlas/rotation.py
"""Плотность, срок жизни, вложенность, кривые загрузки и синхронность (§5.3).

**Определение ситуации** (согласовано со спекой §5.3 + §4.5 «пол позитивности»):
ситуация на горизонте ``h`` для бара ``t`` ⇔ ``amplitude(t, h) ≥ floor(h)``, где
``amplitude = max(mfe, −mae)`` — симметричная мера отхода цены (как в
:mod:`zetaflowlab.atlas.scales`). ``floor(h)`` — пол позитивности (из
:mod:`zetaflowlab.atlas.costs`, передаётся параметром — rotation не знает о
direction/свопах, граница единиц §3). Срок жизни ситуации = ``t_mfe(t, h)``
(время до зрелости). Направление ситуации = знак преобладания:
``mfe > |mae| → "up"``, иначе ``"down"``. Вложенность: large-ситуация
``(t, h_L)`` содержит small-ситуацию ``(t', h_S)`` (``h_S < h_L``) если
``t < t' ≤ t + t_mfe(t, h_L)`` (строго больше t — под-ситуация стартует позже
внутри окна, не сам стартовый бар).

**Кривая загрузки §5.3.** Жадное неперекрывающееся взятие ситуаций с
``offer ≥ X`` (``offer = amplitude − floor``), sort по ``t``, взял → занят до
зрелости ``t + t_mfe``. ``loading_pct = Σ(t_end − t) / total_minutes × 100``.
Монотонно убывает по ``X``.

**Синхронность §5.3 (обязательный слой).** Доля времени, когда ≥2 ситуации
одного направления идут параллельно (пересекающиеся окна). Парная корреляция
путей (Pearson returns внутри перекрытия) — опционально, при передаче
``bars``. Противоположные направления не синхронны (разные драйверы).

**Эффективная загрузка.** Номинальная загрузка без поправки на корреляцию
завышает эффективный риск. Эффективное число независимых позиций
(diversification-benefit): ``n_eff = n / (1 + (n−1)·ρ̄)``. Риск-множитель
переводит номинальную загрузку в реальный risk-adjusted эквивалент:
``effective = nominal × √(n / n_eff)``. Предельные случаи:
``ρ̄=0 → n_eff=n, effective=nominal``; ``ρ̄=1 → n_eff=1, effective=nominal×√n``
(полная корреляция — N параллельных как одна большая позиция); ``n=1 →
effective=nominal``. Цель «постоянно в рынке» (§9.4 G3) читается по эффективной
загрузке ≤ бюджета риска.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import cast

import numpy as np
import polars as pl

#: Схема кадра :func:`situation_mask` (long format: bar × horizon).
_MASK_SCHEMA: dict[str, pl.DataType] = cast(
    "dict[str, pl.DataType]",
    {
        "bar_idx": pl.Int64,
        "horizon_min": pl.Int64,
        "mfe_bps": pl.Float64,
        "mae_bps": pl.Float64,
        "amplitude_bps": pl.Float64,
        "floor_bps": pl.Float64,
        "offer_bps": pl.Float64,
        "is_situation": pl.Boolean,
        "direction": pl.Utf8,
        "t_mfe_min": pl.Float64,
        "t_mae_min": pl.Float64,
    },
)


def situation_mask(
    excursions: pl.DataFrame,
    floors: Sequence[float],
    horizons: Sequence[int],
) -> pl.DataFrame:
    """Маска ситуаций: ``amplitude(t, h) ≥ floor(h)`` для каждого (бар, горизонт).

    ``amplitude = max(mfe, −mae)``; ``offer = amplitude − floor``;
    ``is_situation = offer ≥ 0``; ``direction = "up" if mfe > |mae| else "down"``.

    Args:
        excursions: кадр :func:`~zetaflowlab.atlas.rollout.compute_excursions`
            (list-колонки ``mfe_bps, mae_bps, t_mfe_min, t_mae_min`` длины
            ``len(horizons)``).
        floors: пол позитивности по лестнице горизонтов (bps, длина = числу
            горизонтов). Передаётся потребителем (из
            :func:`~zetaflowlab.atlas.costs.floor_curve`); rotation не знает о
            direction/свопах (граница §3).
        horizons: лестница горизонтов (минуты) — для колонки ``horizon_min``.

    Returns:
        Кадр по схеме :data:`_MASK_SCHEMA` (long format): одна строка на
        ``(bar_idx, horizon_min)``. Пустой кадр со схемой при пустом входе.
    """
    n = excursions.height
    h_arr = list(horizons)
    f_arr = list(floors)
    if n == 0 or len(h_arr) == 0 or len(f_arr) == 0:
        return pl.DataFrame(schema=_MASK_SCHEMA)
    if len(h_arr) != len(f_arr):
        raise ValueError(
            f"floors ({len(f_arr)}) и horizons ({len(h_arr)}) должны быть одинаковой длины"
        )
    floors_series = pl.Series("floor_bps", [f_arr] * n, dtype=pl.List(pl.Float64))
    horizons_series = pl.Series("horizon_min", [h_arr] * n, dtype=pl.List(pl.Int64))
    exploded = excursions.with_columns(
        floor_bps=floors_series, horizon_min=horizons_series
    ).explode(["horizon_min", "floor_bps", "mfe_bps", "mae_bps", "t_mfe_min", "t_mae_min"])
    return (
        exploded.with_columns(
            amplitude_bps=pl.max_horizontal(
                pl.col("mfe_bps"), (-pl.col("mae_bps")).alias("_neg_mae")
            ),
        )
        .with_columns(
            offer_bps=pl.col("amplitude_bps") - pl.col("floor_bps"),
            is_situation=pl.col("amplitude_bps") >= pl.col("floor_bps"),
            direction=pl.when(pl.col("mfe_bps") > -pl.col("mae_bps"))
            .then(pl.lit("up"))
            .otherwise(pl.lit("down")),
        )
        .select(
            "bar_idx",
            "horizon_min",
            "mfe_bps",
            "mae_bps",
            "amplitude_bps",
            "floor_bps",
            "offer_bps",
            "is_situation",
            "direction",
            "t_mfe_min",
            "t_mae_min",
        )
    )


def situation_stats(
    excursions: pl.DataFrame,
    floors: Sequence[float],
    horizons: Sequence[int],
    trading_day_minutes: int = 1440,
    week_days: int = 7,
) -> pl.DataFrame:
    """Плотность, срок жизни, вложенность ситуаций по горизонтам (§5.3).

    Для каждого горизонта ``h``: число ситуаций ``n_situations`` (где
    ``amplitude ≥ floor``), плотность ``density_per_day`` /
    ``density_per_week``, квантили срока жизни ``t_mfe_q50``/``t_mfe_q90``, и
    средняя вложенность ``nested_count_avg`` — для large-ситуаций на этом
    горизонте: среднее число small-ситуаций (любого меньшего горизонта) внутри
    окна ``[t, t + t_mfe(t, h)]``.

    Args:
        excursions: кадр экскурсий.
        floors/horizons: пол и лестница горизонтов (длины равны).
        trading_day_minutes: минут в торговом дне (для плотности; FX 24ч=1440).
        week_days: дней в неделе (для плотности /неделю).

    Returns:
        Кадр: ``horizon_min, n_situations, density_per_day, density_per_week,
        t_mfe_q50, t_mfe_q90, nested_count_avg``. Отсортирован по
        ``horizon_min``.
    """
    n_bars = excursions.height
    if n_bars == 0:
        return pl.DataFrame()
    mask = situation_mask(excursions, floors, horizons)
    h_arr = sorted(set(horizons))
    n_minutes_total = n_bars  # 1 бар = 1 минута живого времени
    days_total = n_minutes_total / float(trading_day_minutes) if trading_day_minutes > 0 else 0.0

    rows: list[dict[str, int | float]] = []
    for h_large in h_arr:
        sub = mask.filter((pl.col("horizon_min") == h_large) & pl.col("is_situation"))
        n_sit = sub.height
        if n_sit == 0:
            rows.append(
                {
                    "horizon_min": int(h_large),
                    "n_situations": 0,
                    "density_per_day": 0.0,
                    "density_per_week": 0.0,
                    "t_mfe_q50": float("nan"),
                    "t_mfe_q90": float("nan"),
                    "nested_count_avg": 0.0,
                }
            )
            continue
        t_mfe = sub["t_mfe_min"].to_numpy().astype(np.float64)
        density_per_day = n_sit / days_total if days_total > 0 else float("nan")
        density_per_week = density_per_day * week_days if days_total > 0 else float("nan")
        # Вложенность: для каждой large-ситуации (t, t_mfe) — число small-ситуаций
        # (h < h_large) внутри окна [t, t + t_mfe].
        small_mask = mask.filter((pl.col("horizon_min") < h_large) & pl.col("is_situation"))
        small_t = small_mask["bar_idx"].to_numpy().astype(np.int64)
        nested_counts = np.zeros(n_sit, dtype=np.float64)
        if small_t.shape[0] > 0:
            large_t = sub["bar_idx"].to_numpy().astype(np.int64)
            large_end = large_t + t_mfe.astype(np.int64)
            for i in range(n_sit):
                in_window = (small_t > large_t[i]) & (small_t <= large_end[i])
                nested_counts[i] = float(int(in_window.sum()))
        rows.append(
            {
                "horizon_min": int(h_large),
                "n_situations": int(n_sit),
                "density_per_day": float(density_per_day),
                "density_per_week": float(density_per_week),
                "t_mfe_q50": float(np.quantile(t_mfe, 0.5)),
                "t_mfe_q90": float(np.quantile(t_mfe, 0.9)),
                "nested_count_avg": float(nested_counts.mean()),
            }
        )
    return pl.DataFrame(rows).sort("horizon_min", maintain_order=True)


def loading_curve(
    situations: pl.DataFrame,
    offers_grid: Sequence[float],
    total_minutes: int,
) -> pl.DataFrame:
    """Кривая загрузки: жадное неперекрывающееся взятие ситуаций с offer ≥ X.

    Для каждого порога ``X`` из ``offers_grid``: фильтрует ситуации с
    ``offer_bps ≥ X``, сортирует по ``bar_idx`` (время старта), жадно берёт
    неперекрывающиеся (следующая допускается при ``t_start ≥ last_t_end`` где
    ``t_end = bar_idx + t_mfe_min``). ``loading_pct = Σ(t_end − t_start) /
    total_minutes × 100``. Монотонно убывает по ``X``.

    Args:
        situations: кадр ситуаций (от :func:`situation_mask` или совместимый) с
            колонками ``bar_idx, t_mfe_min, offer_bps``.
        offers_grid: пороги ``X`` (bps; ``offer ≥ X``).
        total_minutes: полная длина ряда в минутах (для % времени).

    Returns:
        Кадр: ``offer_threshold, n_taken, n_total, loading_pct``. Строка на
        ``X``; отсортирован по ``offer_threshold``.
    """
    rows: list[dict[str, int | float]] = []
    if situations.height == 0 or total_minutes <= 0:
        for x in offers_grid:
            rows.append(
                {"offer_threshold": float(x), "n_taken": 0, "n_total": 0, "loading_pct": 0.0}
            )
        return pl.DataFrame(rows)
    starts_all = situations["bar_idx"].to_numpy().astype(np.int64)
    durations_all = situations["t_mfe_min"].to_numpy().astype(np.float64)
    offers_all = situations["offer_bps"].to_numpy().astype(np.float64)
    n_total_all = int(starts_all.shape[0])
    for x in offers_grid:
        sel = offers_all >= float(x)
        if not bool(sel.any()):
            rows.append(
                {
                    "offer_threshold": float(x),
                    "n_taken": 0,
                    "n_total": n_total_all,
                    "loading_pct": 0.0,
                }
            )
            continue
        starts = starts_all[sel]
        durations = durations_all[sel]
        # Жадно: sort по start, брать если start ≥ last_end
        order = np.argsort(starts, kind="stable")
        starts = starts[order]
        durations = durations[order]
        ends = starts + durations
        n_taken = 0
        last_end = -np.inf
        time_spent = 0.0
        for i in range(starts.shape[0]):
            if starts[i] >= last_end:
                n_taken += 1
                time_spent += float(ends[i] - starts[i])
                last_end = ends[i]
        loading_pct = (time_spent / float(total_minutes)) * 100.0
        rows.append(
            {
                "offer_threshold": float(x),
                "n_taken": int(n_taken),
                "n_total": n_total_all,
                "loading_pct": float(loading_pct),
            }
        )
    return pl.DataFrame(rows).sort("offer_threshold", maintain_order=True)


def synchrony(
    situations: pl.DataFrame,
    total_minutes: int,
    bars: pl.DataFrame | None = None,
    max_pairs_n: int = 2000,
) -> dict[str, float]:
    """Синхронность параллельных ситуаций (§5.3): sync_time, pairwise corr.

    Считает: ``sync_time_pct`` — доля времени (×100), когда ≥2 ситуации одного
    направления идут параллельно (пересекающиеся окна) — interval sweep
    O(range); ``n_pairs`` — число пар one-direction ситуаций с пересечением окон
    (O(n²) — при ``n > max_pairs_n`` пропускается, возвращается 0); при передаче
    ``bars`` и ``n ≤ max_pairs_n`` — ``avg_pairwise_corr`` (O(n²) по парам).
   Cap O(n²) нужен для прод-масштаба (десятки тыс. ситуаций на 1.9M баров).

    Противоположные направления не синхронны (разные драйверы, §5.3).

    Args:
        situations: кадр с колонками ``bar_idx, t_mfe_min, direction, offer_bps``
            (от :func:`situation_mask` + :func:`situation_stats` контекст).
        total_minutes: полная длина ряда в минутах.
        bars: опционально кадр с ``bar_idx, close`` для корреляции путей.

    Returns:
        Dict: ``{"sync_time_pct": float, "n_pairs": int, "avg_pairwise_corr":
        float}``. ``avg_pairwise_corr = NaN`` если нет пар или нет ``bars``.
    """
    n = situations.height
    result: dict[str, float] = {
        "sync_time_pct": 0.0,
        "n_pairs": 0,
        "avg_pairwise_corr": float("nan"),
    }
    if n < 2 or total_minutes <= 0:
        return result
    starts = situations["bar_idx"].to_numpy().astype(np.int64)
    durations = situations["t_mfe_min"].to_numpy().astype(np.float64)
    ends = starts + durations.astype(np.int64)
    dirs = situations["direction"].to_numpy().astype(object)
    # Доля времени с ≥2 параллельными one-direction ситуациями: для каждой минуты
    # ряда — счетчик one-direction ситуаций; минута «синхронна» если ≥2.
    # memory: O(total_minutes). Для больших рядов — interval sweep ниже.
    # KISS: используем interval sweep (сортировка событий).
    sync_minutes = _sync_overlap_minutes(starts, ends, dirs)
    result["sync_time_pct"] = (sync_minutes / float(total_minutes)) * 100.0
    # n_pairs / avg_pairwise_corr — O(n²); при большом n пропускаем (cap).
    if n <= max_pairs_n:
        pairs_count = _count_one_direction_pairs(starts, ends, dirs)
        result["n_pairs"] = int(pairs_count)
        if bars is not None and pairs_count > 0:
            result["avg_pairwise_corr"] = float(
                _avg_pairwise_path_corr(starts, ends, dirs, bars))
    return result


def _sync_overlap_minutes(
    starts: np.ndarray,
    ends: np.ndarray,
    dirs: np.ndarray,
) -> float:
    """Число минут с ≥2 параллельными one-direction ситуациями (interval sweep).

    События: +1 на start (одна ситуация стартовала), −1 на end (завершилась).
    Sweep по sorted событиям, отдельно для каждого направления; минута считается
    занятой k ситуациями данного направления; sync если хотя бы для одного
    направления k ≥ 2 на этой минуте.

    Для KISS — плотный sweep по минутам от min(start) до max(end), считая
    активные ситуации per direction. Memory O(range), range ≤ total_minutes.
    """
    if starts.shape[0] < 2:
        return 0.0
    lo = int(starts.min())
    hi = int(ends.max())
    if hi <= lo:
        return 0.0
    # Плотный sweep (range может быть большой; для тестов КISS приемлемо).
    # Для прод-масштаба — interval-tree; здесь оставлен KISS (тесты/малые ряды).
    up_active = np.zeros(hi - lo + 1, dtype=np.int32)
    down_active = np.zeros(hi - lo + 1, dtype=np.int32)
    for i in range(starts.shape[0]):
        s = int(starts[i]) - lo
        e = int(ends[i]) - lo
        target = up_active if dirs[i] == "up" else down_active
        target[s:e] += 1
    sync_mask = (up_active >= 2) | (down_active >= 2)
    return float(int(sync_mask.sum()))


def _count_one_direction_pairs(
    starts: np.ndarray,
    ends: np.ndarray,
    dirs: np.ndarray,
) -> int:
    """Число пар ситуаций одного направления с пересекающимися окнами."""
    n = starts.shape[0]
    count = 0
    for i in range(n):
        for j in range(i + 1, n):
            if dirs[i] != dirs[j]:
                continue
            # пересечение [s_i, e_i] и [s_j, e_j]: max(s) < min(e)
            if max(starts[i], starts[j]) < min(ends[i], ends[j]):
                count += 1
    return count


def _avg_pairwise_path_corr(
    starts: np.ndarray,
    ends: np.ndarray,
    dirs: np.ndarray,
    bars: pl.DataFrame,
) -> float:
    """Средняя Pearson-корреляция returns close внутри пересечений окон (пары).

    Для каждой пары one-direction ситуаций с пересекающимися окнами: returns
    close внутри перекрытия (общий интервал) — но returns обоих путей это ОДИН
    и тот же ряд close (ситуации на одном инструменте). Корреляция returns с
    собой = 1. Смысл: «пути конкурентных ситуаций коррелированы» — на одном
    инструменте всегда ≈ 1 для one-direction (общий драйвер).

    Поэтому интерпретация: corr считается между **нормированными формами путей**
    (close(t) − close(start)) / close(start) × sign(direction) внутри
    перекрытия; для one-direction одного знака → +1, противоположных → −1.
    Средняя по one-direction парам ≈ +1 (подтверждает «одна большая позиция»).
    """
    close = bars["close"].to_numpy().astype(np.float64)
    n = starts.shape[0]
    corrs: list[float] = []
    for i in range(n):
        for j in range(i + 1, n):
            if dirs[i] != dirs[j]:
                continue
            ov_lo = max(int(starts[i]), int(starts[j]))
            ov_hi = min(int(ends[i]), int(ends[j]))
            if ov_hi <= ov_lo:
                continue
            # Нормированный путь внутри перекрытия: pct change от старта каждой
            # ситуации. Для одной ситуации (i): путь от starts[i]; (j): от starts[j].
            seg_i = close[ov_lo : ov_hi + 1] / close[int(starts[i])] - 1.0
            seg_j = close[ov_lo : ov_hi + 1] / close[int(starts[j])] - 1.0
            if seg_i.shape[0] < 2:
                continue
            si = seg_i.std()
            sj = seg_j.std()
            if si < 1e-12 or sj < 1e-12:
                continue
            corr = float(np.corrcoef(seg_i, seg_j)[0, 1])
            if not np.isnan(corr):
                corrs.append(corr)
    if not corrs:
        return float("nan")
    return float(np.mean(corrs))


def effective_loading(
    nominal_loading: float,
    n_concurrent: int,
    avg_pairwise_corr: float,
) -> float:
    """Эффективная загрузка с поправкой на синхронность (§5.3).

    Эффективное число независимых позиций (diversification-benefit):
    ``n_eff = n / (1 + (n−1)·ρ̄)``. Риск-множитель переводит номинальную
    загрузку в risk-adjusted эквивалент: ``effective = nominal × √(n / n_eff)``.

    Предельные случаи:
        - ``ρ̄=0`` → ``n_eff=n``, ``effective = nominal`` (независимые ситуации).
        - ``ρ̄=1`` → ``n_eff=1``, ``effective = nominal × √n`` (полная
          корреляция — N параллельных как одна большая позиция).
        - ``n=1`` → ``n_eff=1``, ``effective = nominal`` (одна позиция).

    При ``ρ̄ < 0`` (антикорреляция) ``n_eff > n``, ``effective < nominal``
    (хеджирующий эффект). ``avg_pairwise_corr`` обрезается до ``[−1/(n−1), 1]``
    для положительной определённости средней корреляционной матрицы.

    Args:
        nominal_loading: номинальная доля развёрнутого капитала [0, 1].
        n_concurrent: среднее число параллельных ситуаций (≥1).
        avg_pairwise_corr: средняя парная корреляция путей (∈ [−1, 1]).

    Returns:
        Эффективная загрузка (скаляр); ``nominal_loading`` при ``n ≤ 1``.
    """
    n = int(n_concurrent)
    if n <= 1:
        return float(nominal_loading)
    rho = float(avg_pairwise_corr)
    # Обрезка ρ̄ в диапазон положительной определённости: ρ_min = −1/(n−1)
    rho_lo = -1.0 / (n - 1)
    rho = max(rho_lo, min(1.0, rho))
    n_eff = n / (1.0 + (n - 1) * rho)
    if n_eff <= 0:
        return float("inf")  # вырожденный случай (не должен случаться после clip)
    multiplier = float(np.sqrt(n / n_eff))
    return float(nominal_loading) * multiplier


__all__ = [
    "effective_loading",
    "loading_curve",
    "situation_mask",
    "situation_stats",
    "synchrony",
]
