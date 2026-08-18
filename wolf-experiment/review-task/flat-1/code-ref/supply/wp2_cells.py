# src/zetaflowlab/supply/wp2_cells.py
"""WП-2 (атлас v4.2): ячейки C1/C5 — загрузчик fp-таймингов + калькуляторы.

Единственная точка чтения fp-артефакта WП-2: :func:`load_fp_timings`
проходит гейт :func:`~zetaflowlab.supply.first_passage.read_latest_fp`,
сверяет сетку уровней и размер вселенной с манифестом и читает только
тайминговый срез (147 → 27 колонок): ``tau_up``/``tau_dn`` на сетке
:data:`GRID_LEVELS`, ``window_len`` (= ``k_tot`` v4.2, pass-through) и
``ts_ns``. Никакие другие колонки fp-артефакта WП-2 не читает
(pre-touch/mae — C4/WП-4).

Чистый калькулятор ячейки C1 (k, h) на маске V_h: :class:`C1Cell` /
:func:`c1_cell` / :func:`assert_c1_additivity` — маргинальные вероятности и
order_direction только через ``hit_mask``/``classify_direction`` WП-1
(собственной логики сравнения τ нет); аддитивность §4 — тождество счётчиков
до деления.

Чистый калькулятор ячейки C5 (k, h, a, dir): :class:`C5Cell` /
:func:`c5_cell` — классы ``order_tp_adv`` (§3.4), строгие множества A/B
(§3.10, только через ``normalize_tau``), bounds §3.8 и терцили §3.9
(границы — линейные квантили t_adv по A, U — клампинг по границам).
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import numpy.typing as npt
import polars as pl
from loguru import logger

from zetaflowlab.supply.first_passage import (
    CONTROL,
    GRID_LEVELS,
    fp_col_tag,
    read_latest_fp,
)
from zetaflowlab.supply.fp_consumer import (
    OrderDirection,
    OrderTpAdv,
    _require_1d_aligned,
    classify_direction,
    classify_tp_adv,
    hit_mask,
    normalize_tau,
    unresolved_tp_adv_flag,
)


@dataclass(frozen=True)
class FpTimings:
    """Минимальный срез fp-артефакта для C1/C5/MBB/matching (147 → 27 колонок).

    Attributes:
        tau_up: int64 ``[N, |GRID_LEVELS|]`` — первые tp-бары long в порядке
            GRID_LEVELS; sentinel −1 (сравнения — только после маски τ > 0).
        tau_dn: int64 ``[N, |GRID_LEVELS|]`` — первые tp-бары short; −1.
        window_len: int64 ``[N]`` — рабочее окно якоря (= k_tot v4.2,
            pass-through).
        ts_ns: int64 ``[N]`` — timestamp якоря, epoch ns (из колонки
            timestamp fp-артефакта).
        levels: сетка уровней артефакта (== GRID_LEVELS, сверена с
            манифестом fp).
        run_id: run_id fp-артефакта (provenance строк каталога).
        fp_code_hash: ``provenance.runtime_code_hash`` манифеста fp —
            provenance источника.
    """

    tau_up: npt.NDArray[np.int64]
    tau_dn: npt.NDArray[np.int64]
    window_len: npt.NDArray[np.int64]
    ts_ns: npt.NDArray[np.int64]
    levels: tuple[float, ...]
    run_id: str
    fp_code_hash: str


def level_index(level: float) -> int:
    """Индекс уровня в :data:`GRID_LEVELS` (точное равенство float).

    Args:
        level: уровень сетки, bps.

    Returns:
        Индекс ``0..len(GRID_LEVELS) − 1``.

    Raises:
        ValueError: уровень отсутствует в сетке или передан неточно.
    """
    for i, lvl in enumerate(GRID_LEVELS):
        if lvl == level:
            return i
    raise ValueError(
        f"уровень {level!r} отсутствует в GRID_LEVELS={GRID_LEVELS} "
        "(неточное значение не допускается)"
    )


def _tau_matrix(df: pl.DataFrame, direction: str) -> npt.NDArray[np.int64]:
    """Собрать tau-матрицу ``[N, |GRID_LEVELS|]`` в порядке сетки.

    Args:
        df: кадр среза fp-артефакта (tau-колонки по :func:`fp_col_tag`).
        direction: ``"up"`` | ``"dn"``.

    Returns:
        int64-матрица первых касаний (sentinel −1, pass-through).
    """
    return np.column_stack(
        [
            df[fp_col_tag("tau", direction, lvl)]
            .to_numpy()
            .astype(np.int64, copy=False)
            for lvl in GRID_LEVELS
        ]
    )


def load_fp_timings(fp_dir: str | Path) -> FpTimings:
    """Гейт потребления fp-таймингов WП-2 (единственная точка чтения fp).

    ``read_latest_fp(fp_dir)`` → сверка ``manifest.params.levels`` ==
    :data:`GRID_LEVELS` и ``manifest.params.n_rows`` ==
    ``CONTROL.n_anchors`` (fp обязан покрывать всю вселенную якорей) →
    чтение ТОЛЬКО колонок ``tau_{up,dn}_k{g}`` × |сетка|, ``k_tot``,
    ``timestamp`` (polars; ts → epoch ns). Другие колонки fp-артефакта
    WП-2 не читает (pre-touch/mae — C4/WП-4).

    Args:
        fp_dir: каталог fp-артефакта
            (``data/corpus/analysis_v4/first_passage``).

    Returns:
        :class:`FpTimings` — тайминговый срез + provenance.

    Raises:
        FileNotFoundError: ``LATEST.json``/immutable-пара отсутствуют
            (от :func:`read_latest_fp`).
        ValueError: ``manifest.params.levels`` ≠ GRID_LEVELS;
            ``manifest.params.n_rows`` ≠ ``CONTROL.n_anchors``; число строк
            parquet ≠ ``manifest.params.n_rows``; манифест без
            ``provenance.runtime_code_hash``.
        RuntimeError: статус манифеста не PASS / чужой run_id
            (от :func:`read_latest_fp`).
    """
    fp_path, manifest = read_latest_fp(fp_dir)
    params = manifest.get("params")
    if not isinstance(params, dict):
        raise ValueError(
            f"манифест fp без params-объекта: run_id={manifest.get('run_id')!r}"
        )
    levels_manifest = params.get("levels")
    if levels_manifest != list(GRID_LEVELS):
        raise ValueError(f"manifest.params.levels != GRID_LEVELS: {levels_manifest!r}")
    n_rows = params.get("n_rows")
    if n_rows != CONTROL.n_anchors:
        raise ValueError(
            f"manifest.params.n_rows={n_rows!r} != CONTROL.n_anchors="
            f"{CONTROL.n_anchors}"
        )
    provenance = manifest.get("provenance")
    fp_code_hash = (
        provenance.get("runtime_code_hash")
        if isinstance(provenance, dict)
        else None
    )
    if not isinstance(fp_code_hash, str) or not fp_code_hash:
        raise ValueError("манифест fp без provenance.runtime_code_hash")

    columns = ["timestamp", "k_tot"] + [
        fp_col_tag("tau", direction, lvl)
        for direction in ("up", "dn")
        for lvl in GRID_LEVELS
    ]
    df = pl.read_parquet(fp_path, columns=columns)
    n = df.shape[0]
    if n != n_rows:
        raise ValueError(
            f"fp-артефакт: строк {n} != manifest.params.n_rows={n_rows}"
        )
    timings = FpTimings(
        tau_up=_tau_matrix(df, "up"),
        tau_dn=_tau_matrix(df, "dn"),
        window_len=df["k_tot"].to_numpy().astype(np.int64, copy=False),
        ts_ns=df["timestamp"].dt.epoch("ns").to_numpy().astype(np.int64, copy=False),
        levels=GRID_LEVELS,
        run_id=manifest["run_id"],
        fp_code_hash=fp_code_hash,
    )
    logger.info(
        "fp-тайминги WП-2: run_id={}, N={}, уровней {} ({})",
        timings.run_id,
        n,
        len(GRID_LEVELS),
        fp_path.name,
    )
    return timings


# --- ячейка C1 (k, h): маргиналы + order_direction + аддитивность §4 ----------


@dataclass(frozen=True)
class C1Cell:
    """Ячейка C1 (k, h) на маске V_h. Знаменатель n_raw = |V_h| (anchors);
    маргиналы точечные (bounds не полагаются — §3.8); order_direction —
    простые порядковые доли (верхняя строка .incl_unresolved = P + P(U)).

    Attributes:
        n_raw: знаменатель |V_h| — число валидных якорей (window_len ≥ h).
        counts: счётчики ``hit_l, hit_s, hit_both, hit_either, hit_none,
            long_first, short_first, neither_dir, unresolved_ls`` — все в
            пересечении с valid; hit_either + hit_none = n_raw.
        shares: те же ключи, делённые на n_raw (0.0 при n_raw = 0; NaN
            запрещён контрактом публикации).
    """

    n_raw: int
    counts: dict[str, int]
    shares: dict[str, float]


def c1_cell(
    tau_up_k: npt.NDArray[np.int64],
    tau_dn_k: npt.NDArray[np.int64],
    valid: npt.NDArray[np.bool_],
    h: int,
) -> C1Cell:
    """Чистый калькулятор ячейки C1 (k, h) на маске V_h.

    tau_*_k — колонки уровня k (row-aligned, sentinel −1); valid = V_h.
    Маргиналы: hit_l = hit_mask(tau_up_k, h) & valid; order_direction —
    classify_direction(tau_up_k, tau_dn_k, h) & valid. Единственный источник
    истины о «касании» и «порядке» — WП-1 (hit_mask / classify_direction),
    собственной логики сравнения τ здесь нет.

    Args:
        tau_up_k: 1-D int64 первые tp-бары long на уровне k (sentinel −1).
        tau_dn_k: 1-D int64 первые tp-бары short на уровне k (sentinel −1).
        valid: 1-D bool маска V_h (window_len ≥ h).
        h: горизонт окна, баров.

    Returns:
        :class:`C1Cell` — счётчики и доли 9 ключей; n_raw = |V_h|; shares
        при n_raw = 0 — все 0.0 (не NaN).

    Raises:
        ValueError: если входы не 1-D или разной длины.
        AssertionError: при нарушении аддитивности §4 (hit_l + hit_s ==
            hit_either + hit_both, до деления) или порядковой суммы
            (long_first + short_first + neither_dir + unresolved_ls == n_raw).
    """
    _require_1d_aligned(tau_up_k=tau_up_k, tau_dn_k=tau_dn_k, valid=valid)
    hit_l = hit_mask(tau_up_k, h) & valid
    hit_s = hit_mask(tau_dn_k, h) & valid
    hit_both = hit_l & hit_s
    hit_either = hit_l | hit_s
    hit_none = valid & ~hit_either
    codes = classify_direction(tau_up_k, tau_dn_k, h)
    long_first = valid & (codes == int(OrderDirection.LONG_FIRST))
    short_first = valid & (codes == int(OrderDirection.SHORT_FIRST))
    neither_dir = valid & (codes == int(OrderDirection.NEITHER))
    unresolved_ls = valid & (codes == int(OrderDirection.UNRESOLVED_LONG_SHORT))

    n_raw = int(valid.sum())
    counts: dict[str, int] = {
        "hit_l": int(hit_l.sum()),
        "hit_s": int(hit_s.sum()),
        "hit_both": int(hit_both.sum()),
        "hit_either": int(hit_either.sum()),
        "hit_none": int(hit_none.sum()),
        "long_first": int(long_first.sum()),
        "short_first": int(short_first.sum()),
        "neither_dir": int(neither_dir.sum()),
        "unresolved_ls": int(unresolved_ls.sum()),
    }
    if counts["hit_l"] + counts["hit_s"] != counts["hit_either"] + counts["hit_both"]:
        raise AssertionError(
            f"аддитивность §4 нарушена: hit_l + hit_s = "
            f"{counts['hit_l'] + counts['hit_s']} != hit_either + hit_both = "
            f"{counts['hit_either'] + counts['hit_both']}"
        )
    ordinal_sum = (
        counts["long_first"]
        + counts["short_first"]
        + counts["neither_dir"]
        + counts["unresolved_ls"]
    )
    if ordinal_sum != n_raw:
        raise AssertionError(
            f"порядковая сумма {ordinal_sum} != n_raw={n_raw} "
            "(long_first + short_first + neither_dir + unresolved_ls)"
        )
    shares: dict[str, float] = (
        {key: value / n_raw for key, value in counts.items()}
        if n_raw > 0
        else {key: 0.0 for key in counts}
    )
    return C1Cell(n_raw=n_raw, counts=counts, shares=shares)


def assert_c1_additivity(cell: C1Cell) -> None:
    """Проверка аддитивности §4 на ОПУБЛИКОВАННЫХ оценках ячейки C1.

    P(L) + P(S) = P(L∪S) + P(L∩S): целочисленное тождество счётчиков
    ``hit_l + hit_s == hit_either + hit_both`` (float-сравнение через
    счётчики — тождественно) плюс контроль опубликованных долей: запрет NaN
    и пересчёт ``share·n_raw`` с tolerance 1e-9 (для parquet-строк каталога —
    тот же пересчёт ``estimate·n_raw``).

    Args:
        cell: ячейка, подготовленная к публикации.

    Raises:
        AssertionError: при нарушении тождества счётчиков, NaN в shares или
            расхождении ``share·n_raw`` с counts более чем на 1e-9.
    """
    counts = cell.counts
    if counts["hit_l"] + counts["hit_s"] != counts["hit_either"] + counts["hit_both"]:
        raise AssertionError(
            f"аддитивность §4 нарушена: hit_l + hit_s = "
            f"{counts['hit_l'] + counts['hit_s']} != hit_either + hit_both = "
            f"{counts['hit_either'] + counts['hit_both']}"
        )
    for key, share in cell.shares.items():
        if math.isnan(share):
            raise AssertionError(f"NaN в опубликованных shares C1: ключ {key}")
        if abs(share * cell.n_raw - counts[key]) > 1e-9:
            raise AssertionError(
                f"пересчёт share·n_raw разошёлся с counts: {key}: "
                f"{share}·{cell.n_raw} != {counts[key]} (tol 1e-9)"
            )


# --- ячейка C5 (k, h, a, dir): классы §3.4, A/B §3.10, bounds §3.8, терцили §3.9


def _ratio(numerator: int, denominator: int) -> float:
    """Доля ``numerator / denominator`` с запретом NaN: 0.0 при знаменателе 0.

    Args:
        numerator: числитель ≥ 0.
        denominator: знаменатель ≥ 0.

    Returns:
        Значение доли; 0.0 при ``denominator == 0``.
    """
    return numerator / denominator if denominator > 0 else 0.0


@dataclass(frozen=True)
class TercileStats:
    """Статистика терциля Q_i (§3.9) множества A по t_adv.

    Attributes:
        i: номер терциля (1 | 2 | 3).
        n_A: |A_i| — элементы A в терциле.
        n_B: |B_i| = |B ∩ A_i|.
        n_U: |U_i| — unresolved, заклампленные в терциль по t_adv (§3.8).
        p: |B_i|/|A_i| (0.0 при |A_i| = 0).
        p_min: |B_i|/(|A_i| + |U_i|) — bounds §3.8 (0.0 при нулевом знаменателе).
        p_max: (|B_i| + |U_i|)/(|A_i| + |U_i|) (0.0 при нулевом знаменателе).
        median_remaining: медиана (h − t_adv) по A_i, баров (0.0 при
            |A_i| = 0; публикация p-строк null — на уровне записи каталога).
    """

    i: int
    n_A: int  # noqa: N815 — имя поля зафиксировано интерфейсом WП-2 (бриф задачи)
    n_B: int  # noqa: N815
    n_U: int  # noqa: N815
    p: float
    p_min: float
    p_max: float
    median_remaining: float


@dataclass(frozen=True)
class C5Cell:
    """Ячейка C5 (k, h, a, dir) на маске V_h: порядок цель/просадка.

    Attributes:
        n_raw: знаменатель |V_h| — число валидных якорей (window_len ≥ h).
        classes: счётчики ``tp_first, adv_first, neither, unresolved`` —
            classify_tp_adv в пересечении с valid (Σ = n_raw).
        shares: те же ключи, делённые на n_raw (0.0 при n_raw = 0).
        h_resolved: |TP_FIRST ⊎ B| = tp_first + b_count (инвариант §3.9).
        b_count: |B| — «target after adverse» §3.10.
        a_count: |A| — adverse-множество §3.10.
        share_resolved: |B|/h_resolved; share_min/share_max — bounds §3.8
            (знаменатель расширяется на U; 0.0 при нулевых знаменателях).
        eventual: |B|/|A|; eventual_ub: (|B| + |U|)/(|A| + |U|) (0.0 при
            |A| = 0 — NaN запрещён контрактом публикации).
        tercile_bounds: (q(1/3), q(2/3)) t_adv по A, method="linear";
            (0.0, 0.0) при |A| = 0.
        terciles: статистики Q_1..Q_3 (U — клампинг по границам, §3.8).
    """

    n_raw: int
    classes: dict[str, int]
    shares: dict[str, float]
    h_resolved: int
    b_count: int
    a_count: int
    share_resolved: float
    share_min: float
    share_max: float
    eventual: float
    eventual_ub: float
    tercile_bounds: tuple[float, float]
    terciles: tuple[TercileStats, TercileStats, TercileStats]


def _tercile_stats(
    i: int,
    a_i: npt.NDArray[np.bool_],
    b_i: npt.NDArray[np.bool_],
    u_i: npt.NDArray[np.bool_],
    h: int,
    t_adv_t: npt.NDArray[np.float64],
) -> TercileStats:
    """Собрать статистику одного терциля по маскам A_i/B_i/U_i.

    Args:
        i: номер терциля (1 | 2 | 3).
        a_i: маска элементов A в терциле.
        b_i: маска элементов B в терциле (B ∩ A_i).
        u_i: маска unresolved, заклампленных в терциль.
        h: горизонт окна, баров.
        t_adv_t: нормализованные t̃_adv (конечные внутри A).

    Returns:
        :class:`TercileStats`.
    """
    n_a = int(a_i.sum())
    n_b = int(b_i.sum())
    n_u = int(u_i.sum())
    median_remaining = float(np.median(h - t_adv_t[a_i])) if n_a > 0 else 0.0
    return TercileStats(
        i=i,
        n_A=n_a,
        n_B=n_b,
        n_U=n_u,
        p=_ratio(n_b, n_a),
        p_min=_ratio(n_b, n_a + n_u),
        p_max=_ratio(n_b + n_u, n_a + n_u),
        median_remaining=median_remaining,
    )


def c5_cell(
    t_tp: npt.NDArray[np.int64],
    t_adv: npt.NDArray[np.int64],
    valid: npt.NDArray[np.bool_],
    h: int,
) -> C5Cell:
    """Чистый калькулятор ячейки C5 (k, h, a, dir) на маске V_h.

    ``t_tp = tau_{dir}[k]``, ``t_adv = tau_{противоположного}[a]``
    (§8, один проход; ответственность маппинга направлений — на вызывающем).
    Классы — ``classify_tp_adv(t_tp, t_adv, h)`` & valid; множества A/B §3.10 —
    только через ``normalize_tau`` (t̃ = +∞ при sentinel — no-hit/out-window
    исключаются автоматически, прямых сравнений int64-sentinel нет);
    ``U = unresolved_tp_adv_flag(...)`` & valid. Терцили §3.9: границы
    ``np.quantile(t_adv[a_mask], [1/3, 2/3], method="linear")``;
    A_i = {t_adv ≤ q1}, {q1 < t_adv ≤ q2}, {t_adv > q2} (на A); B_i = B ∩ A_i;
    U_i — клампинг t_adv по тем же границам (§3.8). При |A| = 0 границы
    (0.0, 0.0) и весь U по клампингу уходит в Q_3.

    Args:
        t_tp: 1-D int64 время первого tp-касания (sentinel −1).
        t_adv: 1-D int64 время первого adverse-касания (sentinel −1).
        valid: 1-D bool маска V_h (window_len ≥ h).
        h: горизонт окна, баров.

    Returns:
        :class:`C5Cell` — классы/доли, |A|/|B|/H_resolved, bounds §3.8,
        eventual-доли и терцили; NaN нигде (нулевые знаменатели → 0.0).

    Raises:
        ValueError: если входы не 1-D или разной длины.
        AssertionError: при нарушении разбиения классов (Σ ≠ n_raw),
            рассогласовании unresolved с unresolved_tp_adv_flag,
            пересечении TP_FIRST ∩ B (§3.9), |B| > |A| или |A| > n_raw
            (§3.10), нарушении порядокностей share_min ≤ share_resolved ≤
            share_max (§3.8) или eventual ≤ eventual_ub, Σ|U_i| ≠ |U|
            или доле/медиане вне допустимых границ.
    """
    _require_1d_aligned(t_tp=t_tp, t_adv=t_adv, valid=valid)
    codes = classify_tp_adv(t_tp, t_adv, h)
    tp_first = valid & (codes == int(OrderTpAdv.TP_FIRST))
    adv_first = valid & (codes == int(OrderTpAdv.ADV_FIRST))
    neither = valid & (codes == int(OrderTpAdv.NEITHER))
    unresolved = valid & (codes == int(OrderTpAdv.UNRESOLVED_TP_ADV))

    n_raw = int(valid.sum())
    classes: dict[str, int] = {
        "tp_first": int(tp_first.sum()),
        "adv_first": int(adv_first.sum()),
        "neither": int(neither.sum()),
        "unresolved": int(unresolved.sum()),
    }
    if sum(classes.values()) != n_raw:
        raise AssertionError(
            f"разбиение §3.4 нарушено: сумма классов {sum(classes.values())} "
            f"!= n_raw={n_raw}"
        )
    shares: dict[str, float] = (
        {key: value / n_raw for key, value in classes.items()}
        if n_raw > 0
        else {key: 0.0 for key in classes}
    )

    u_mask = valid & unresolved_tp_adv_flag(t_tp, t_adv, h)
    u_count = int(u_mask.sum())
    if u_count != classes["unresolved"]:
        raise AssertionError(
            f"двойной источник U разошёлся: unresolved_tp_adv_flag={u_count} "
            f"!= classify_tp_adv={classes['unresolved']}"
        )

    t_tp_t = normalize_tau(t_tp)
    t_adv_t = normalize_tau(t_adv)
    a_mask = valid & (t_adv_t <= h) & (t_adv_t < t_tp_t)
    b_mask = valid & (t_adv_t < t_tp_t) & (t_tp_t <= h)
    a_count = int(a_mask.sum())
    b_count = int(b_mask.sum())
    if int((tp_first & b_mask).sum()) != 0:
        raise AssertionError("инвариант §3.9 нарушен: TP_FIRST ∩ B ≠ ∅")
    if b_count > a_count or a_count > n_raw:
        raise AssertionError(
            f"§3.10 нарушено: |B|={b_count} ≤ |A|={a_count} ≤ n_raw={n_raw}"
        )

    h_resolved = classes["tp_first"] + b_count
    share_resolved = _ratio(b_count, h_resolved)
    share_min = _ratio(b_count, h_resolved + u_count)
    share_max = _ratio(b_count + u_count, h_resolved + u_count)
    eventual = _ratio(b_count, a_count)
    eventual_ub = _ratio(b_count + u_count, a_count + u_count)
    if not share_min <= share_resolved <= share_max:
        raise AssertionError(
            f"порядокность §3.8 нарушена: share_min={share_min} ≤ "
            f"share_resolved={share_resolved} ≤ share_max={share_max}"
        )
    if not eventual <= eventual_ub:
        raise AssertionError(
            f"порядочность §3.10 нарушена: eventual={eventual} > "
            f"eventual_ub={eventual_ub} (|B|/|A| против (|B|+|U|)/(|A|+|U|))"
        )

    if a_count > 0:
        bounds = np.quantile(t_adv_t[a_mask], [1.0 / 3.0, 2.0 / 3.0], method="linear")
        q1, q2 = float(bounds[0]), float(bounds[1])
    else:
        q1 = q2 = 0.0
    band_1 = t_adv_t <= q1
    band_2 = (t_adv_t > q1) & (t_adv_t <= q2)
    band_3 = t_adv_t > q2
    terciles: tuple[TercileStats, TercileStats, TercileStats] = (
        _tercile_stats(1, a_mask & band_1, b_mask & band_1, u_mask & band_1, h, t_adv_t),
        _tercile_stats(2, a_mask & band_2, b_mask & band_2, u_mask & band_2, h, t_adv_t),
        _tercile_stats(3, a_mask & band_3, b_mask & band_3, u_mask & band_3, h, t_adv_t),
    )
    if sum(t.n_U for t in terciles) != u_count:
        raise AssertionError(
            f"клампинг §3.8 неполон: Σ|U_i|={sum(t.n_U for t in terciles)} "
            f"!= |U|={u_count}"
        )

    fractions = [
        *shares.values(),
        share_resolved,
        share_min,
        share_max,
        eventual,
        eventual_ub,
        *(v for t in terciles for v in (t.p, t.p_min, t.p_max)),
    ]
    if any(not 0.0 <= v <= 1.0 for v in fractions):
        raise AssertionError("опубликованная доля вне [0, 1] (или NaN)")
    if any(not t.median_remaining >= 0.0 for t in terciles):
        raise AssertionError("median_remaining отрицательна (или NaN)")

    return C5Cell(
        n_raw=n_raw,
        classes=classes,
        shares=shares,
        h_resolved=h_resolved,
        b_count=b_count,
        a_count=a_count,
        share_resolved=share_resolved,
        share_min=share_min,
        share_max=share_max,
        eventual=eventual,
        eventual_ub=eventual_ub,
        tercile_bounds=(q1, q2),
        terciles=terciles,
    )
