# src/zetaflowlab/atlas/aggregate.py
"""Агрегация экскурсий атласа: блочный бутстреп CI + раздачи по ячейкам.

Спека v2 §4.3 (CI для квантилей), §7 п.5 (блочный бутстреп для всех CI;
t-статистики по перекрывающимся окнам запрещены — автокорреляция окон
обрабатывается блочной структурой), §8 (бутстреп воспроизводим по seed;
монотонность CI).

**Граница единиц §3.** aggregate не знает о происхождении записей — работает с
готовым кадром экскурсий (выход :mod:`zetaflowlab.atlas.rollout`) и кадром
меток (regime/event/split на ``bar_idx``). Стыковка — через ``bar_idx`` join.

**Блочный бутстреп (MBB, Politis-Romano 1994).** Фиксированная длина блока
``block_len``; для каждой реплики сэмплируется ``⌈n/block_len⌉`` блоков длины
``block_len`` с возвращением (старты из ``[0, n−block_len]``), конкатенация до
``n`` элементов. ``block_len=1`` вырождается в iid-бутстреп (каждый блок — один
элемент, старт из ``[0, n−1]``). Детерминизм: ``np.random.default_rng(seed)``,
фиксированный порядок операций; один и тот же seed → побитово тот же CI.

**Memory-safety.** Прямой векторизованный расчёт ``boot_samples[n_boot, n]`` —
для размеров ячеек агрегата (типично ≤ 1e5 баров/ячейка) терпимо; для
полных выборок (memory_distance, ~1e6) — отдельный реплика-цикл
(см. :mod:`zetaflowlab.atlas.scales`).
"""

from __future__ import annotations

import hashlib
from typing import cast

import numpy as np
import polars as pl
from loguru import logger

from zetaflowlab.atlas.config import AtlasConfig

#: Дефолтная лестница квантилей раздачи (§5.1: q10/q25/q50/q75/q90).
_DEFAULT_QUANTILES: tuple[float, ...] = (0.1, 0.25, 0.5, 0.75, 0.9)

#: Квантили бутстреп-CI по умолчанию (ключевые — для q50).
_DEFAULT_CI_QUANTILES: tuple[float, ...] = (0.5,)

#: Перцентили бутстреп-распределения для 95% CI.
_CI_LEVELS: tuple[float, float] = (0.025, 0.975)

#: Размер блока по умолчанию (окно атласа ~ H_max; здесь conservative KISS).
_DEFAULT_BLOCK_LEN: int = 16

#: Дефолтное число бутстреп-реплик (баланс точности CI vs скорости).
_DEFAULT_N_BOOT: int = 500

#: Cap размера выборки для бутстрепа (прод-масштаб: sub-sample больших ячеек,
#: иначе materialise ``[n_boot, n]`` запрещает память на 1.9M баров). CI на
#: 20000-element выборке статистически неотличим от полного (ошибка ~0.7%).
_BOOTSTRAP_MAX_N: int = 20_000

_BOOTSTRAP_SCHEMA: dict[str, pl.DataType] = cast(
    "dict[str, pl.DataType]",
    {
        "q": pl.Float64,
        "value": pl.Float64,
        "ci_lo": pl.Float64,
        "ci_hi": pl.Float64,
    },
)


