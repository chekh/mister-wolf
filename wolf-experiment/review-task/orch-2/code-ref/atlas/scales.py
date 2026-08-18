# src/zetaflowlab/atlas/scales.py
"""Кривая масштаба, √t-нейтраль, насыщение, память рынка (атлас v2 §4.3, §5.1, §5.2).

Главный продукт §5.1 — **кривая масштаба**: квантили экскурсии vs горизонт по
режимам, рядом — нейтральная √t-кривая (эталон случайного блуждания,
калиброванный по дисперсии базового шага). Выше √t — трендовый характер, ниже
— возвратный. Контроль прибора (§8): на синтетическом GBM измеренная кривая
ложится на √t-эталон по форме (``test_sqrt_t_neutrality_on_gbm``).

**Главная мера масштаба** (зафиксировано): ``amplitude = max(mfe, −mae)`` —
максимальный односторонний отход цены от entry в любом направлении. Симметрична
и инвариантна к направлению (атлас измеряет инструмент без предположений о
стиле, §1–§2). Альтернативы ``mfe`` / ``|mae|`` — асимметричны и соответствуют
направленной торговле; для «характера инструмента» нужна симметричная мера.

**Горизонт из данных §4.3.** Две кривые:
- **Насыщение** (:func:`saturation_horizon`): первый ``h``, где относительный
  прирост ``q50(amplitude)`` < ``rel_threshold`` — где рост гаснет.
- **Память** (:func:`memory_distance`): статистическое расстояние условной
  раздачи (по метке) vs безусловной vs ``h``; горизонт памяти = где CI
  расстояния включает 0 (нуль-гипотеза не отвергается). Мера — **KS-статистика**
  Колмогорова-Смирнова (масштаб-инвариантна, классическая мера отличимости
  распределений; альтернатива Wasserstein-1 зависит от масштаба и менее
  интерпретируема для «отличимости»).

**Бутстреп §7 п.5.** Все CI — блочный бутстреп (наследие
:mod:`zetaflowlab.atlas.aggregate`). Для memory_distance — реплика-цикл
(memory-safe для ~1e6 выборки, без материализации ``[n_boot, n]``).
"""

from __future__ import annotations

import numpy as np
import polars as pl
from loguru import logger
from scipy.stats import ks_2samp

#: Перцентили бутстреп-распределения для 95% CI.
_CI_LEVELS: tuple[float, float] = (0.025, 0.975)


# --- √t-нейтраль и калибровка -----------------------------------------------


def sqrt_t_neutral(
    horizons_min: np.ndarray,
    base_step_min: int,
    base_std_bps: float,
) -> np.ndarray:
    """Эталон случайного блуждания: ``σ(h) = base_std × √(h / base_step)``.

    При ``h = base_step`` возвращает ``base_std`` (калибровочная точка).
    Кривая масштаба сравнивается с эталоном по ФОРМЕ: измеренная
    ``q50(amplitude) / σ(h)`` ≈ const по ``h`` на GBM — прибор работает.

    Args:
        horizons_min: лестница горизонтов в минутах/барах.
        base_step_min: базовый шаг (для FX 1m = 1 бар; σ_step — std 1-bar
            приращения).
        base_std_bps: std базового шага в bps (из :func:`calibrate_base_std`).

    Returns:
        Массив ``σ(h) = base_std × √(h / base_step)`` той же длины, что вход.
    """
    h = np.asarray(horizons_min, dtype=np.float64)
    return base_std_bps * np.sqrt(h / float(base_step_min))


def calibrate_base_std(bars: pl.DataFrame, base_step_min: int = 1) -> float:
    """Калибровка ``base_std`` из данных: std приращения close за ``base_step``.

    ``base_step=1`` — std однобарного (pct-change) приращения close в bps.
    Для GBM с известной ``σ_step`` (доля) → ``calibrate_base_std ≈ σ_step × 1e4``.
    Используется как вход в :func:`sqrt_t_neutral` (калибровка эталона).

    Args:
        bars: кадр OHLC с ``close``.
        base_step_min: шаг приращения в барах (1 = однобарный return).

    Returns:
        Выборочный std приращения close в bps (``ddof=1``); 0.0 для плоского
        ряда / ``len < 2``.
    """
    close = bars["close"].to_numpy().astype(np.float64)
    n = close.shape[0]
    step = max(1, int(base_step_min))
    if n <= step:
        return 0.0
    prev = close[:-step]
    nxt = close[step:]
    ret_bps = (nxt - prev) / prev * 1e4
    return float(np.std(ret_bps, ddof=1))


