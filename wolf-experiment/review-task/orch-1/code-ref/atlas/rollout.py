# src/zetaflowlab/atlas/rollout.py
"""Векторизованный rollout экскурсий мульти-разрешения (атлас v2 §4.1, §4.2, §8).

Для каждого 1m-бара ``t`` считает сырую раздачу экскурсий цены вперёд на
``H_max`` баров: MFE/MAE на лестнице горизонтов, времена достижения, дрожание
пути (osc), первые касания уровней first-passage, гэп-флаги. Единицы — сырые
(bps от close(t), минуты), без нормировки ATR (нормировка — на анализе, §2);
стиль торговли — не вход (§1–§2).

**Мульти-разрешение §4.2.** Ближняя зона по 1m, дальняя — по H1/D1 агрегатам
(каузальным). Поскольку max/min over window — ассоциативны, экскурсии в bps на
1m-ряду тождественны агрегату любой зоны: «гаснет разрешение» — это оптимизация
памяти/скорости, а не числа. Здесь (Task 2) окно считается по 1m-ряду везде
(явное разрешение спеки: «допустимо считать экскурсии по 1m-ряду»); стыки зон
``config.resolution_zones`` детерминированы из конфига и не влияют на значения
(тест ``test_rollout_matches_naive_resolution_join`` проверяет ≡ эталону на
горизонтах, пересекающих границы 8ч/5д).

**Детерминизм (AGENTS.md §2.2).** Все вычисления в ``float64``; порядок
операций фиксирован; параллелизм numba ``prange`` по барам — каждый бар пишет в
свою строку выходных буферов (нет race), результат побитово воспроизводим.
Арифметика bps — ``(price − entry) / entry × 1e4`` (clip mfe ≥ 0, mae ≤ 0) —
совпадает с наивным эталоном в тестах (L14/L16: один порядок операций).

**Memory-safety.** Чанкование по барам (``chunk_size``, образец —
:func:`zetaflowlab.analysis.exit_grid._resolve_exits_chunked`): каждый чанк
процессится на под-ряде ``[s, e+H_max]`` (halo справа для окон), валидные бары —
только ``[s, e)``; halo-бары отбрасываются. Ядро — O(n·H_max) операций, но без
материализации полного ``(n, H_max)`` окна (running max/min переменные).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, cast

import numpy as np
import polars as pl
from loguru import logger
from numba import njit, prange

from zetaflowlab.atlas.config import AtlasConfig

# --- Константы --------------------------------------------------------------

#: Знаменатель перевода отклонения цены в bps.
_BPS_DENOM: float = 10_000.0

#: Порог гэп-интервала: разрыв торгового времени > 1 мин → гэп (§4.1).
_GAP_MINUTE_THRESHOLD: float = 1.0

#: Размер чанка по умолчанию (бар); ≡ simulation.chunk_size движка (тот же
#: профиль памяти). При n ≤ chunk_size чанкование вырождается в один чанк.
_DEFAULT_CHUNK_SIZE: int = 100_000

#: Схема вывода :func:`compute_excursions` — одна строка на бар t.
_OUTPUT_SCHEMA: dict[str, pl.DataType] = cast(
    "dict[str, pl.DataType]",
    {
        "bar_idx": pl.Int64,
        "mfe_bps": pl.List(pl.Float64),
        "mae_bps": pl.List(pl.Float64),
        "t_mfe_min": pl.List(pl.Float64),
        "t_mae_min": pl.List(pl.Float64),
        "osc_crossings": pl.Int64,
        "osc_max_subswing_amp_bps": pl.Float64,
        "fp_up_min": pl.List(pl.Float64),
        "fp_dn_min": pl.List(pl.Float64),
        "gap_count": pl.Int64,
        "gap_max_bps": pl.Float64,
        "gap_dir": pl.Utf8,
        "truncated": pl.Boolean,
        "window_len": pl.Int64,
    },
)


# --- Примитивы: разбор входа и гэпы (чистые функции, SRP) --------------------


@dataclass(frozen=True)
class _PathArrays:
    """Numpy-срез входного ряда (float64, ns-timestamps)."""

    high: np.ndarray
    low: np.ndarray
    close: np.ndarray
    open_: np.ndarray
    ts_ns: np.ndarray


def _parse_bars(bars: pl.DataFrame) -> _PathArrays:
    """Извлечь numpy-массивы OHLC + timestamp из кадра.

    Args:
        bars: кадр с колонками ``timestamp, open, high, low, close``
            (схема bars_1m_enriched).

    Returns:
        :class:`_PathArrays` с float64 OHLC и int64 ns-timestamp.
    """
    ts_ns = bars["timestamp"].dt.epoch("ns").to_numpy().astype(np.int64)
    return _PathArrays(
        high=bars["high"].to_numpy().astype(np.float64, copy=False),
        low=bars["low"].to_numpy().astype(np.float64, copy=False),
        close=bars["close"].to_numpy().astype(np.float64, copy=False),
        open_=bars["open"].to_numpy().astype(np.float64, copy=False),
        ts_ns=ts_ns,
    )


def _compute_gaps(
    ts_ns: np.ndarray,
    open_: np.ndarray,
    close: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Гэп-интервалы пути (§4.1): dt > 1 мин → гэп, размер в bps.

    Гэп-интервал открывает бар ``i`` (``i ≥ 1``), если
    ``timestamp[i] − timestamp[i−1] > 1 мин`` (разрыв торгового времени:
    overnight/weekend, клиринг). Размер гэпа —
    ``(open[i] − close[i−1]) / close[i−1] × 1e4`` bps (открытие следующего
    интервала против закрытия предыдущего); знак сохраняет направление.

    Args:
        ts_ns: timestamps в наносекундах (int64).
        open_: цены open (float64).
        close: цены close (float64).

    Returns:
        ``(gap_mask, gap_bps)`` длины n: ``gap_mask[i]`` — бар ``i`` открывает
        гэп-интервал; ``gap_bps[i]`` — signed размер (0 при отсутствии гэпа).
    """
    n = close.shape[0]
    gap_mask = np.zeros(n, dtype=np.bool_)
    gap_bps = np.zeros(n, dtype=np.float64)
    if n >= 2:
        dt_min = (ts_ns[1:] - ts_ns[:-1]) / 60e9
        is_gap = dt_min > _GAP_MINUTE_THRESHOLD
        gap_mask[1:] = is_gap
        signed = (open_[1:] - close[:-1]) / close[:-1] * _BPS_DENOM
        gap_bps[1:] = np.where(is_gap, signed, 0.0)
    return gap_mask, gap_bps