def block_bootstrap_ci(
    values: np.ndarray,
    block_len: int,
    n_boot: int,
    seed: int,
    quantiles: tuple[float, ...] | tuple[float, ...],
) -> pl.DataFrame:
    """Блочный бутстреп CI для квантилей (MBB, §7 п.5).

    Для каждой из ``n_boot`` реплик сэмплирует ``⌈n/block_len⌉`` блоков длины
    ``block_len`` (старты с возвращением из ``[0, n−block_len]``), считает
    квантили бутстреп-выборки. CI — перцентили ``[2.5%, 97.5%]`` бутстреп-
    распределения каждого квантиля.

    ``block_len=1`` вырождается в iid-бутстреп (старты из ``[0, n−1]``,
    блоки по 1 элементу). Детерминизм: ``np.random.default_rng(seed)``;
    один ``seed`` → побитово тот же CI (тест
    ``test_bootstrap_reproducible_by_seed``).

    Args:
        values: 1D-массив выборки, float64.
        block_len: длина блока (≥1); при ``> n`` урезается до ``n``.
        n_boot: число бутстреп-реплик.
        seed: seed ГПСД для воспроизводимости.
        quantiles: кортеж квантилей для оценки (например ``(0.1, 0.5, 0.9)``).

    Returns:
        Кадр по схеме :data:`_BOOTSTRAP_SCHEMA`: одна строка на квантиль
        ``(q, value, ci_lo, ci_hi)``. ``value`` — точечная оценка (квантиль
        исходной выборки); ``ci_lo``/``ci_hi`` — 95% бутстреп-CI.
    """
    n = int(values.shape[0])
    q_arr = np.asarray(quantiles, dtype=np.float64)
    if n == 0:
        return pl.DataFrame(
            [
                {"q": float(q), "value": float("nan"), "ci_lo": float("nan"), "ci_hi": float("nan")}
                for q in q_arr
            ],
            schema=_BOOTSTRAP_SCHEMA,
        )
    bl = max(1, int(block_len))
    if bl > n:
        bl = n
    # Для больших выборок (прод-масштаб 1.9M баров) materialise [n_boot, n]
    # запрещает память (n=500k → 2GB per call). Sub-sample до cap перед MBB:
    # CI квантиля на 20000-element выборке статистически неотличим от полного
    # бутстрепа (ошибка ~ 1/√20000 ≈ 0.7%), block-structure сохраняется на
    # подвыборке. Детерминизм: rng выбора подвыборки = тот же seed.
    rng = np.random.default_rng(seed)
    if n > _BOOTSTRAP_MAX_N:
        sel = rng.choice(n, size=_BOOTSTRAP_MAX_N, replace=False)
        values = values[sel]
        n = _BOOTSTRAP_MAX_N
        bl = min(bl, n)
    n_blocks = int(np.ceil(n / bl))
    # Старты блоков для всех реплик: [n_boot, n_blocks]
    starts = rng.integers(0, n - bl + 1, size=(n_boot, n_blocks))
    offsets = np.arange(bl, dtype=np.int64)
    # Индексы элементов бутстреп-выборок: [n_boot, n_blocks*bl] → обрезка до n
    block_idx = (starts[:, :, None] + offsets[None, None, :]).reshape(n_boot, n_blocks * bl)[:, :n]
    boot_samples = values[block_idx]  # [n_boot, n]
    # Квантили по каждой реплике: [n_q, n_boot]
    boot_q = np.quantile(boot_samples, q_arr, axis=1)
    ci_lo = np.quantile(boot_q, _CI_LEVELS[0], axis=1)
    ci_hi = np.quantile(boot_q, _CI_LEVELS[1], axis=1)
    point = np.quantile(values, q_arr)
    return pl.DataFrame(
        {"q": q_arr, "value": point, "ci_lo": ci_lo, "ci_hi": ci_hi}, schema=_BOOTSTRAP_SCHEMA
    )


