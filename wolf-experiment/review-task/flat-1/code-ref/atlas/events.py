# src/zetaflowlab/atlas/events.py
"""Каузальный детектор δ-импульсов (атлас v2 §4.4; AGENTS.md §4).

Отвечает на вопрос «прошла ли цена δ bps за ≤ w минут?» для каждой пары (δ, w)
сетки, оба направления. Продукт слоя (§4.4) — сдвиг условной раздачи экскурсий
после импульса против безусловной: прямая калибровка фейд-гейта (Э2) и проверка
измеренного «92% откатов на 1m» на других масштабах.

**Семантика детектора** (фиксируется здесь и в тестах):

    event_up(t, δ, w) ⇔ ∃ k ∈ [1, w]:
        (close(t) − close(t−k)) / close(t−k) × 1e4 ≥ δ
        ⇔ (close(t) − min(close[t−w .. t−1])) / min(close[t−w .. t−1]) × 1e4 ≥ δ

    event_down(t, δ, w) ⇔ (max(close[t−w..t−1]) − close(t)) / max(...) × 1e4 ≥ δ

«За ≤ w шагов» = «существует k ≤ w»: старт импульса — локальный минимум close
в окне ``[t−w, t−1]`` (для up) / максимум (для down); финиш — ``close(t)``. Это
ловит «взрыв от локального дна/пика за w шагов», а не смещение от фиксированной
точки ``t−w``: релевантно для фейд-гейта (δ-движение от экстремума).

**Альтернативы (не выбраны, зафиксировано в отчёте):**
- ``(A1) close(t) − close(t−w) ≥ δ`` — «за ровно w», не ловит резкие движения
  короче w (менее релевантно для «импульса от дна»).
- ``(B) close(t) − min(low[t−w..t]) ≥ δ`` — смешивает close и low → менее
  интерпретируемо; close-only каноничнее для «сдвига цены».

**Каузальность / no-lookahead (§8).** Детектор использует только
``close[t−w .. t]`` — все завершены к моменту ``t`` (правило завершённого бара,
AGENTS.md §4). Будущие бары не входят в формулу → подмена ``close[T+1:]`` не
меняет множества событий на барах ``≤ T`` (тест ``test_no_lookahead_*``).

**Граница «за ≤ w шагов».** ``k == w`` → событие (``k ≤ w``); ``k == w+1`` →
нет (``k > w``): при ``k > w`` старт импульса ``t−k`` уже вне окна ``[t−w, t−1]``,
локальный min/max в окне выше/ниже старта → сдвиг ``< δ`` (тест
``test_event_at_exact_window_boundary``).

**Детерминизм (AGENTS.md §2.2).** ``float64``; ``numba prange`` по барам —
каждый бар пишет только в свою строку булевой маски ``[n, n_δ, n_w, 2]``,
race-conditions нет, результат побитово воспроизводим. Сборка long-format из
маски — через ``np.argwhere`` + стабильную сортировку по
``(bar_idx, event_type, delta_bps, window_min)``.
"""

from __future__ import annotations

from typing import Any, cast

import numpy as np
import polars as pl
from loguru import logger
from numba import njit, prange

from zetaflowlab.atlas.config import AtlasConfig

#: Знаменатель перевода отклонения цены в bps.
_BPS_DENOM: float = 10_000.0

#: Схема вывода :func:`detect_impulses` — long format: одна строка на срабатывание.
_OUTPUT_SCHEMA: dict[str, pl.DataType] = cast(
    "dict[str, pl.DataType]",
    {
        "bar_idx": pl.Int64,
        "timestamp": pl.Datetime("us"),
        "event_type": pl.Utf8,
        "delta_bps": pl.Int64,
        "window_min": pl.Int64,
    },
)

#: Метки направлений события (соответствуют индексу 0/1 в маске ядра).
_DIR_LABELS: tuple[str, str] = ("impulse_up", "impulse_down")


# --- Numba-ядро: каузальная маска событий -----------------------------------