# --- Numba-ядро: экскурсии одного бара × все бары (параллельно) --------------


@njit(parallel=True, cache=True)
def _excursions_kernel(
    high: np.ndarray,
    low: np.ndarray,
    close: np.ndarray,
    gap_mask: np.ndarray,
    gap_bps: np.ndarray,
    horizons: np.ndarray,
    fp_levels: np.ndarray,
    h_max: int,
) -> Any:
    """Вычислить экскурсии для всех баров под-ряда (параллельно по барам).

    Каждый бар ``t`` независимо сканирует окно ``[t+1, t+H_max]`` (обрезается
    хвостом данных): running max(high)/min(low), времена достижения, лестница
    first-passage, дрожание (osc — второй проход до момента финального MFE),
    гэп-агрегаты. Все бары пишут в свои строки буферов — race-conditions нет,
    результат побитово воспроизводим при любом порядке выполнения ``prange``.

    Args:
        high/low/close: OHLC под-ряда, float64 [m].
        gap_mask/gap_bps: предвычисленные гэп-интервалы (:func:`_compute_gaps`).
        horizons: лестница горизонтов в минутах/барах, int64 [H_h], strictly ↑.
        fp_levels: лестница уровней first-passage в bps, int64 [n_lvl], ↑.
        h_max: потолок окна в барах (``config.h_max_minutes``).

    Returns:
        Кортеж ``(valid, mfe, mae, t_mfe, t_mae, fp_up, fp_dn, osc_crossings,
        osc_max_amp, gap_count, gap_max_bps, gap_dir_signed, window_len)`` —
        массивы длины m (или [m, H_h] / [m, n_lvl]); ``valid[t]`` — бар t
        имеет запись (окно ≥ кратчайшего горизонта).
    """
    n = close.shape[0]
    h_h = horizons.shape[0]
    n_lvl = fp_levels.shape[0]
    h_min = horizons[0]

    mfe_bps = np.zeros((n, h_h), dtype=np.float64)
    mae_bps = np.zeros((n, h_h), dtype=np.float64)
    t_mfe = np.zeros((n, h_h), dtype=np.float64)
    t_mae = np.zeros((n, h_h), dtype=np.float64)
    fp_up = np.empty((n, n_lvl), dtype=np.float64)
    fp_dn = np.empty((n, n_lvl), dtype=np.float64)
    osc_crossings = np.zeros(n, dtype=np.int64)
    osc_max_amp = np.zeros(n, dtype=np.float64)
    gap_count = np.zeros(n, dtype=np.int64)
    gap_max_bps = np.zeros(n, dtype=np.float64)
    gap_dir_signed = np.zeros(n, dtype=np.float64)
    window_len = np.zeros(n, dtype=np.int64)
    valid = np.zeros(n, dtype=np.bool_)

    for t in prange(n):  # type: ignore[no-untyped-call,attr-defined]
        # K = min(h_max, n-1-t) — окно обрезается хвостом данных.
        rem = n - 1 - t
        k_total = h_max if rem >= h_max else rem
        if k_total < h_min:
            continue  # окно короче кратчайшего горизонта — нет записи
        valid[t] = True
        window_len[t] = k_total
        entry = close[t]
        rmax_h = -np.inf
        rmin_l = np.inf
        t_mfe_run = 0.0
        t_mae_run = 0.0
        for j in range(n_lvl):
            fp_up[t, j] = np.inf
            fp_dn[t, j] = np.inf
        gap_cnt = 0
        gap_best_abs = 0.0
        gap_best_signed = 0.0
        hi = 0  # текущий индекс в лестнице горизонтов (↑, уникальны)
        for k in range(1, k_total + 1):
            idx = t + k
            h_k = high[idx]
            l_k = low[idx]
            if h_k > rmax_h:
                rmax_h = h_k
                t_mfe_run = float(k)
            if l_k < rmin_l:
                rmin_l = l_k
                t_mae_run = float(k)
            # Горизонт достигнут: фиксируем mfe/mae/t_* на текущей running-величине.
            while hi < h_h and horizons[hi] == k:
                mfe = (rmax_h - entry) / entry * _BPS_DENOM
                if mfe < 0.0:
                    mfe = 0.0  # favourable only (≥ 0)
                mae = (rmin_l - entry) / entry * _BPS_DENOM
                if mae > 0.0:
                    mae = 0.0  # adverse only (≤ 0)
                mfe_bps[t, hi] = mfe
                mae_bps[t, hi] = mae
                t_mfe[t, hi] = t_mfe_run
                t_mae[t, hi] = t_mae_run
                hi += 1
            # First-passage: при достижении уровня фиксируем время.
            fav = (rmax_h - entry) / entry * _BPS_DENOM
            adv = (entry - rmin_l) / entry * _BPS_DENOM
            for j in range(n_lvl):
                lvl = fp_levels[j]
                if fp_up[t, j] == np.inf and fav >= lvl:
                    fp_up[t, j] = float(k)
                if fp_dn[t, j] == np.inf and adv >= lvl:
                    fp_dn[t, j] = float(k)
            # Гэп-агрегаты: count + max по модулю (с сохранением знака).
            if gap_mask[idx]:
                gap_cnt += 1
                gb = gap_bps[idx]
                agb = gb if gb >= 0.0 else -gb
                if agb > gap_best_abs:
                    gap_best_abs = agb
                    gap_best_signed = gb
        # Незаполненные горизонты (h_i > K — хвост ряда) → NaN (без выдуманных
        # значений, §8: «запись обрезается/помечается»). Property-тесты
        # игнорируют NaN через `diffs < 0` → False.
        for i in range(hi, h_h):
            mfe_bps[t, i] = np.nan
            mae_bps[t, i] = np.nan
            t_mfe[t, i] = np.nan
            t_mae[t, i] = np.nan
        gap_count[t] = gap_cnt
        gap_max_bps[t] = gap_best_abs
        gap_dir_signed[t] = gap_best_signed

        # Osc: второй проход до момента финального mfe (t_mfe_run на полном
        # окне). Считаем смены знака (close − entry) и амплитуды под-качелей.
        k_end = int(t_mfe_run) if t_mfe_run > 0.0 else k_total
        osc_cnt = 0
        osc_best = 0.0
        prev_side = 0
        side_max = -np.inf
        side_min = np.inf
        for k in range(1, k_end + 1):
            c_k = close[t + k]
            dev = (c_k - entry) / entry * _BPS_DENOM
            if c_k > entry:
                side = 1
            elif c_k < entry:
                side = -1
            else:
                side = 0
            if side != 0 and prev_side != 0 and side != prev_side:
                leg_amp = side_max - side_min
                if leg_amp > osc_best:
                    osc_best = leg_amp
                osc_cnt += 1
                side_max = dev
                side_min = dev
            else:
                if dev > side_max:
                    side_max = dev
                if dev < side_min:
                    side_min = dev
            if side != 0:
                prev_side = side
        leg_amp = side_max - side_min
        if leg_amp > osc_best:
            osc_best = leg_amp
        osc_crossings[t] = osc_cnt
        osc_max_amp[t] = osc_best

    return (
        valid,
        mfe_bps,
        mae_bps,
        t_mfe,
        t_mae,
        fp_up,
        fp_dn,
        osc_crossings,
        osc_max_amp,
        gap_count,
        gap_max_bps,
        gap_dir_signed,
        window_len,
    )