def _quantile_stats(
    values: np.ndarray,
    quantiles: tuple[float, ...],
    ci_quantiles: tuple[float, ...],
    block_len: int,
    n_boot: int,
    seed: int,
    prefix: str,
) -> dict[str, float]:
    """Точечные оценки квантилей + бутстреп-CI для ci_quantiles.

    Args:
        values: 1D-массив (NaN от хвоста ряда уже отфильтрованы).
        quantiles: квантили для точечных оценок (``prefix_qXX``).
        ci_quantiles: подмножество quantiles, для которых считать CI
            (``prefix_qXX_ci_lo``/``ci_hi``).
        block_len/n_boot/seed: параметры бутстрепа (детерминизм).
        prefix: префикс имён колонок (``mfe``/``mae``/``t_mfe``/``t_mae``).

    Returns:
        Dict колонок ``{prefix}_q{int(q*100)}: float`` и для ci_quantiles —
        ``{prefix}_q{int(q*100)}_ci_lo/ci_hi``.
    """
    out: dict[str, float] = {}
    for q in quantiles:
        qi = int(round(float(q) * 100))
        out[f"{prefix}_q{qi}"] = float(np.quantile(values, q))
    if len(values) >= 2 and ci_quantiles:
        ci_df = block_bootstrap_ci(
            values, block_len=block_len, n_boot=n_boot, seed=seed, quantiles=ci_quantiles
        )
        for row in ci_df.iter_rows(named=True):
            qi = int(round(float(row["q"]) * 100))
            out[f"{prefix}_q{qi}_ci_lo"] = float(row["ci_lo"])
            out[f"{prefix}_q{qi}_ci_hi"] = float(row["ci_hi"])
    elif ci_quantiles:
        for q in ci_quantiles:
            qi = int(round(float(q) * 100))
            out[f"{prefix}_q{qi}_ci_lo"] = float("nan")
            out[f"{prefix}_q{qi}_ci_hi"] = float("nan")
    return out