@njit(parallel=True, cache=True)
def _impulse_kernel(
    close: np.ndarray,
    deltas: np.ndarray,
    windows: np.ndarray,
) -> Any:
    """Каузальная маска δ-импульсов для всех баров (параллельно по барам).

    Для каждого бара ``t ≥ w_max`` и каждой пары ``(δ, w)`` считает
    ``min/max(close[t−w .. t−1])`` (rolling по прошлому, без ``close(t)`` и без
    lookahead) и проверяет сдвиг до ``close(t)`` против δ в оба направления.
    Каждый бар пишет только в свою строку маски — race нет, детерминизм.

    Args:
        close: ряд close, float64 [n].
        deltas: сетка δ в bps, float64 [n_δ] (↑ не обязательно).
        windows: сетка w в барах/минутах, int64 [n_w] (↑ не обязательно).

    Returns:
        Булева маска ``[n, n_δ, n_w, 2]``: ``mask[t, di, wi, 0]`` —
        ``event_up(t, δ[di], w[wi])``; ``[..., 1]`` — ``event_down``. Бары
        ``t < w_max`` — все False (недостаточно истории, правило завершённого
        бара).
    """
    n = close.shape[0]
    n_d = deltas.shape[0]
    n_w = windows.shape[0]
    mask = np.zeros((n, n_d, n_w, 2), dtype=np.bool_)
    if n == 0 or n_d == 0 or n_w == 0:
        return mask
    for t in prange(n):  # type: ignore[no-untyped-call,attr-defined]
        c_t = close[t]
        for wi in range(n_w):
            w = int(windows[wi])
            # Каузальное окно [t−w, t−1] требует t ≥ w; иначе недостаточно
            # истории (правило завершённого бара) — и numba close[t−k] при
            # t<k дало бы wrap-around (последние элементы ряда).
            if t < w:
                continue
            mn = np.inf
            mx = -np.inf
            for k in range(1, w + 1):
                c = close[t - k]
                if c < mn:
                    mn = c
                if c > mx:
                    mx = c
            # Сдвиг close(t) от локального экстремума окна (→ bps)
            up_bps = (c_t - mn) / mn * _BPS_DENOM
            dn_bps = (mx - c_t) / mx * _BPS_DENOM
            for di in range(n_d):
                d = deltas[di]
                if up_bps >= d:
                    mask[t, di, wi, 0] = True
                if dn_bps >= d:
                    mask[t, di, wi, 1] = True
    return mask


# --- Сборка long-format DataFrame -------------------------------------------


def _build_events_df(
    mask: np.ndarray,
    deltas: np.ndarray,
    windows: np.ndarray,
    timestamps: pl.Series,
) -> pl.DataFrame:
    """Собрать polars-кадр (long format) из булевой маски ядра.

    ``np.argwhere`` по ``mask[:, :, :, dir]`` даёт массив индексов ``(t, di, wi)``
    срабатываний; для каждого собираем ``(bar_idx, delta, window)`` и метку
    направления. Сортировка по ``(bar_idx, event_type, delta_bps, window_min)``
    — детерминированный порядок (воспроизводимость downstream).

    Args:
        mask: булева маска ``[n, n_δ, n_w, 2]`` от :func:`_impulse_kernel`.
        deltas: сетка δ (для отображения индекса → значение).
        windows: сетка w (то же).
        timestamps: серия timestamps из входного кадра (для колонки timestamp).

    Returns:
        Кадр по схеме :data:`_OUTPUT_SCHEMA` (long format), отсортированный.
    """
    bar_idx_parts: list[np.ndarray] = []
    delta_parts: list[np.ndarray] = []
    window_parts: list[np.ndarray] = []
    type_parts: list[str] = []
    for dir_idx, label in enumerate(_DIR_LABELS):
        idx = np.argwhere(mask[:, :, :, dir_idx])  # [K, 3] = (t, di, wi)
        if idx.shape[0] == 0:
            continue
        ts_arr = idx[:, 0].astype(np.int64)
        d_arr = deltas[idx[:, 1]].astype(np.int64)
        w_arr = windows[idx[:, 2]].astype(np.int64)
        bar_idx_parts.append(ts_arr)
        delta_parts.append(d_arr)
        window_parts.append(w_arr)
        type_parts.extend([label] * idx.shape[0])
    if not bar_idx_parts:
        return pl.DataFrame(schema=_OUTPUT_SCHEMA)
    bar_idx = np.concatenate(bar_idx_parts)
    delta_arr = np.concatenate(delta_parts)
    window_arr = np.concatenate(window_parts)
    event_type = np.array(type_parts, dtype=object)
    # timestamps по bar_idx (позиционный индекс в ряду)
    ts_by_idx = timestamps.to_numpy()[bar_idx]
    return pl.DataFrame(
        {
            "bar_idx": bar_idx,
            "timestamp": pl.Series(ts_by_idx, dtype=pl.Datetime("us")),
            "event_type": pl.Series(event_type, dtype=pl.Utf8),
            "delta_bps": delta_arr,
            "window_min": window_arr,
        },
        schema=_OUTPUT_SCHEMA,
    ).sort(
        ["bar_idx", "event_type", "delta_bps", "window_min"],
        maintain_order=True,
    )