# --- Сборка DataFrame + оркестрация чанков ----------------------------------


def _build_chunk_frame(
    kernel_result: Any,
    offset: int,
    h_max: int,
    chunk_local_len: int,
) -> pl.DataFrame:
    """Собрать polars-кадр из выхода ядра для одного чанка.

    Args:
        kernel_result: кортеж от :func:`_excursions_kernel`.
        offset: глобальный сдвиг ``bar_idx`` (старт чанка в полном ряде).
        h_max: потолок окна (для флага ``truncated``).
        chunk_local_len: число баров чанка ``[s, e)`` (без halo) — halo-бары
            отбрасываются, чтобы не дублировать записи соседнего чанка.

    Returns:
        Кадр по схеме :data:`_OUTPUT_SCHEMA` для валидных баров чанка.
    """
    (
        valid,
        mfe_full,
        mae_full,
        t_mfe_full,
        t_mae_full,
        fp_up_full,
        fp_dn_full,
        osc_crossings,
        osc_max_amp,
        gap_count,
        gap_max_bps,
        gap_dir_signed,
        window_len,
    ) = kernel_result
    # Локальные индексы баров чанка (БЕЗ halo): [0, chunk_local_len).
    idx_all = np.nonzero(valid)[0]
    idx = idx_all[idx_all < chunk_local_len]
    if idx.shape[0] == 0:
        return pl.DataFrame(schema=_OUTPUT_SCHEMA)
    bar_idx = (idx + offset).astype(np.int64)
    mfe = mfe_full[idx]
    mae = mae_full[idx]
    t_mfe = t_mfe_full[idx]
    t_mae = t_mae_full[idx]
    fp_up = fp_up_full[idx]
    fp_dn = fp_dn_full[idx]
    osc = osc_crossings[idx]
    osc_amp = osc_max_amp[idx]
    gcnt = gap_count[idx]
    gmax = gap_max_bps[idx]
    gdir_s = gap_dir_signed[idx]
    wlen = window_len[idx]
    truncated = wlen < h_max
    gap_dir = np.where(gdir_s > 0.0, "up", np.where(gdir_s < 0.0, "down", "none"))
    return pl.DataFrame(
        {
            "bar_idx": bar_idx,
            "mfe_bps": pl.Series(mfe.tolist(), dtype=pl.List(pl.Float64)),
            "mae_bps": pl.Series(mae.tolist(), dtype=pl.List(pl.Float64)),
            "t_mfe_min": pl.Series(t_mfe.tolist(), dtype=pl.List(pl.Float64)),
            "t_mae_min": pl.Series(t_mae.tolist(), dtype=pl.List(pl.Float64)),
            "osc_crossings": osc,
            "osc_max_subswing_amp_bps": osc_amp,
            "fp_up_min": pl.Series(fp_up.tolist(), dtype=pl.List(pl.Float64)),
            "fp_dn_min": pl.Series(fp_dn.tolist(), dtype=pl.List(pl.Float64)),
            "gap_count": gcnt,
            "gap_max_bps": gmax,
            "gap_dir": pl.Series(gap_dir, dtype=pl.Utf8),
            "truncated": pl.Series(truncated, dtype=pl.Boolean),
            "window_len": wlen,
        },
        schema=_OUTPUT_SCHEMA,
    )