# --- Кривая масштаба --------------------------------------------------------


def scale_curve(
    excursions: pl.DataFrame,
    horizons: tuple[int, ...],
    quantiles: tuple[float, ...] = (0.1, 0.25, 0.5, 0.75, 0.9),
) -> pl.DataFrame:
    """Кривая масштаба: квантили ``amplitude = max(mfe, −mae)`` vs горизонт.

    Главная мера — симметричная амплитуда (см. module docstring): максимум
    одностороннего отхода вверх/вниз. NaN-ячейки (хвост ряда) исключаются.
    Кривая сравнивается с :func:`sqrt_t_neutral` для диагноза
    трендовый/возвратный характер инструмента (§5.1).

    Args:
        excursions: кадр :func:`~zetaflowlab.atlas.rollout.compute_excursions`.
        horizons: лестница горизонтов (для фильтра/сортировки вывода).
        quantiles: квантили амплитуды (``q10/q25/q50/q75/q90`` по умолчанию).

    Returns:
        Кадр: ``horizon_min`` + колонки ``q{int(q*100)}`` для каждого
        квантиля. Отсортирован по ``horizon_min``; горизонты без данных
        пропущены.
    """
    n_rows = excursions.height
    if n_rows == 0:
        return pl.DataFrame()
    horizons_list = list(horizons)
    horizons_series = pl.Series("horizon_min", [horizons_list] * n_rows, dtype=pl.List(pl.Int64))
    exploded = excursions.with_columns(horizon_min=horizons_series).explode(
        ["horizon_min", "mfe_bps", "mae_bps"]
    )
    # amplitude = max(mfe, -mae); NaN если любой NaN → фильтруем
    exploded = exploded.with_columns(
        amplitude=pl.max_horizontal(pl.col("mfe_bps"), (-pl.col("mae_bps")).alias("_neg_mae"))
    )
    rows: list[dict[str, object]] = []
    for h in horizons:
        vals = (
            exploded.filter(pl.col("horizon_min") == int(h))["amplitude"]
            .to_numpy()
            .astype(np.float64)
        )
        vals = vals[~np.isnan(vals)]
        if vals.shape[0] == 0:
            continue
        row: dict[str, object] = {"horizon_min": int(h)}
        for q in quantiles:
            row[f"q{int(round(float(q) * 100))}"] = float(np.quantile(vals, q))
        rows.append(row)
    logger.debug(
        "atlas.scale_curve: {} строк экскурсий, {} горизонтов → {} точек",
        n_rows,
        len(horizons),
        len(rows),
    )
    return pl.DataFrame(rows).sort("horizon_min", maintain_order=True)


# --- Горизонт насыщения -----------------------------------------------------


def saturation_horizon(curve: pl.DataFrame, rel_threshold: float) -> int:
    """Горизонт насыщения: первый ``h``, где прирост ``q50`` < ``rel_threshold``.

    Семантика (§4.3): для лестницы горизонтов с квантилем ``q50`` — первый
    горизонт, где относительный прирост ``Δq50 / q50_prev < rel_threshold``
    (рост «гаснет»). Если рост не гаснет нигде (например чистый √t-рост при
    очень малом threshold) — возвращает последний горизонт (H_max, «насыщение
    не достигнуто»).

    Args:
        curve: кадр с колонками ``horizon_min, q50`` (от :func:`scale_curve`).
        rel_threshold: порог относительного прироста (например 0.01 = 1%).

    Returns:
        Горизонт насыщения в минутах/барах (int); ``H_max`` если насыщения нет.
    """
    c = curve.sort("horizon_min", maintain_order=True)
    h = c["horizon_min"].to_numpy().astype(np.int64)
    q50 = c["q50"].to_numpy().astype(np.float64)
    if h.shape[0] < 2:
        return int(h[-1]) if h.shape[0] else 0
    # Относительный прирост между соседними горизонтами
    with np.errstate(divide="ignore", invalid="ignore"):
        rel_growth = np.where(q50[:-1] != 0.0, np.diff(q50) / q50[:-1], np.inf)
    sat_idx = np.where(rel_growth < rel_threshold)[0]
    if sat_idx.shape[0] > 0:
        # sat_idx[0] = индекс в diff (между h[i] и h[i+1]); насыщение = h[i+1]
        return int(h[sat_idx[0] + 1])
    return int(h[-1])