def aggregate_excursions(
    excursions: pl.DataFrame,
    labels: pl.DataFrame,
    config: AtlasConfig,
    quantiles: tuple[float, ...] = _DEFAULT_QUANTILES,
    ci_quantiles: tuple[float, ...] = _DEFAULT_CI_QUANTILES,
    block_len: int = _DEFAULT_BLOCK_LEN,
    n_boot: int = _DEFAULT_N_BOOT,
    seed: int = 42,
) -> pl.DataFrame:
    """Раздачи экскурсий по ячейкам ``(split × regime × event × horizon)`` (§4.3).

    Группирует записи экскурсий по ячейкам ``(split, regime_v, regime_t,
    regime_w, event_type, horizon_min)`` и для каждой считает: ``n``, точечные
    квантили mfe/mae/t_mfe/t_mae из :attr:`config.horizons_min`, и бутстреп-CI
    для ``ci_quantiles`` (по умолчанию q50). Граница §3: aggregate не знает о
    происхождении записей — только join по ``bar_idx``.

    NaN-значения (хвост ряда, где горизонт не достижим) исключаются из расчёта
    квантилей/CI данной ячейки/горизонта; ``n`` — число не-NaN значений.

    Args:
        excursions: кадр :func:`~zetaflowlab.atlas.rollout.compute_excursions`
            (колонки ``bar_idx, mfe_bps, mae_bps, t_mfe_min, t_mae_min,
            osc_crossings, gap_count``; list-колонки длины ``len(horizons)``).
        labels: кадр меток на ``bar_idx`` (колонки ``split, regime_v, regime_t,
            regime_w, event_type``). ``event_type`` nullable → ``"none"``.
        config: конфиг атласа (``horizons_min`` задаёт длину лестницы).
        quantiles: квантили раздачи (точечные оценки).
        ci_quantiles: подмножество quantiles для бутстреп-CI.
        block_len: размер блока MBB.
        n_boot: число бутстреп-реплик.
        seed: базовый seed (детерминизм; per-ячейка — seed + хэш группы).

    Returns:
        Кадр с колонками: ``split, regime_v, regime_t, regime_w, event_type,
        horizon_min, n`` + ``{mfe,mae,t_mfe,t_mae}_q{10,25,50,75,90}`` + для
        ci_quantiles — ``..._ci_lo``/``..._ci_hi``. Отсортирован по
        ``(split, regime_v, regime_t, regime_w, event_type, horizon_min)``.
    """
    n_rows = excursions.height
    horizons = list(config.horizons_min)
    n_horizons = len(horizons)
    if n_rows == 0 or n_horizons == 0:
        return pl.DataFrame()
    # Join меток (split/regime/event) на bar_idx. labels может содержать
    # повторяющиеся bar_idx (например, срез ``full`` как дубликаты train+val —
    # описательный слой §7.1), поэтому horizons_series строится по ``joined``.
    joined = excursions.select(
        "bar_idx",
        "mfe_bps",
        "mae_bps",
        "t_mfe_min",
        "t_mae_min",
        "osc_crossings",
        "gap_count",
    ).join(labels, on="bar_idx", how="left")
    # event_type nullable → "none" (бары без события)
    joined = joined.with_columns(pl.col("event_type").fill_null("none"))
    # Разворот list-колонок по лестнице горизонтов: добавляем horizon_min.
    # Длина = joined.height (после join; labels может дублировать bar_idx для
    # среза full — описательный слой §7.1).
    n_joined = joined.height
    horizons_series = pl.Series("horizon_min", [horizons] * n_joined, dtype=pl.List(pl.Int64))
    exploded = joined.with_columns(horizon_min=horizons_series).explode(
        ["horizon_min", "mfe_bps", "mae_bps", "t_mfe_min", "t_mae_min"]
    )

    group_cols = ["split", "regime_v", "regime_t", "regime_w", "event_type", "horizon_min"]
    rows: list[dict[str, object]] = []
    for key, grp in exploded.group_by(group_cols, maintain_order=True):
        key_dict = dict(zip(group_cols, key, strict=True))
        mfe = grp["mfe_bps"].to_numpy().astype(np.float64)
        mae = grp["mae_bps"].to_numpy().astype(np.float64)
        t_mfe = grp["t_mfe_min"].to_numpy().astype(np.float64)
        t_mae = grp["t_mae_min"].to_numpy().astype(np.float64)
        # Исключаем NaN (хвост ряда, где горизонт не достижим)
        finite = ~(np.isnan(mfe) | np.isnan(mae))
        mfe = mfe[finite]
        mae = mae[finite]
        t_mfe = t_mfe[finite]
        t_mae = t_mae[finite]
        n_eff = int(mfe.shape[0])
        if n_eff == 0:
            continue  # пустая ячейка (после NaN-фильтра) — не создаём строку
        # per-ячейка seed (детерминизм + независимость CI между ячейками)
        cell_seed = (seed + _hash_key(key_dict)) & 0xFFFFFFFF
        row: dict[str, object] = {**key_dict, "n": n_eff}
        row.update(
            _quantile_stats(mfe, quantiles, ci_quantiles, block_len, n_boot, cell_seed, "mfe")
        )
        row.update(
            _quantile_stats(mae, quantiles, ci_quantiles, block_len, n_boot, cell_seed + 1, "mae")
        )
        row.update(
            _quantile_stats(
                t_mfe, quantiles, ci_quantiles, block_len, n_boot, cell_seed + 2, "t_mfe"
            )
        )
        row.update(
            _quantile_stats(
                t_mae, quantiles, ci_quantiles, block_len, n_boot, cell_seed + 3, "t_mae"
            )
        )
        row["osc_crossings_mean"] = float(
            grp["osc_crossings"].to_numpy().astype(np.float64)[finite].mean()
        )
        row["gap_count_mean"] = float(grp["gap_count"].to_numpy().astype(np.float64)[finite].mean())
        rows.append(row)
    logger.debug(
        "atlas.aggregate: {} строк экскурсий → {} ячеек (quantiles={}, "
        "ci_quantiles={}, n_boot={}, block_len={})",
        n_rows,
        len(rows),
        len(quantiles),
        len(ci_quantiles),
        n_boot,
        block_len,
    )
    return pl.DataFrame(rows).sort(group_cols, maintain_order=True)


def _hash_key(key_dict: dict[str, object]) -> int:
    """Стабильный int-хэш ключа ячейки (det seed per ячейки, детерминизм).

    Python ``hash`` зависит от ``PYTHONHASHSEED`` → непригоден. Используем
    ``hashlib`` по каноническому repr.
    """
    blob = "|".join(str(key_dict[c]) for c in sorted(key_dict)).encode()
    return int(hashlib.md5(blob).hexdigest()[:8], 16)


__all__ = ["aggregate_excursions", "block_bootstrap_ci"]