def detect_impulses(
    bars: pl.DataFrame,
    config: AtlasConfig,
) -> pl.DataFrame:
    """Каузальный детектор δ-импульсов: «цена прошла δ за ≤ w шагов» (§4.4).

    Для каждого бара ``t ≥ max(config.event_windows_min)`` и каждой пары
    ``(δ, w)`` из ``config.event_deltas_bps × config.event_windows_min`` проверяет
    сдвиг ``close(t)`` от локального экстремума close окна ``[t−w, t−1]``:

        event_up(t, δ, w) ⇔ (close(t) − min(close[t−w..t−1])) / min(...) × 1e4 ≥ δ
        event_down(t, δ, w) ⇔ (max(close[t−w..t−1]) − close(t)) / max(...) × 1e4 ≥ δ

    Событие фиксируется на баре **завершения** импульса (текущий ``t``) и несёт
    ``(event_type, delta_bps, window_min)``. На одном баре может быть несколько
    событий (для разных δ/w — long format). Бары ``t < w_max`` не имеют окна
    (правило завершённого бара) → без событий. No-lookahead: формула использует
    только ``close[t−w..t]``.

    Args:
        bars: кадр OHLC с timestamp (схема bars_1m_enriched; используется только
            колонка ``close`` и ``timestamp``).
        config: конфиг атласа (сетки ``event_deltas_bps``, ``event_windows_min``).

    Returns:
        Кадр по схеме :data:`_OUTPUT_SCHEMA` (long format): одна строка на
        срабатывание ``(bar_idx, event_type, delta_bps, window_min)``,
        отсортированный по ``(bar_idx, event_type, delta_bps, window_min)``;
        пустой кадр со схемой при пустом входе / отсутствии движений.
    """
    n = bars.height
    if n == 0:
        return pl.DataFrame(schema=_OUTPUT_SCHEMA)
    close = bars["close"].to_numpy().astype(np.float64, copy=False)
    deltas = np.asarray(config.event_deltas_bps, dtype=np.float64)
    windows = np.asarray(sorted(config.event_windows_min), dtype=np.int64)
    if deltas.shape[0] == 0 or windows.shape[0] == 0:
        return pl.DataFrame(schema=_OUTPUT_SCHEMA)
    mask = _impulse_kernel(close, deltas, windows)
    df = _build_events_df(mask, deltas.astype(np.int64), windows, bars["timestamp"])
    logger.debug(
        "atlas.events: {} баров, δ×w={}×{} → {} событий (w_max={})",
        n,
        deltas.shape[0],
        windows.shape[0],
        df.height,
        int(windows[-1]),
    )
    return df


__all__ = ["detect_impulses"]