def compute_excursions(
    bars: pl.DataFrame,
    config: AtlasConfig,
    *,
    chunk_size: int = _DEFAULT_CHUNK_SIZE,
) -> pl.DataFrame:
    """Векторизованная раздача экскурсий от каждого бара (§4.1, §4.2).

    Для каждого 1m-бара ``t`` считает окно ``[t+1, t+H_max]`` (обрезается
    хвостом данных) и заполняет запись: MFE/MAE на лестнице горизонтов (bps),
    времена достижения (минуты), дрожание пути (osc — число пересечений уровня
    входа до mfe + макс. амплитуда под-качели), первые касания уровней
    first-passage (минуты; ``inf`` — не достигнут), гэп-агрегаты (count, max
    bps, направление). Бар с окном короче кратчайшего горизонта — без записи
    (хвост ряда, ``truncated`` на остальных хвостовых барх = True).

    Чанкование по барам (``chunk_size``) для memory-safety: каждый чанк
    процессится на под-ряде с halo ``H_max`` справа; halo-бары отбрасываются.
    Ядро — numba ``prange`` по барам (детерминизм: каждый бар пишет в свою
    строку, race нет).

    Args:
        bars: кадр OHLC с timestamp (схема bars_1m_enriched: ``timestamp,
            open, high, low, close``).
        config: конфиг атласа (лестницы ``horizons_min``/``fp_levels_bps``,
            ``h_max_minutes``).
        chunk_size: размер чанка по барам (default 100k; KISS для малых рядов).

    Returns:
        Кадр по схеме :data:`_OUTPUT_SCHEMA`: одна строка на валидный бар
        (упорядочен по ``bar_idx``); пустой кадр со схемой при пустом входе.
    """
    n = bars.height
    if n == 0:
        return pl.DataFrame(schema=_OUTPUT_SCHEMA)
    pa = _parse_bars(bars)
    gap_mask, gap_bps = _compute_gaps(pa.ts_ns, pa.open_, pa.close)
    horizons_arr = np.asarray(config.horizons_min, dtype=np.int64)
    fp_levels_arr = np.asarray(config.fp_levels_bps, dtype=np.float64)
    h_max = int(config.h_max_minutes)
    if chunk_size <= 0:
        chunk_size = _DEFAULT_CHUNK_SIZE

    parts: list[pl.DataFrame] = []
    for s in range(0, n, chunk_size):
        e = min(s + chunk_size, n)
        chunk_local_len = e - s
        # Halo справа: окна баров [s, e) смотрят вперёд на H_max баров.
        e_halo = min(n, e + h_max)
        sub = slice(s, e_halo)
        result = _excursions_kernel(
            pa.high[sub],
            pa.low[sub],
            pa.close[sub],
            gap_mask[sub],
            gap_bps[sub],
            horizons_arr,
            fp_levels_arr,
            h_max,
        )
        parts.append(
            _build_chunk_frame(result, offset=s, h_max=h_max, chunk_local_len=chunk_local_len)
        )
    out = pl.concat(parts, how="vertical") if len(parts) > 1 else parts[0]
    logger.debug(
        "atlas.rollout: {} баров → {} записей (chunk_size={}, h_max={}, horizons={}, fp_levels={})",
        n,
        out.height,
        chunk_size,
        h_max,
        len(horizons_arr),
        len(fp_levels_arr),
    )
    return out.sort("bar_idx")


__all__ = ["compute_excursions"]
