# src/zetaflowlab/atlas/run.py
"""Оркестрация прогона атласа инструмента (спека v2 §3, §5, §6, §7, §9).

Полный конвейер:

1. **бары** → загрузка OHLC из ``bars_1m_enriched.parquet``;
2. **режимы** (``_compute_regimes``) — V×T×W на M1-сетке через primitives
   (atr_mtf/ker/sliding_thresholds), БЕЗ ZC-зависимости (атлас измеряет
   инструмент без предположений о стиле, §1–§2); параметры = дефолты портрета;
3. **rollout** (:func:`~zetaflowlab.atlas.rollout.compute_excursions`) —
   раздача экскурсий от каждого бара;
4. **события** (:func:`~zetaflowlab.atlas.events.detect_impulses`) — δ-импульсы
   (каузально); метка ``event_type`` на бар;
5. **split** (``_build_split_labels``) — blocked CV (недельные блоки,
   стратифицированные по V) + embargo ≥ H_max + OOS-хвост (52 недели, §7 п.4);
   решающий слой — train-фолды, описательный — train+val (атлас OOS не видит);
6. **aggregate** (:func:`~zetaflowlab.atlas.aggregate.aggregate_excursions`) —
   раздачи по ячейкам (split × режим × событие × горизонт) с бутстреп-CI;
7. **scales** (:func:`~zetaflowlab.atlas.scales`) — кривая масштаба vs √t,
   насыщение, память (KS+permutation);
8. **rotation** (:func:`~zetaflowlab.atlas.rotation`) — ситуации, кривые
   загрузки (номинальная + эффективная через синхронность);
9. **gaps/costs** (:mod:`zetaflowlab.atlas.gaps`/:mod:`zetaflowlab.atlas.costs`)
   — риск-слой гэпов, пол позитивности;
10. **карта стилей + вердикт** (:mod:`zetaflowlab.atlas.artifact`) — §5.4, §5.5,
    §9.3 (пороги конфига, BH-FDR по семейству ячеек);
11. **артефакты** (§6) — ``atlas_cells.parquet``, ``verdict.yaml``, ``atlas_report.md``.

Детерминизм (AGENTS.md §2.2): одинаковые (cfg, данные, seed) → байтово
идентичные ``verdict.yaml``/``atlas_cells.parquet``.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

import numpy as np
import polars as pl
import yaml
from loguru import logger

from zetaflowlab.atlas.aggregate import aggregate_excursions
from zetaflowlab.atlas.artifact import (
    STYLE_BANDS,
    build_verdict,
    representative_horizon,
    write_atlas_artifacts,
)
from zetaflowlab.atlas.config import AtlasConfig
from zetaflowlab.atlas.costs import floor_curve
from zetaflowlab.atlas.events import detect_impulses
from zetaflowlab.atlas.gaps import extract_gaps, gap_summary
from zetaflowlab.atlas.rollout import compute_excursions
from zetaflowlab.atlas.rotation import (
    effective_loading,
    loading_curve,
    synchrony,
)
from zetaflowlab.atlas.scales import (
    calibrate_base_std,
    memory_distance,
    saturation_horizon,
    scale_curve,
    sqrt_t_neutral,
)
from zetaflowlab.data.resample import resample_causal
from zetaflowlab.features.indicators.ker import ker
from zetaflowlab.features.mtf import atr_mtf, map_higher_tf_feature
from zetaflowlab.features.regime import sliding_thresholds
from zetaflowlab.optimization.splits import (
    Block,
    assign_blocks_stratified,
    build_blocks,
)

# --- Режимы V×T×W (параметры = дефолты портрета; DRY с portrait/regimes.py) ---

#: Размер аналитического sub-sample (баров) для memory-heavy этапов на 1.9M.
#: Систематический stratified sub-sample: квантили/CI на 300k стабильны
#: (SE ~ 1/√300k ≈ 0.2%); «вся история» покрыта равномерно (каждый k-й бар).
_ANALYTICS_SAMPLE_N: int = 300_000

#: Длина блока permutation для memory_distance (§7 п.5 — блочная permutation
#: для автокоррелированных перекрывающихся экскурсий). ~1 торговая неделя FX
#: (7×1440 мин = 10080). В элементах pooled это значение/``sample_step`` (sub-
#: sample разрежает ряд; блок ~ недели исходного времени сохраняет автокорреляцию).
_PERM_BLOCK_MIN: int = 10_080

_H1_SLOT_MINUTES: int = 60
_REGIME_QUANTILE_WINDOW: int = 43_200  # 30d × 1440 (portrait default)
_REGIME_QUANTILE_MIN: int = 20_160  # 14d
_REGIME_ATR_WINDOW: int = 14
_REGIME_KER_WINDOW: int = 14
_REGIME_ATR_TF: str = "H1"

#: Маппинг «нижний регистр масштаба» (atr_scales конфига) → ключ TIMEFRAMES.
_SCALE_TO_TF: dict[str, str] = {
    "1h": "H1",
    "4h": "H4",
    "1d": "D1",
    "3d": "D3",
    "1w": "W1",
}


def _tertile_labels(
    values: pl.Series,
    q_lo: pl.Series,
    q_hi: pl.Series,
    names: tuple[str, str, str],
    unknown: str = "UNKNOWN",
) -> pl.Series:
    """Метка тертиля по скользящим порогам (DRY с portrait/regimes.py).

    Args:
        values: ряд-источник меток (ATR_bps или KER).
        q_lo: нижний порог (скользящий квантиль 1/3 из прошлого).
        q_hi: верхний порог (2/3).
        names: метки ``(низкий, средний, высокий)``.
        unknown: метка прогрева (null-пороги/значение).

    Returns:
        Ряд строковых меток (``names`` или ``unknown``).
    """
    v = values.to_numpy()
    lo = q_lo.to_numpy()
    hi = q_hi.to_numpy()
    out = np.full(values.len(), unknown, dtype=object)
    with np.errstate(invalid="ignore"):
        known = ~(np.isnan(lo) | np.isnan(hi) | np.isnan(v))
        out[known & (v <= lo)] = names[0]
        out[known & (v > lo) & (v <= hi)] = names[1]
        out[known & (v > hi)] = names[2]
    return pl.Series(out, dtype=pl.String)


def _compute_regimes(bars: pl.DataFrame) -> pl.DataFrame:
    """Колонки режимов V×T×W на M1-сетке (без ZC-зависимости).

    Аналог :func:`zetaflowlab.portrait.regimes.compute_portrait_features`, но без
    привязки к ZC-конфигу (атлас измеряет инструмент, §1–§2). Параметры
    режимов — дефолты портрета (константы выше). ``valid`` — не warmup и режим
    известен; потребитель фильтрует старты по нему.

    Args:
        bars: M1-бары с OHLCV (``timestamp, open, high, low, close``).

    Returns:
        Кадр ``timestamp, regime_v, regime_t, regime_w, atr_1h, valid``.
    """
    atr_1h = atr_mtf(bars, _REGIME_ATR_TF, _REGIME_ATR_WINDOW, "atr_1h")
    agg = resample_causal(bars, _REGIME_ATR_TF)
    ker_vals = agg.with_columns(ker_1h=ker(agg["close"], _REGIME_KER_WINDOW))
    ker_1h = map_higher_tf_feature(bars, ker_vals, _H1_SLOT_MINUTES, "ker_1h")
    atr_bps = atr_1h / bars["close"] * 1e4
    w, m = _REGIME_QUANTILE_WINDOW, _REGIME_QUANTILE_MIN
    q33 = sliding_thresholds(atr_bps, 1 / 3, w, m)
    q66 = sliding_thresholds(atr_bps, 2 / 3, w, m)
    k33 = sliding_thresholds(ker_1h, 1 / 3, w, m)
    k66 = sliding_thresholds(ker_1h, 2 / 3, w, m)
    regime_v = _tertile_labels(atr_bps, q33, q66, ("V1", "V2", "V3"))
    regime_t = _tertile_labels(ker_1h, k33, k66, ("T1", "T2", "T3"))
    return (
        bars.with_columns(atr_1h=atr_1h, ker_1h=ker_1h, regime_v=regime_v, regime_t=regime_t)
        .with_columns(
            regime_w=(
                pl.when(pl.col("timestamp").dt.hour() < 8)
                .then(pl.lit("asia"))
                .when(pl.col("timestamp").dt.hour() < 16)
                .then(pl.lit("london"))
                .otherwise(pl.lit("ny"))
            ),
            valid=(
                (pl.col("regime_v") != "UNKNOWN")
                & (pl.col("regime_t") != "UNKNOWN")
                & pl.col("atr_1h").is_not_null()
            ),
        )
        .select("timestamp", "regime_v", "regime_t", "regime_w", "atr_1h", "valid")
    )


def _atr_scales_frame(bars: pl.DataFrame, scales: tuple[str, ...]) -> pl.DataFrame:
    """ATR-линейки для нормировки (§2, §5.6): ATR(window=14) на каждом масштабе.

    Args:
        bars: M1-бары.
        scales: масштабы (``"1h".."1w"``) — маппятся в ключи TIMEFRAMES.

    Returns:
        Кадр ``timestamp + atr_<scale>_bps`` (нормировка пола в режимные ATR).
    """
    out = bars.select("timestamp")
    for sc in scales:
        tf = _SCALE_TO_TF.get(sc)
        if tf is None:
            logger.warning("atr_scales: неизвестный масштаб {} — пропущен", sc)
            continue
        col = f"atr_{sc}_bps"
        atr_series = atr_mtf(bars, tf, _REGIME_ATR_WINDOW, col)
        out = out.with_columns((atr_series / bars["close"] * 1e4).alias(col))
    return out


# --- Split: blocked CV + embargo + OOS-хвост (§7) ----------------------------


def _block_strata(
    blocks: list[Block],
    ts: np.ndarray,
    regime_v: np.ndarray,
    valid: np.ndarray,
) -> list[str]:
    """Доминирующий regime_v среди валидных баров блока (для стратификации).

    Args:
        blocks: недельные блоки.
        ts: ``datetime64`` времён баров.
        regime_v: метки V по барам.
        valid: маска валидных баров.

    Returns:
        Список страт длины ``len(blocks)`` (модальный regime_v, ``UNKNOWN`` если нет).
    """
    strata: list[str] = []
    for b in blocks:
        lo = int(np.searchsorted(ts, b.start))
        hi = int(np.searchsorted(ts, b.end))
        ok = valid[lo:hi]
        if not bool(ok.any()):
            strata.append("UNKNOWN")
            continue
        v = regime_v[lo:hi][ok].astype(str)
        vals, counts = np.unique(v, return_counts=True)
        strata.append(str(vals[int(np.argmax(counts))]))
    return strata


def _build_split_labels(
    bars: pl.DataFrame,
    regimes: pl.DataFrame,
    config: AtlasConfig,
) -> pl.DataFrame:
    """Метка split каждого бара: ``train``/``val`` (описательный ``full`` дубликат).

    Blocked CV (§7 п.2): недельные блоки, стратифицированные по regime_v.
    OOS-хвост (§7 п.4): последние ``oos_weeks`` недель по времени — не входит в
    train/val/full (атлас OOS не видит). Embargo (§7 п.2): train-бары, чьё окно
    экскурсии ``[t, t+embargo_min]`` заходит в val/oos-блок → ``skip``
    (окна экскурсий не пересекают границы фолдов; ``embargo_min = max(h_max,
    embargo_trading_days·trading_day_minutes)``).

    Описательный ``full`` = дубликаты train+val баров (aggregate сделает срез
    full отдельно по этой метке).

    Args:
        bars: M1-бары (с timestamp).
        regimes: кадр режимов (выровненный по bars).
        config: конфиг (validation, h_max_minutes, trading_day_minutes).

    Returns:
        Кадр ``bar_idx, split, regime_v, regime_t, regime_w, event_type(nullable)``
        для баров train+val+full (skip/oos исключены).
    """
    ts = bars["timestamp"].to_numpy().astype("datetime64[us]")
    regime_v = regimes["regime_v"].to_numpy().astype(object)
    regime_t = regimes["regime_t"].to_numpy().astype(object)
    regime_w = regimes["regime_w"].to_numpy().astype(object)
    valid = regimes["valid"].to_numpy().astype(bool)

    blocks = build_blocks(ts, min_bars=1000)
    # OOS-хвост: последние oos_weeks блоков по времени.
    oos_weeks = config.validation.oos_weeks
    blocks_sorted = sorted(blocks, key=lambda b: b.start)
    oos_blocks = set(blocks_sorted[-oos_weeks:]) if len(blocks_sorted) > oos_weeks else set()
    cv_blocks = [b for b in blocks if b not in oos_blocks]

    strata = _block_strata(cv_blocks, ts, regime_v, valid)
    assignment = assign_blocks_stratified(
        cv_blocks, strata, seed=config.seed, train_frac=0.8, val_frac=0.2
    )

    embargo_min = max(
        config.h_max_minutes,
        config.validation.embargo_trading_days * config.trading_day_minutes,
    )
    embargo_td = np.timedelta64(int(embargo_min), "m")

    # Метка per bar: train/val/skip/oos.
    n = bars.height
    split = np.full(n, "skip", dtype=object)
    for b in assignment.train:
        mask = (ts >= b.start) & (ts < b.end)
        split[mask] = "train"
    for b in assignment.val:
        mask = (ts >= b.start) & (ts < b.end)
        split[mask] = "val"
    for b in oos_blocks:
        mask = (ts >= b.start) & (ts < b.end)
        split[mask] = "oos"

    # Embargo: train-бары, чьё окно заходит в val/oos → skip. Окно [t, t+embargo]
    # пересекает блок b если t < b.start <= t + embargo (t в train перед val/oos).
    val_oos_starts = np.array(
        [b.start for b in (*assignment.val, *oos_blocks)], dtype="datetime64[us]"
    )
    train_idx = np.flatnonzero(split == "train")
    for i in train_idx:
        t_end = ts[i] + embargo_td
        if val_oos_starts.shape[0] and bool(
            np.any((val_oos_starts > ts[i]) & (val_oos_starts <= t_end))
        ):
            split[i] = "skip"

    bar_idx = np.arange(n, dtype=np.int64)
    base = pl.DataFrame(
        {
            "bar_idx": bar_idx,
            "split": pl.Series(split, dtype=pl.Utf8),
            "regime_v": pl.Series(regime_v, dtype=pl.Utf8),
            "regime_t": pl.Series(regime_t, dtype=pl.Utf8),
            "regime_w": pl.Series(regime_w, dtype=pl.Utf8),
        }
    )
    # Описательный слой «вся история» = train + val (атлас OOS не видит, §7 п.1/4).
    # ``full``-дубликаты не создаём: на 1.9M баров explode×20×дубликат даёт ~60M
    # строк и OOM; verdict/карта стилей используют train, стационарность — val
    # (оба среза есть в cells_df). Потребитель «вся история» = train ∪ val.
    return base.filter(pl.col("split").is_in(["train", "val"])).sort(
        "bar_idx", maintain_order=True)


def _attach_events(labels: pl.DataFrame, events: pl.DataFrame) -> pl.DataFrame:
    """Приjoinить event_type (impulse_up/down) к labels по bar_idx.

    На баре может быть несколько событий (разные δ/w); берём первое (самое раннее
    по сортировке events). Бары без события → ``null`` (aggregate → ``"none"``).

    Args:
        labels: кадр меток (от :func:`_build_split_labels`).
        events: кадр событий (от :func:`detect_impulses`).

    Returns:
        ``labels`` с колонкой ``event_type`` (nullable).
    """
    if events.height == 0:
        return labels.with_columns(pl.lit(None, dtype=pl.Utf8).alias("event_type"))
    first_evt = events.group_by("bar_idx", maintain_order=True).first()
    return labels.join(first_evt.select("bar_idx", "event_type"), on="bar_idx", how="left")


# --- Ячейки стиль × режим: входы для вердикта (§9.3) -------------------------


def _style_cell_inputs(
    excursions: pl.DataFrame,
    labels: pl.DataFrame,
    floors: dict[int, float],
    horizons: tuple[int, ...],
    config: AtlasConfig,
) -> tuple[list[dict[str, Any]], pl.DataFrame, float]:
    """Собрать входы ячеек стиль × regime_v (split=train) для :func:`build_verdict`.

    Для каждого стиля (репрезентативный горизонт ``h_rep``) и regime_v ∈ {V1,V2,V3}:
    на.train-барах собирает ``offer = amplitude[h_rep] − floor[h_rep]``,
    ``floor_coverage``, ``density_per_week``, risk (q95 osc/gap), loading. Также
    возвращает маску ситуаций (для кривых загрузки) и номинальную загрузку стиля.

    Args:
        excursions: кадр :func:`compute_excursions`.
        labels: кадр меток (train/val/full + regimes + event).
        floors: пол позитивности по горизонтам (long direction).
        horizons: лестница горизонтов.
        config: конфиг (seed, trading_day_minutes).

    Returns:
        ``(cell_inputs, situations_train, loading_nominal_pct)`` — входы ячеек,
        маска ситуаций (для загрузки/синхронности), номинальная загрузка (макс по
        стилям с ситуациями).
    """
    horizons_list = list(horizons)
    # Join excursions × train-метки, затем horizons_series длиной = joined.height
    # (train bar_idx уникальны, но длина join может отличаться от excursions).
    joined = (
        excursions.select(
            "bar_idx",
            "mfe_bps",
            "mae_bps",
            "t_mfe_min",
            "osc_max_subswing_amp_bps",
            "gap_max_bps",
        )
        .join(labels.filter(pl.col("split") == "train"), on="bar_idx", how="inner")
    )
    horizons_series = pl.Series(
        "horizon_min", [horizons_list] * joined.height, dtype=pl.List(pl.Int64))
    joined = joined.with_columns(horizon_min=horizons_series).explode(
        ["horizon_min", "mfe_bps", "mae_bps", "t_mfe_min"])
    n_train_bars = labels.filter(pl.col("split") == "train").height
    week_minutes = 7 * config.trading_day_minutes
    n_weeks = max(1.0, n_train_bars / week_minutes)

    cell_inputs: list[dict[str, Any]] = []
    all_situations: list[pl.DataFrame] = []
    loading_max = 0.0
    for name, _lo, _hi in STYLE_BANDS:
        h_rep = representative_horizon(name, horizons)
        floor_rep = floors.get(h_rep, float("inf"))
        for rv in ("V1", "V2", "V3"):
            sub = joined.filter((pl.col("horizon_min") == h_rep) & (pl.col("regime_v") == rv))
            if sub.height == 0:
                cell_inputs.append(_empty_cell_input(name, rv, h_rep))
                continue
            mfe = sub["mfe_bps"].to_numpy().astype(np.float64)
            mae = sub["mae_bps"].to_numpy().astype(np.float64)
            finite = ~(np.isnan(mfe) | np.isnan(mae))
            mfe = mfe[finite]
            mae = mae[finite]
            sub_f = sub.filter(pl.Series("finite", finite))
            amplitude = np.maximum(mfe, -mae)
            offer = amplitude - floor_rep
            floor_cov_pct = float((amplitude >= floor_rep).mean() * 100.0)
            n_sit = int((amplitude >= floor_rep).sum())
            density = n_sit / n_weeks
            osc = sub_f["osc_max_subswing_amp_bps"].to_numpy().astype(np.float64)
            gap = sub_f["gap_max_bps"].to_numpy().astype(np.float64)

            cell_inputs.append(
                {
                    "style": name,
                    "regime_v": rv,
                    "horizon_min": h_rep,
                    "n": int(mfe.shape[0]),
                    "offer_bps": offer,
                    "floor_coverage_pct": floor_cov_pct,
                    "density_per_week": density,
                    "risk_osc_q95_bps": float(np.quantile(osc, 0.95)),
                    "risk_gap_q95_bps": float(np.quantile(gap, 0.95)),
                    "loading_nominal_pct": 0.0,  # заполним ниже (одно на стиль)
                    "block_len": 16,
                    "n_boot": 200,
                    "seed": (config.seed + _cell_seed(name, rv)) & 0xFFFFFFFF,
                }
            )
        # Загрузка/синхронность на стиле (h_rep, все regime, train).
        style_sub = joined.filter(pl.col("horizon_min") == h_rep)
        if style_sub.height > 0:
            mfe_s = style_sub["mfe_bps"].to_numpy().astype(np.float64)
            mae_s = style_sub["mae_bps"].to_numpy().astype(np.float64)
            fin = ~(np.isnan(mfe_s) | np.isnan(mae_s))
            amp_s = np.maximum(mfe_s[fin], -mae_s[fin])
            offer_s = amp_s - floor_rep
            t_mfe_s = style_sub.filter(pl.Series("fin", fin))["t_mfe_min"].to_numpy()
            dirs = np.where(mfe_s[fin] >= -mae_s[fin], "up", "down")
            sits = pl.DataFrame(
                {
                    "bar_idx": style_sub.filter(pl.Series("fin", fin))["bar_idx"],
                    "t_mfe_min": t_mfe_s,
                    "offer_bps": offer_s,
                    "direction": pl.Series(dirs, dtype=pl.Utf8),
                }
            ).filter(pl.col("offer_bps") >= 0.0)
            lc = loading_curve(sits, [0.0], total_minutes=n_train_bars)
            loading_pct = float(lc["loading_pct"][0]) if lc.height > 0 else 0.0
            loading_max = max(loading_max, loading_pct)
            all_situations.append(sits.with_columns(pl.lit(name).alias("style")))
            # Заполнить loading_nominal_pct в cell_inputs этого стиля (одно на стиль).
            for ci in cell_inputs:
                if ci["style"] == name:
                    ci["loading_nominal_pct"] = loading_pct

    situations_train = (
        pl.concat(all_situations, how="vertical") if all_situations else pl.DataFrame()
    )
    return cell_inputs, situations_train, loading_max


def _empty_cell_input(style: str, regime_v: str, horizon_min: int) -> dict[str, Any]:
    """Пустая ячейка (нет train-баров в режиме): все статистики 0/NaN, не viable."""
    return {
        "style": style,
        "regime_v": regime_v,
        "horizon_min": horizon_min,
        "n": 0,
        "offer_bps": np.empty(0, dtype=np.float64),
        "floor_coverage_pct": 0.0,
        "density_per_week": 0.0,
        "risk_osc_q95_bps": float("nan"),
        "risk_gap_q95_bps": float("nan"),
        "loading_nominal_pct": 0.0,
        "block_len": 16,
        "n_boot": 200,
        "seed": 0,
    }


def _cell_seed(style: str, regime_v: str) -> int:
    """Детерминированный int-seed для ячейки (независимость CI между ячейками)."""
    blob = f"{style}|{regime_v}".encode()
    return int(hashlib.md5(blob).hexdigest()[:8], 16)


# --- Проверка предсказаний П1–П5 (§9.2) --------------------------------------


def _check_predictions(
    scale_curve_full: pl.DataFrame,
    base_std_bps: float,
    sat_horizon: int,
    mem_dir_horizon: int,
    mem_vol_horizon: int,
    gap_summary_df: pl.DataFrame,
    cell_offers_by_style: dict[str, float],
    atr_1d_bps: float,
    config: AtlasConfig,
) -> dict[str, str]:
    """Проверка предсказаний П1–П5 по форме вилки (§9.2): совпадение/расхождение.

    Каждое предсказание → ``"совпадение: <факт>"`` или ``"расхождение: <факт>"``
    с измеренной опорой. Прогноз без «кона» не публикуется (§9.2 — П загрузка
    удалена; C4 — открытое, решает G3).

    Args:
        scale_curve_full: кривая масштаба (описательная).
        base_std_bps: σ базового шага (для √t-эталона).
        sat_horizon: горизонт насыщения.
        mem_dir_horizon: память (направление).
        mem_vol_horizon: память (волатильность).
        gap_summary_df: сводка гэпов.
        cell_offers_by_style: средний offer по стилям.
        atr_1d_bps: ATR 1d (bps) для масштаба гэпа.
        config: конфиг (horizons_min).

    Returns:
        Dict ``{"П1": verdict_str, ...}``.
    """
    preds: dict[str, str] = {}
    horizons = np.array(config.horizons_min, dtype=np.float64)
    sqrt_t = sqrt_t_neutral(horizons, base_step_min=1, base_std_bps=base_std_bps)
    if scale_curve_full.height > 0 and "q50" in scale_curve_full.columns:
        h_df = scale_curve_full["horizon_min"].to_numpy().astype(np.float64)
        q50 = scale_curve_full["q50"].to_numpy().astype(np.float64)
        ratio = np.empty_like(q50)
        with np.errstate(divide="ignore", invalid="ignore"):
            for i, h in enumerate(h_df):
                j = int(np.argmin(np.abs(horizons - h)))
                ratio[i] = q50[i] / sqrt_t[j] if sqrt_t[j] > 0 else np.nan
        # П1: кривая ниже √t на минутах-часах (h ≤ 480).
        near = ratio[h_df <= 480]
        p1 = bool(near.shape[0] > 0 and np.nanmean(near) < 1.0)
        preds["П1"] = (
            f"{'совпадение' if p1 else 'расхождение'}: q50/√t на h≤8ч "
            f"= {float(np.nanmean(near)) if near.shape[0] else float('nan'):.2f}"
            f" ({'<1 — ниже нейтрали' if p1 else '≥1'})"
        )
        # П2: перелом к нейтрали на днях; ≈√t на 1–2 нед; память вол > напр.
        swing = ratio[(h_df >= 7200) & (h_df <= 14400)]
        swing_ok = bool(swing.shape[0] > 0 and abs(float(np.nanmean(swing)) - 1.0) < 0.3)
        mem_vol_longer = mem_vol_horizon > mem_dir_horizon
        p2 = bool(swing_ok and mem_vol_longer)
        preds["П2"] = (
            f"{'совпадение' if p2 else 'расхождение'}: q50/√t на 1–2 недях "
            f"= {float(np.nanmean(swing)) if swing.shape[0] else float('nan'):.2f}; "
            f"память V({mem_vol_horizon}) {'>' if mem_vol_longer else '≤'} "
            f"направл({mem_dir_horizon})"
        )
        # П3: максимум offer — в свинг/позиционной.
        if cell_offers_by_style:
            best = max(cell_offers_by_style, key=cell_offers_by_style.get)  # type: ignore[arg-type]
            p3 = best in ("swing_2_5d", "positional_1_2w")
            preds["П3"] = (
                f"{'совпадение' if p3 else 'расхождение'}: максимум offer "
                f"в стиле «{best}» ({cell_offers_by_style[best]:.1f} bps)"
            )
        # Насыщение — справочно.
        preds["П0_насыщение"] = f"измерено: горизонт насыщения = {sat_horizon} мин"
    else:
        preds["П1"] = "расхождение: нет данных кривой масштаба"
        preds["П2"] = "расхождение: нет данных кривой масштаба"
        preds["П3"] = "расхождение: нет данных offer"

    # П4: δ-импульсы — проверяется в run через memory_distance (тут заглушка-метка).
    preds["П4"] = f"см. memory_distance в отчёте (направление: память до {mem_dir_horizon} мин)"
    # П5: гэпы — медиана мала vs ATR_d, недельный хвост значим.
    if gap_summary_df.height > 0 and atr_1d_bps > 0:
        wk = gap_summary_df.filter(pl.col("kind") == "weekend")
        ond = gap_summary_df.filter(pl.col("kind") == "overnight")
        wk_q95 = float(wk["q95_abs_bps"][0]) if wk.height > 0 else 0.0
        on_q50 = float(ond["q50_abs_bps"][0]) if ond.height > 0 else 0.0
        median_small = on_q50 < atr_1d_bps
        wk_tail = wk_q95 > on_q50
        p5 = bool(median_small and wk_tail)
        preds["П5"] = (
            f"{'совпадение' if p5 else 'расхождение'}: overnight q50={on_q50:.1f} "
            f"bps {'<' if median_small else '≥'} ATR_d={atr_1d_bps:.1f}; "
            f"weekend q95={wk_q95:.1f} {'>' if wk_tail else '≤'} overnight q50"
        )
    else:
        preds["П5"] = "расхождение: нет данных гэпов / ATR_d"
    return preds


# --- Оркестрация ------------------------------------------------------------


def run_atlas(
    cfg_path: Path,
    data_root: Path,
    out_override: Path | None = None,
) -> dict[str, Path]:
    """Полный прогон атласа: бары → rollout → метки → aggregate → scales →
    rotation → gaps/costs → карта стилей → вердикт → артефакты.

    Детерминирован: одинаковые (cfg, данные, seed) → байтово идентичные
    ``verdict.yaml`` и ``atlas_cells.parquet``.

    Args:
        cfg_path: путь к YAML-конфигу атласа (:class:`AtlasConfig`).
        data_root: корень данных (пути ``data/parquet/...`` разрешаются от него).
        out_override: каталог артефактов вместо ``cfg.out_dir`` (для тестов).

    Returns:
        Словарь ``{"cells", "verdict", "report"}`` с путями артефактов.
    """
    cfg = _load_config(cfg_path)
    bars_path = data_root / "data/parquet/bars_1m_enriched.parquet"
    bars = pl.read_parquet(bars_path)
    logger.info("атлас: загружено {} баров ({})", bars.height, bars_path)

    # 2. Режимы V×T×W (без ZC-зависимости).
    regimes = _compute_regimes(bars)
    logger.info("атлас: режимы посчитаны (valid={})", regimes["valid"].sum())

    # 3. Rollout экскурсий.
    excursions = compute_excursions(bars, cfg)
    logger.info("атлас: rollout → {} записей", excursions.height)

    # Аналитический sub-sample для memory-heavy этапов (aggregate/scales/
    # style_inputs/memory): на 1.9M баров explode×20 = 37M строк × несколько
    # проходов → OOM. Детерминированный систематический sub-sample (каждый
    # k-й бар, stratified по времени) — квантили/CI на 300k стабильны (ошибка
    # <0.2%); «вся история» покрыта равномерно. bars (calibrate/gaps/atr) —
    # полный, без sub-sample (там нет explode).
    sample_step = max(1, excursions.height // _ANALYTICS_SAMPLE_N)
    excursions_an = excursions.filter(
        pl.Series("keep", np.arange(excursions.height) % sample_step == 0))
    logger.info(
        "атлас: аналитический sub-sample {} (step={}, из {})",
        excursions_an.height, sample_step, excursions.height)

    # 4. События-импульсы (каузально).
    events = detect_impulses(bars, cfg)

    # 5. Split (blocked CV + embargo + OOS-хвост) + режимы + события.
    labels_base = _build_split_labels(bars, regimes, cfg)
    labels = _attach_events(labels_base, events)

    # 6. Aggregate (раздачи по ячейкам, train+val) на sub-sample.
    tv_bar_idx = labels_base["bar_idx"].unique()
    excursions_an_tv = excursions_an.join(
        pl.DataFrame({"bar_idx": tv_bar_idx}), on="bar_idx", how="inner")
    cells_df = aggregate_excursions(excursions_an_tv, labels, cfg, seed=cfg.seed)
    logger.info("атлас: aggregate → {} ячеек", cells_df.height)

    # 7. Scales (кривая масштаба, насыщение, память) на sub-sample.
    scale_full = scale_curve(excursions_an, cfg.horizons_min)
    base_std = calibrate_base_std(bars)
    sat_h = saturation_horizon(scale_full, rel_threshold=0.05) if scale_full.height else 0
    # Память: волатильность (regime_v V3 vs rest) и направление (event impulse_up).
    # Блочная permutation (~неделя, §7 п.5) — перекрывающиеся окна экскурсий
    # автокоррелированы; iid permutation (block_len=1) занижала бы p-value.
    # block_len в элементах pooled = неделя/``sample_step`` (sub-sample разрежает).
    perm_block_len = max(1, _PERM_BLOCK_MIN // sample_step)
    logger.info(
        "атлас: блочная permutation памяти block_len={} (неделя {}/step={})",
        perm_block_len, _PERM_BLOCK_MIN, sample_step)
    train_labels = labels_base.filter(pl.col("split") == "train")
    mem_vol_df = memory_distance(
        excursions_an,
        train_labels.select("bar_idx", "regime_v"),
        "regime_v",
        "V3",
        cfg.horizons_min,
        n_boot=100,
        seed=cfg.seed,
        block_len=perm_block_len,
    )
    mem_vol_h = _memory_horizon(mem_vol_df)
    mem_dir_df_evt = _memory_for_event(
        excursions_an, labels_base, events, "impulse_up", cfg, block_len=perm_block_len)
    mem_dir_h = _memory_horizon(mem_dir_df_evt)

    # 8. Rotation: ситуации, кривые загрузки, синхронность.
    floors_long = floor_curve(list(cfg.horizons_min), "long", cfg)
    floors = {
        int(r["horizon_min"]): float(r["floor_bps"]) for r in floors_long.iter_rows(named=True)
    }
    cell_inputs, situations_train, loading_nominal = _style_cell_inputs(
        excursions_an, labels, floors, cfg.horizons_min, cfg
    )

    # Эффективная загрузка (синхронность). bars в synchrony не передаём:
    # avg_pairwise_corr считался бы O(n²) (cap 2000); на одном инструменте
    # one-direction corr ≈ 1.0 (общий драйвер, docstring rotation) — берём как
    # консервативную оценку (помечено в observations).
    sync = synchrony(situations_train, total_minutes=bars.height)
    n_concurrent = max(1, int(round(1.0 + sync["sync_time_pct"] / 100.0)))
    avg_corr = 1.0 if np.isnan(sync["avg_pairwise_corr"]) else float(sync["avg_pairwise_corr"])
    loading_effective = effective_loading(loading_nominal / 100.0, n_concurrent, avg_corr) * 100.0

    # 9. Gaps (риск-слой).
    gaps = extract_gaps(bars)
    gap_sum = gap_summary(gaps)

    # ATR 1d для масштаба гэпа (П5).
    atr_scales_df = _atr_scales_frame(bars, ("1d",))
    atr_1d_bps = 0.0
    if atr_scales_df.height > 0:
        arr = atr_scales_df["atr_1d_bps"].drop_nulls().to_numpy().astype(np.float64)
        atr_1d_bps = float(arr.mean()) if arr.shape[0] else 0.0

    # 10. Карта стилей + вердикт (§5.4, §5.5, §9.3).
    observations = _collect_observations(
        sync["sync_time_pct"], avg_corr, loading_nominal, loading_effective, mem_dir_h, mem_vol_h
    )
    cell_offers = {
        ci["style"]: float(np.mean(ci["offer_bps"]) if ci["offer_bps"].size else 0.0)
        for ci in cell_inputs
    }
    predictions = _check_predictions(
        scale_full, base_std, sat_h, mem_dir_h, mem_vol_h, gap_sum, cell_offers, atr_1d_bps, cfg
    )

    # Квалификация вердикта (M3): допущения, при которых получен aggregate.
    # sensitivity slippage 1→2 bps: viable ячейки stable если все offer_ci_lo > 1.
    # offer_ci_lo ещё не посчитан тут (внутри build_verdict) — проверяем по
    # offer_mean: если min offer_mean по ячейкам > 2, то 1↔2 bps не меняет.
    min_offer_mean = min(
        (float(np.mean(ci["offer_bps"])) for ci in cell_inputs if ci["offer_bps"].size),
        default=0.0)
    slippage_stable = min_offer_mean > 2.0
    verdict_qualification = (
        f"{cfg.symbol}: вердикт при swaps=0 (нет данных брокера) — реалистичные "
        f"свопы поднимут пол на длинных h и могут изменить агрегат; sensitivity "
        f"slippage 1↔2 bps {'не меняет' if slippage_stable else 'может менять'} "
        f"viable-ячейки (min offer_mean={min_offer_mean:.1f} bps); загрузка "
        f"loading_* на sub-sample (step={sample_step}), завышена — надёжен только "
        f"качественный вывод ≫40% (G3); память — блочная permutation (~неделя)"
    )

    verdict = build_verdict(
        symbol=cfg.symbol,
        style_cell_inputs=cell_inputs,
        saturation_horizon_min=sat_h,
        memory_direction_horizon_min=mem_dir_h,
        memory_volatility_horizon_min=mem_vol_h,
        loading_nominal_pct=loading_nominal,
        loading_effective_pct=loading_effective,
        observations=observations,
        predictions=predictions,
        verdict_qualification=verdict_qualification,
    )

    # 11. Артефакты (§6) — все продукты при любом вердикте (L20).
    out_dir = out_override or cfg.out_dir
    paths = write_atlas_artifacts(
        cells_df=cells_df,
        verdict=verdict,
        scale_curve_full=scale_full,
        out_dir=out_dir,
        provenance={
            "data_hash": cfg.data_hash,
            "code_version": cfg.code_version,
            "seed": cfg.seed,
            "lineup_hash": cfg.lineup_hash,
            "symbol": cfg.symbol,
        },
    )
    logger.info("атлас готов: вердикт={}, артефакты={}", verdict.aggregate_verdict, out_dir)
    return paths


def _load_config(cfg_path: Path) -> AtlasConfig:
    """Загрузить :class:`AtlasConfig` из YAML."""
    with cfg_path.open("r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)
    return AtlasConfig.model_validate(raw)


def _memory_horizon(mem_df: pl.DataFrame) -> int:
    """Горизонт памяти = первый h, где ``p_value ≥ 0.05`` (H0 не отвергается).

    Args:
        mem_df: кадр от :func:`memory_distance` (``horizon_min, p_value``).

    Returns:
        Горизонт в минутах; последний горизонт если нигде не гаснет; 0 если пусто.
    """
    if mem_df.height == 0:
        return 0
    h = mem_df["horizon_min"].to_numpy().astype(np.int64)
    p = mem_df["p_value"].to_numpy().astype(np.float64)
    fin = ~np.isnan(p)
    if not bool(fin.any()):
        return int(h[-1])
    idx = np.flatnonzero(fin)
    ge = idx[p[idx] >= 0.05]
    return int(h[ge[0]]) if ge.shape[0] > 0 else int(h[idx[-1]])


def _memory_for_event(
    excursions: pl.DataFrame,
    labels_base: pl.DataFrame,
    events: pl.DataFrame,
    condition: str,
    cfg: AtlasConfig,
    block_len: int = 1,
) -> pl.DataFrame:
    """Memory distance для события-импульса (направление): cond vs rest.

    Метка — ``event_type`` на bar_idx (из events, уникально по bar — первое
    событие условия; events long-format имеют несколько записей на bar для
    разных δ/w, дубликаты исказили бы KS). ``labels_base`` даёт train-бары.
    ``block_len`` — блочная permutation (§7 п.5, ~неделя для автокорреляции).
    """
    if events.height == 0:
        return pl.DataFrame()
    train_idx = labels_base.filter(pl.col("split") == "train")["bar_idx"]
    evt = events.filter(pl.col("event_type") == condition).group_by(
        "bar_idx", maintain_order=True).first()
    if evt.height == 0:
        return pl.DataFrame()
    lab = train_idx.to_frame().join(evt.select("bar_idx", "event_type"), on="bar_idx", how="left")
    return memory_distance(
        excursions, lab, "event_type", condition, cfg.horizons_min,
        n_boot=100, seed=cfg.seed, block_len=block_len,
    )


def _collect_observations(
    sync_time_pct: float,
    avg_corr: float,
    loading_nominal: float,
    loading_effective: float,
    mem_dir_h: int,
    mem_vol_h: int,
) -> list[str]:
    """Слой [наблюдение] (§5.5 п.3): находки вне вердикта.

    В вердикт не входит до подтверждения на val/следующем инструменте (§7 п.7).
    """
    obs: list[str] = []
    if sync_time_pct > 10.0:
        obs.append(
            f"синхронность параллельных ситуаций {sync_time_pct:.1f}% времени "
            f"(avg_pairwise_corr≈{avg_corr:.2f}, консервативно) — эффективная "
            f"загрузка {loading_effective:.1f}% против номинальной "
            f"{loading_nominal:.1f}% (завышение номинального риска)"
        )
    if mem_vol_h > 0 and mem_dir_h > 0 and mem_vol_h > 2 * mem_dir_h:
        obs.append(
            f"память волатильности ({mem_vol_h} мин) существенно длиннее "
            f"направленной ({mem_dir_h} мин) — кластеризация волатильности "
            f"переживает направленную память"
        )
    obs.append(
        "премия за управление не вычислена (NaN) — производный слой гонки "
        "скобок, этап 2 (§2): разность раздачи − уловимое скобками"
    )
    obs.append(
        f"аналитические этапы (aggregate/scales/style/memory) — на систематическом "
        f"sub-sample {_ANALYTICS_SAMPLE_N} баров из 1.9M (stratified по времени); "
        f"rollout — на полном ряду. Квантили/CI на sub-sample стабильны (SE ~0.2%)"
    )
    return obs


__all__ = ["run_atlas"]