# --- Память рынка: KS условная vs безусловная ------------------------------


def memory_distance(
    excursions: pl.DataFrame,
    labels: pl.DataFrame,
    label_col: str,
    condition: str,
    horizons: tuple[int, ...],
    n_boot: int = 200,
    seed: int = 42,
    value_col: str = "mfe_bps",
    block_len: int = 1,
    max_n: int = 20_000,
) -> pl.DataFrame:
    """Статистическое расстояние условной vs безусловной раздачи по h (§4.3, §5.2).

    Для каждого горизонта считает **KS-статистику** (Колмогоров-Смирнов) между
    условной раздачей (бары с ``labels[label_col] == condition``) и
    комплементарной (``labels[label_col] != condition`` — «обычное время»).
    Сравнение cond vs rest (а не cond vs all) корректно статистически: cond не
    вложено в rest → KS-тест валиден.

    **Перmutation null distribution** (а не бутстреп-CI): KS-статистика всегда
    ``≥ 0``, поэтому бутстреп-CI вокруг observed при H0 не включает 0 (выборочный
    шум). Для проверки «расстояние ≠ 0» значимо — permutation test: pooled
    cond+rest случайно перемешивается, делится на группы тех же размеров,
    считается KS; распределение под H0 даёт ``ci_lo``/``ci_hi`` (перцентили
    2.5%/97.5%) и ``p_value`` (доля permutation KS ≥ observed). Горизонт памяти
    = первый ``h``, где ``p_value ≥ 0.05`` (нуль-гипотеза не отвергается —
    «расстояние перестаёт отличаться от 0»). ``block_len > 1`` — блочная
    permutation (для автокоррелированных рядов, §7 п.5).

    ``block_len=1`` (по умолчанию) — iid-бутстреп; для автокоррелированных рядов
    (перекрывающиеся окна экскурсий, §7 п.5) — передать ``block_len > 1``
    (блочный бутстреп).

        Args:
        excursions: кадр экскурсий с list-колонкой ``value_col`` (длина =
            числу горизонтов).
        labels: кадр меток на ``bar_idx`` с колонкой ``label_col``.
        label_col: имя колонки-метки в ``labels`` (например ``"event_type"``).
        condition: значение метки для условной раздачи (например
            ``"impulse_up"``).
        horizons: лестница горизонтов (для explode / фильтра).
        n_boot: число permutation-реплик.
        seed: seed ГПСД (воспроизводимость null distribution).
        value_col: имя list-колонки экскурсий (по умолчанию ``mfe_bps``).
        block_len: длина блока permutation (1 = обычная; >1 = блочная, для
            автокорреляции).

    Returns:
        Кадр: ``horizon_min, ks_stat, ci_lo, ci_hi, p_value, n_cond, n_all`` —
        по строке на горизонт. ``ci_lo``/``ci_hi`` — перцентили permutation null
        distribution (2.5%/97.5%); ``p_value`` — доля permutation KS ≥ observed.
        Отсортирован по ``horizon_min``.
    """
    n_rows = excursions.height
    if n_rows == 0:
        return pl.DataFrame()
    horizons_list = list(horizons)
    horizons_series = pl.Series("horizon_min", [horizons_list] * n_rows, dtype=pl.List(pl.Int64))
    joined = excursions.select(["bar_idx", value_col]).join(
        labels.select(["bar_idx", label_col]), on="bar_idx", how="left"
    )
    exploded = joined.with_columns(horizon_min=horizons_series).explode(["horizon_min", value_col])
    rows: list[dict[str, object]] = []
    bl = max(1, int(block_len))
    for h in horizons:
        sub = exploded.filter(pl.col("horizon_min") == int(h))
        vals = sub[value_col].to_numpy().astype(np.float64)
        labs = sub[label_col].to_numpy().astype(object)
        finite = ~np.isnan(vals)
        vals = vals[finite]
        labs = labs[finite]
        cond_mask = labs == condition
        rest_mask = ~cond_mask
        vals_cond = vals[cond_mask]
        vals_rest = vals[rest_mask]
        n_cond = int(vals_cond.shape[0])
        n_all = int(vals_rest.shape[0])
        if n_cond < 2 or n_all < 2:
            rows.append(
                {
                    "horizon_min": int(h),
                    "ks_stat": float("nan"),
                    "ci_lo": float("nan"),
                    "ci_hi": float("nan"),
                    "p_value": float("nan"),
                    "n_cond": n_cond,
                    "n_all": n_all,
                }
            )
            continue
        ks_point = float(ks_2samp(vals_cond, vals_rest).statistic)
        # Permutation null distribution: pooled cond+rest случайно перемешивается,
        # делится на группы тех же размеров, считается KS. memory-safe реплика-цикл.
        # Для больших выборок (прод-масштаб 1.9M) permutation KS на pooled ~1M
        # × n_boot × горизонтов непрактичен — sub-sample pooled до ``max_n`` с
        # сохранением пропорции cond/rest (KS-статистика стабильна на 20k).
        pooled = np.concatenate([vals_cond, vals_rest])
        rng = np.random.default_rng(seed + int(h))
        if pooled.shape[0] > max_n:
            frac = float(max_n) / pooled.shape[0]
            keep_cond = rng.random(vals_cond.shape[0]) < frac
            keep_rest = rng.random(vals_rest.shape[0]) < frac
            vals_cond = vals_cond[keep_cond]
            vals_rest = vals_rest[keep_rest]
            n_cond = int(vals_cond.shape[0])
            pooled = np.concatenate([vals_cond, vals_rest])
            ks_point = float(ks_2samp(vals_cond, vals_rest).statistic)
        perm_ks = np.empty(n_boot, dtype=np.float64)
        for b in range(n_boot):
            perm = _block_permute(pooled, bl, rng)
            perm_ks[b] = float(ks_2samp(perm[:n_cond], perm[n_cond:]).statistic)
        ci_lo = float(np.quantile(perm_ks, _CI_LEVELS[0]))
        ci_hi = float(np.quantile(perm_ks, _CI_LEVELS[1]))
        # p-value: доля permutation KS ≥ observed (односторонний, KS > 0 = отличие)
        p_value = float((perm_ks >= ks_point).mean())
        rows.append(
            {
                "horizon_min": int(h),
                "ks_stat": ks_point,
                "ci_lo": ci_lo,
                "ci_hi": ci_hi,
                "p_value": p_value,
                "n_cond": n_cond,
                "n_all": n_all,
            }
        )
    logger.debug(
        "atlas.memory_distance: cond={!r}, {} горизонтов, n_boot={}, block_len={}",
        condition,
        len(horizons),
        n_boot,
        bl,
    )
    return pl.DataFrame(rows).sort("horizon_min", maintain_order=True)


def _block_permute(
    pooled: np.ndarray,
    block_len: int,
    rng: np.random.Generator,
) -> np.ndarray:
    """Permutation pooled-выборки (блочная при ``block_len > 1``, иначе обычная).

    ``block_len=1`` — ``rng.permutation(pooled)``; ``block_len>1`` — блоки длины
    ``block_len`` перемешиваются как целые (сохраняет локальную автокорреляцию).
    """
    n = pooled.shape[0]
    if block_len <= 1 or n <= 1:
        return rng.permutation(pooled)
    bl = min(block_len, n)
    # Разбить pooled на блоки (последний короче), перемешать индексы блоков
    block_starts = np.arange(0, n, bl)
    perm_starts = rng.permutation(block_starts)
    out = np.empty(n, dtype=pooled.dtype)
    pos = 0
    for s in perm_starts:
        end = min(int(s) + bl, n)
        chunk = pooled[int(s) : end]
        out[pos : pos + chunk.shape[0]] = chunk
        pos += chunk.shape[0]
    return out[:pos]


__all__ = [
    "calibrate_base_std",
    "memory_distance",
    "saturation_horizon",
    "scale_curve",
    "sqrt_t_neutral",
]
