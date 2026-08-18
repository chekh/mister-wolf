# src/zetaflowlab/atlas/artifact.py
"""Артефакты атласа: atlas_cells.parquet, verdict.yaml, atlas_report.md (§5.4–§5.6, §6, §9.3).

Трёхслойный вывод (§5.5):
1. Карта стилей (:class:`StyleMapRow`) — горизонт, плотность, ожидание над
   полом (gross/net), риск (дрожание + гэпы), загрузка (номинальная/эффективная).
2. Векторный вердикт (:class:`StyleCell`, :class:`VerdictArtifact`) — по ячейкам
   «стиль × режим»: пригоден/условно/непригоден (пороги §9.3) + агрегатный исход.
3. Слой непредусмотренного (``observations``) — находки вне C1–C5, статус
   ``[наблюдение]``, в вердикт не входит до подтверждения (§5.5 п.3, §7 п.7).

**Инвариант L20 (спека §3, §8):** все сводные продукты публикуются при любом
вердикте — ранний выход по «не годится» не должен обрезать карту стилей /
кривые загрузки / измеренные горизонты. Вердикт — поле, а не gate публикации.

Provenance (§6): каждый артефакт несёт ``data_hash``, ``code_version``, ``seed``,
``lineup_hash`` (детерминированный хэш лестниц атласа — методологическая сетка,
отделена от идентификации прогона).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, cast

import numpy as np
import polars as pl
import yaml
from loguru import logger
from pydantic import BaseModel, Field

# --- Карта стилей (§5.4): полосы горизонтов, прочитанные с формы данных ------

#: ``(style_name, lo_min, hi_min)`` — полуинтервалы минут, покрывают (0, ∞).
#: внутричасовая строка = вердикт F1 v1 (мертва, §5.4).
STYLE_BANDS: tuple[tuple[str, int, int], ...] = (
    ("intraday_hourly", 1, 480),  # ≤ 8ч — внутричасовой
    ("intraday", 481, 1440),  # 8ч..1д — внутридневной
    ("swing_2_5d", 1441, 7200),  # 1д..5д — свинг
    ("positional_1_2w", 7201, 14400),  # 5д..2н — позиционный
    ("trend_gt_2w", 14401, 10**9),  # > 2н — трендовый
)

#: Порог горизонта «спекулятивного ТЗ» (2 недели, §9.3): выше — «инвестирование».
_SPEC_HORIZON_MAX_MIN: int = 14400  # 2 торговые недели (10 торговых дней)

#: Уровень FDR для BH-процедуры (§9.3 (б), §7 п.6).
_FDR_Q: float = 0.05

#: Колонки ``atlas_cells.parquet`` (§6 артефакт 1): агрегаты по ячейкам
#: ``(split, regime_v, regime_t, regime_w, event_type, horizon_min)``.
CELLS_SCHEMA: dict[str, pl.DataType] = cast(
    "dict[str, pl.DataType]",
    {
        "split": pl.Utf8,
        "regime_v": pl.Utf8,
        "regime_t": pl.Utf8,
        "regime_w": pl.Utf8,
        "event_type": pl.Utf8,
        "horizon_min": pl.Int64,
        "n": pl.Int64,
        "mfe_q50": pl.Float64,
        "mae_q50": pl.Float64,
        "t_mfe_q50": pl.Float64,
        "t_mae_q50": pl.Float64,
        "osc_crossings_mean": pl.Float64,
        "gap_count_mean": pl.Float64,
    },
)


# --- Benjamini–Hochberg FDR (DRY с portrait/artifact.py) ---------------------


def bh_fdr(pvals: np.ndarray, q: float = _FDR_Q) -> np.ndarray:
    """Маска отвержения H0 по Benjamini–Hochberg (порог ``q``).

    Дублирует :func:`zetaflowlab.portrait.artifact._bh_fdr` (10 строк, граница
    пакетов portrait/atlas — общий модуль статистики вынесен не был, KISS).
    Используется для §9.3 (б): «ожидание над полом > 0 с BH-FDR по семейству ячеек».

    Args:
        pvals: одномерный массив p-value.
        q: желаемый уровень FDR.

    Returns:
        Булев массив той же длины: ``True`` где H0 отвергается.
    """
    m = int(pvals.shape[0])
    if m == 0:
        return np.empty(0, dtype=bool)
    order = np.argsort(pvals)
    ranked = pvals[order]
    thresh = q * (np.arange(m) + 1) / m
    passed = ranked <= thresh
    if not bool(passed.any()):
        return np.zeros(m, dtype=bool)
    k_max = int(np.flatnonzero(passed)[-1])
    mask = np.zeros(m, dtype=bool)
    mask[order[: k_max + 1]] = True
    return mask


def _bootstrap_mean_pvalue(
    values: np.ndarray,
    block_len: int,
    n_boot: int,
    seed: int,
) -> tuple[float, float, float]:
    """Бутстреп-CI и односторонний p-value для ``H0: E[offer] ≤ 0`` (§9.3 (б)).

    Блочный бутстреп среднего (MBB): ``n_boot`` реплик, CI = перцентили 2.5%/97.5%
    бутстреп-распределения среднего; ``p_value`` = доля реплик со средним ≤ 0
    (односторонний тест «ожидание > 0»). Детерминизм: ``np.random.default_rng(seed)``.

    Args:
        values: выборка offer (amplitude − floor), float64.
        block_len: длина блока MBB (для автокорреляции, §7 п.5).
        n_boot: число бутстреп-реплик.
        seed: seed ГПСД (воспроизводимость).

    Returns:
        ``(mean_point, ci_lo, p_value)``; ``(nan, nan, 1.0)`` при ``n == 0``.
    """
    n = int(values.shape[0])
    if n == 0:
        return float("nan"), float("nan"), 1.0
    bl = max(1, int(block_len))
    if bl > n:
        bl = n
    n_blocks = int(np.ceil(n / bl))
    rng = np.random.default_rng(seed)
    starts = rng.integers(0, n - bl + 1, size=(n_boot, n_blocks))
    offsets = np.arange(bl, dtype=np.int64)
    block_idx = (starts[:, :, None] + offsets[None, None, :]).reshape(n_boot, n_blocks * bl)[:, :n]
    boot_means = values[block_idx].mean(axis=1)
    mean_point = float(values.mean())
    ci_lo = float(np.quantile(boot_means, 0.025))
    p_value = float((boot_means <= 0.0).mean())
    return mean_point, ci_lo, p_value


# --- Pydantic-модели артефакта ----------------------------------------------


class StyleCell(BaseModel):
    """Ячейка векторного вердикта «стиль × режим» (§5.5, §9.3).

    Критерии пригодности §9.3 verbatim:
    (а) доля ситуаций выше пола ≥ 20% баров ИЛИ плотность ≥ 2/неделю;
    (б) ожидание над полом > 0 с BH-FDR по семейству ячеек;
    (в) риск (дрожание + q95 гэпа) — опубликован; выразимость в ``Y_max`` —
        за потребителем (атлас ``Y_max`` не знает, трассировка §5.6).

    Attributes:
        style: имя стиля (:data:`STYLE_BANDS`).
        regime_v: режим волатильности (``V1|V2|V3``).
        horizon_min: репрезентативный горизонт стиля (минуты).
        n: число баров ячейки (split=train, finite amplitude).
        floor_coverage_pct: (а) доля баров с ``amplitude ≥ floor`` (ситуаций).
        density_per_week: (а) альтернатива — плотность ситуаций/неделю.
        offer_mean_bps: ожидание над полом (``amplitude − floor``), точечно.
        offer_ci_lo_bps: нижняя граница 95% бутстреп-CI среднего offer.
        offer_pvalue: p-value одностороннего теста ``E[offer] > 0``.
        passes_fdr: прошла ли ячейка BH-FDR(q=0.05) по семейству ячеек.
        risk_osc_q95_bps: q95 дрожания пути (``osc_max_subswing_amp``).
        risk_gap_q95_bps: q95 размера гэпа на пути.
        loading_nominal_pct: номинальная загрузка стиля на этом горизонте.
        is_viable: (а) ∧ (б) — ячейка пригодна.
    """

    model_config = {"extra": "forbid"}

    style: str
    regime_v: str
    horizon_min: int
    n: int
    floor_coverage_pct: float
    density_per_week: float
    offer_mean_bps: float
    offer_ci_lo_bps: float
    offer_pvalue: float
    passes_fdr: bool
    risk_osc_q95_bps: float
    risk_gap_q95_bps: float
    loading_nominal_pct: float
    is_viable: bool


class StyleMapRow(BaseModel):
    """Строка карты стилей (§5.4): один стиль, агрегат по режимам.

    Attributes:
        style: имя стиля.
        horizon_range_min: ``(lo, hi)`` полосы горизонтов (минуты).
        horizon_rep_min: репрезентативный горизонт стиля.
        density_per_week: плотность ситуаций (средняя по режимам).
        offer_gross_bps: ожидание над полом gross (``amplitude − floor``).
        offer_net_bps: offer за вычетом sensitivity slippage (1 bps аудит).
        risk_osc_q95_bps: q95 дрожания пути.
        risk_gap_q95_bps: q95 гэпа на пути.
        loading_nominal_pct: номинальная загрузка капитала.
        loading_effective_pct: эффективная загрузка по стилям — ``None``: не
            вычислена (синхронность считается только агрегатно в run, не по
            стилям; KISS — не плодить мёртвую логику load_e=load_n).
        verdict: ``пригоден|условно пригоден|непригоден`` (по ячейкам стиля).
        note: пометка (для внутричасовой — вердикт F1 v1).
    """

    model_config = {"extra": "forbid"}

    style: str
    horizon_range_min: tuple[int, int]
    horizon_rep_min: int
    density_per_week: float
    offer_gross_bps: float
    offer_net_bps: float
    risk_osc_q95_bps: float
    risk_gap_q95_bps: float
    loading_nominal_pct: float
    loading_effective_pct: float | None = None
    verdict: str
    note: str = ""


class VerdictArtifact(BaseModel):
    """Решающий артефакт атласа (статус: измерено на выборке).

    Трёхслойная структура §5.5: ``style_map`` (карта стилей §5.4), ``cells``
    (векторный вердикт §5.5/§9.3), ``observations`` (слой [наблюдение]).
    Все сводные продукты публикуются при любом ``aggregate_verdict`` (L20).

    Attributes:
        status: ``measured_on_sample`` (§7 п.1).
        symbol: тикер инструмента.
        aggregate_verdict: агрегатный исход (§5.5): ``single_style`` /
            ``composite`` / ``conditional`` / ``invest_only`` / ``unfit``.
        verdict_qualification: пометка-квалификация вердикта — допущения, при
            которых он получен (swaps=0, sensitivity slippage, sub-sample
            загрузки); реалистичные свопы могут изменить агрегат.
        f1_verdict_intraday: наследие вердикта F1 v1 для внутричасовой строки.
        style_map: карта стилей (§5.4).
        cells: векторный вердикт по ячейкам стиль × режим (§5.5/§9.3).
        saturation_horizon_min: измеренный горизонт насыщения (§4.3, §5.2).
        memory_direction_horizon_min: измеренный горизонт памяти (направление).
        memory_volatility_horizon_min: измеренный горизонт памяти (волатильность).
        loading_nominal_pct: номинальная загрузка (макс на пригодных стилях).
        loading_effective_pct: эффективная загрузка (с поправкой на синхронность).
        management_premium_bps: премия за управление (раздача − уловимое
            скобками); NaN — производный слой гонки скобок (этап 2).
        n_comparisons: число опубликованных сравнений (для FDR, §6 артефакт 2).
        observations: слой [наблюдение] (§5.5 п.3) — находки вне C1–C5.
        predictions: проверка предсказаний П1–П5 (§9.2): verdict на каждое.
        data_hash: SHA-256 источника данных (внешний).
        code_version: версия кода лаборатории.
        seed: зерно детерминизма.
        lineup_hash: хэш лестниц атласа (методологическая сетка, §6).
    """

    model_config = {"extra": "forbid"}

    status: str = "measured_on_sample"
    symbol: str = ""
    aggregate_verdict: str = "unfit"
    verdict_qualification: str = ""
    f1_verdict_intraday: str = "dead (F1 портрета v1: 1m-гонка скобок)"
    style_map: list[StyleMapRow] = Field(default_factory=list)
    cells: list[StyleCell] = Field(default_factory=list)
    saturation_horizon_min: int = 0
    memory_direction_horizon_min: int = 0
    memory_volatility_horizon_min: int = 0
    loading_nominal_pct: float = 0.0
    loading_effective_pct: float = 0.0
    management_premium_bps: float = float("nan")
    n_comparisons: int = 0
    observations: list[str] = Field(default_factory=list)
    predictions: dict[str, str] = Field(default_factory=dict)
    data_hash: str = ""
    code_version: str = ""
    seed: int = 0
    lineup_hash: str = ""


# --- Сборка вердикта --------------------------------------------------------


def style_for_horizon(horizon_min: int) -> str:
    """Имя стиля для горизонта (:data:`STYLE_BANDS`).

    Args:
        horizon_min: горизонт в минутах.

    Returns:
        Имя стиля (полоса, содержащая ``horizon_min``).
    """
    for name, lo, hi in STYLE_BANDS:
        if lo <= horizon_min <= hi:
            return name
    return STYLE_BANDS[-1][0]


def representative_horizon(
    style: str,
    horizons: tuple[int, ...],
) -> int:
    """Репрезентативный горизонт стиля: ближайший из лестницы к геом. середине полосы.

    Args:
        style: имя стиля.
        horizons: лестница горизонтов конфига.

    Returns:
        Горизонт из ``horizons``, ближайший к середине полосы стиля (минуты).
    """
    band = next(b for b in STYLE_BANDS if b[0] == style)
    lo = max(1, band[1])
    hi = band[2]
    target = int(np.sqrt(float(lo) * float(min(hi, max(horizons)))))
    return int(min(horizons, key=lambda h: abs(int(h) - target)))


def build_verdict(
    *,
    symbol: str,
    style_cell_inputs: list[dict[str, Any]],
    saturation_horizon_min: int,
    memory_direction_horizon_min: int,
    memory_volatility_horizon_min: int,
    loading_nominal_pct: float,
    loading_effective_pct: float,
    observations: list[str],
    predictions: dict[str, str],
    verdict_qualification: str = "",
    fdr_q: float = _FDR_Q,
) -> VerdictArtifact:
    """Собрать векторный вердикт + агрегатный исход (§5.5, §9.3, §9.4).

    ``style_cell_inputs`` — список словарей с ключами ``(style, regime_v,
    horizon_min, n, floor_coverage_pct, density_per_week, offer_bps (np.ndarray),
    risk_osc_q95_bps, risk_gap_q95_bps, loading_nominal_pct, block_len, n_boot,
    seed)``. Для каждой ячейки считается бутстреп-CI/p-value offer; затем
    BH-FDR по p-values семейства; viable = (а) ∧ (б). Агрегатный вердикт — по
    §5.5/§9.3: unfit / invest_only / conditional / single_style / composite.

    Все продукты публикуются при любом вердикте (L20): ``style_map`` и ``cells``
    заполняются всегда; ``aggregate_verdict`` — поле.

    Args:
        symbol: тикер.
        style_cell_inputs: входы ячеек стиль × режим (см. выше).
        saturation_horizon_min: измеренный горизонт насыщения.
        memory_direction_horizon_min: память (направление).
        memory_volatility_horizon_min: память (волатильность).
        loading_nominal_pct: номинальная загрузка (макс на пригодных).
        loading_effective_pct: эффективная загрузка.
        observations: слой [наблюдение].
        predictions: проверки П1–П5.
        fdr_q: уровень FDR BH-процедуры.

    Returns:
        :class:`VerdictArtifact` с заполненными слоями (карта/вердикт/наблюдения).
    """
    # (б) ожидание над полом: бутстреп-CI + p-value per ячейка.
    pvals = np.empty(len(style_cell_inputs), dtype=np.float64)
    cell_stats: list[dict[str, Any]] = []
    for i, inp in enumerate(style_cell_inputs):
        mean_pt, ci_lo, p_value = _bootstrap_mean_pvalue(
            np.asarray(inp["offer_bps"], dtype=np.float64),
            block_len=int(inp["block_len"]),
            n_boot=int(inp["n_boot"]),
            seed=int(inp["seed"]),
        )
        pvals[i] = p_value
        cell_stats.append(
            {**inp, "offer_mean_bps": mean_pt, "offer_ci_lo_bps": ci_lo, "offer_pvalue": p_value}
        )
    passes = bh_fdr(pvals, q=fdr_q)

    cells: list[StyleCell] = []
    for st, ok in zip(cell_stats, passes, strict=True):
        # (а) доля ситуаций ≥ 20% ИЛИ плотность ≥ 2/неделю (§9.3).
        crit_a = st["floor_coverage_pct"] >= 20.0 or st["density_per_week"] >= 2.0
        # (б) offer CI lo > 0 ∧ BH-FDR.
        crit_b = bool(ok) and st["offer_ci_lo_bps"] > 0.0
        cells.append(
            StyleCell(
                style=st["style"],
                regime_v=st["regime_v"],
                horizon_min=int(st["horizon_min"]),
                n=int(st["n"]),
                floor_coverage_pct=float(st["floor_coverage_pct"]),
                density_per_week=float(st["density_per_week"]),
                offer_mean_bps=float(st["offer_mean_bps"]),
                offer_ci_lo_bps=float(st["offer_ci_lo_bps"]),
                offer_pvalue=float(st["offer_pvalue"]),
                passes_fdr=bool(ok),
                risk_osc_q95_bps=float(st["risk_osc_q95_bps"]),
                risk_gap_q95_bps=float(st["risk_gap_q95_bps"]),
                loading_nominal_pct=float(st["loading_nominal_pct"]),
                is_viable=bool(crit_a and crit_b),
            )
        )

    # Карта стилей (§5.4): агрегат по режимам внутри стиля.
    # offer_net: sensitivity slippage 1 bps (§4.5 аудит) — нижняя граница сетки
    # конфига {1, 2} bps. Выбор 1 bps (KISS): на offer_ci_lo ≫ 1 bps (десятки
    # bps в этом прогоне) смена 1→2 не меняет viable-ячеек; верхняя граница 2 bps
    # учтена в квалификации вердикта.
    style_map: list[StyleMapRow] = []
    for name, lo, hi in STYLE_BANDS:
        style_cells = [c for c in cells if c.style == name]
        if style_cells:
            dens = float(np.mean([c.density_per_week for c in style_cells]))
            offer_g = float(np.mean([c.offer_mean_bps for c in style_cells]))
            offer_n = offer_g - 1.0  # sensitivity slippage 1 bps (§4.5, нижняя граница)
            osc = float(np.mean([c.risk_osc_q95_bps for c in style_cells]))
            gap = float(np.mean([c.risk_gap_q95_bps for c in style_cells]))
            load_n = float(np.mean([c.loading_nominal_pct for c in style_cells]))
            viable = [c for c in style_cells if c.is_viable]
            if viable and len(viable) == len(style_cells):
                v = "пригоден"
            elif viable:
                v = "условно пригоден"
            else:
                v = "непригоден"
            note = "мертва (F1 v1)" if name == "intraday_hourly" else ""
            h_rep = style_cells[0].horizon_min
        else:
            dens = offer_g = offer_n = osc = gap = load_n = 0.0
            v = "непригоден"
            note = "нет данных" if name != "intraday_hourly" else "мертва (F1 v1)"
            h_rep = 0
        style_map.append(
            StyleMapRow(
                style=name,
                horizon_range_min=(lo, hi),
                horizon_rep_min=h_rep,
                density_per_week=dens,
                offer_gross_bps=offer_g,
                offer_net_bps=offer_n,
                risk_osc_q95_bps=osc,
                risk_gap_q95_bps=gap,
                loading_nominal_pct=load_n,
                loading_effective_pct=None,  # не вычислена по стилям (M4 KISS)
                verdict=v,
                note=note,
            )
        )

    # Агрегатный вердикт (§5.5, §9.3, §9.4).
    viable_cells = [c for c in cells if c.is_viable]
    aggregate = _aggregate_verdict(viable_cells, style_map, loading_effective_pct)

    return VerdictArtifact(
        symbol=symbol,
        aggregate_verdict=aggregate,
        verdict_qualification=verdict_qualification,
        style_map=style_map,
        cells=cells,
        saturation_horizon_min=int(saturation_horizon_min),
        memory_direction_horizon_min=int(memory_direction_horizon_min),
        memory_volatility_horizon_min=int(memory_volatility_horizon_min),
        loading_nominal_pct=float(loading_nominal_pct),
        loading_effective_pct=float(loading_effective_pct),
        n_comparisons=len(cells),
        observations=observations,
        predictions=predictions,
    )


def _aggregate_verdict(
    viable_cells: list[StyleCell],
    style_map: list[StyleMapRow],
    loading_effective_pct: float,
) -> str:
    """Агрегатный исход по §5.5/§9.3/§9.4: unfit/invest_only/conditional/... .

    - нет viable → ``unfit`` (G1: инструмент не для спекуляции).
    - viable только на горизонтах > 2 недель → ``invest_only`` (G2).
    - viable в режиме (не все V) без покрытия загрузки → ``conditional``.
    - один стиль viable и загрузка ≥ G3 порога (40%) → ``single_style``.
    - несколько стилей → ``composite``.
    """
    if not viable_cells:
        return "unfit"
    spec_viable = [c for c in viable_cells if c.horizon_min <= _SPEC_HORIZON_MAX_MIN]
    if not spec_viable:
        return "invest_only"
    # Покрытие загрузки (G3): загрузка ≥ 40% на пригодных стилях.
    viable_styles = {c.style for c in spec_viable}
    # Все ли режимы покрыты (без режимной вырезки)?
    regimes_covered = {c.regime_v for c in spec_viable}
    g3_ok = loading_effective_pct >= 40.0
    if not g3_ok:
        return "conditional"  # пригодность есть, но цель загрузки не достигнута
    if len(viable_styles) == 1 and len(regimes_covered) == 3:
        return "single_style"
    if len(regimes_covered) < 3:
        return "conditional"
    return "composite"


# --- Отчёт и запись артефактов ----------------------------------------------


def render_report(
    verdict: VerdictArtifact, scale_curve_full: pl.DataFrame, cells_df: pl.DataFrame
) -> str:
    """Текст ``atlas_report.md``: карта стилей, вердикт, кривая масштаба, П1–П5.

    Главный график (кривая масштаба vs √t по режимам, §6 артефакт 3) — таблично
    (визуализация — отдельный трек). Карта стилей, векторный вердикт, горизонты,
    загрузка, гэпы/свопы, проверка П1–П5, слой наблюдений, трассировка §5.6.

    Args:
        verdict: модель вердикта.
        scale_curve_full: кривая масштаба (описательная, вся история).
        cells_df: ``atlas_cells.parquet`` (агрегаты по ячейкам).

    Returns:
        Строка Markdown-отчёта.
    """
    _ = cells_df  # зарезервировано для расширенных таблиц
    eff_load_str = (
        f"{verdict.loading_effective_pct:.1f}%"
        if verdict.loading_effective_pct is not None
        else "не вычислена (None)"
    )
    lines: list[str] = [
        "# Атлас инструмента — отчёт",
        "",
        f"- Инструмент: **{verdict.symbol}**",
        f"- Статус: {verdict.status}",
        f"- **Агрегатный вердикт: `{verdict.aggregate_verdict}`**",
        f"- Квалификация вердикта: {verdict.verdict_qualification}",
        f"- Внутричасовая строка: {verdict.f1_verdict_intraday}",
        f"- Сравнений (для FDR): {verdict.n_comparisons}",
        "",
        "## Измеренные горизонты (§4.3, §5.2)",
        f"- Насыщение: {verdict.saturation_horizon_min} мин",
        f"- Память (направление, блочная permutation ~неделя): "
        f"{verdict.memory_direction_horizon_min} мин",
        f"- Память (волатильность, блочная permutation ~неделя): "
        f"{verdict.memory_volatility_horizon_min} мин",
        "",
        "## Кривые загрузки (§5.3)",
        f"- Номинальная: {verdict.loading_nominal_pct:.1f}% (sub-sample step=6, "
        "завышена; надёжен только качественный вывод ≫40%)",
        f"- Эффективная (агрегатная, с поправкой на синхронность): {eff_load_str}",
        "",
        "## Премия за управление (§2)",
        f"- {verdict.management_premium_bps} bps (NaN — производный слой гонки скобок, этап 2)",
        "",
        "## Карта стилей (§5.4)",
        "",
        "| Стиль | Горизонт (мин) | Плотность/нед | Offer gross | Offer net | "
        "Risk osc q95 | Risk gap q95 | Загрузка ном. | Загрузка эфф. | Вердикт |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in verdict.style_map:
        le_str = "—" if r.loading_effective_pct is None else f"{r.loading_effective_pct:.1f}%"
        lines.append(
            f"| {r.style} | {r.horizon_rep_min} | {r.density_per_week:.2f} | "
            f"{r.offer_gross_bps:.1f} | {r.offer_net_bps:.1f} | "
            f"{r.risk_osc_q95_bps:.1f} | {r.risk_gap_q95_bps:.1f} | "
            f"{r.loading_nominal_pct:.1f}% | {le_str} | "
            f"{r.verdict} |"
        )
    lines.append("")
    lines.append("## Векторный вердикт (ячейки стиль × режим, §5.5/§9.3)")
    lines.append("")
    lines.append(
        "| Стиль | Регим | h (мин) | n | Покрытие % | Плотн/нед | "
        "Offer mean | Offer CI lo | p-value | FDR | Viable |"
    )
    lines.append("|---|---|---|---|---|---|---|---|---|---|---|")
    for c in verdict.cells:
        lines.append(
            f"| {c.style} | {c.regime_v} | {c.horizon_min} | {c.n} | "
            f"{c.floor_coverage_pct:.1f} | {c.density_per_week:.2f} | "
            f"{c.offer_mean_bps:.1f} | {c.offer_ci_lo_bps:.1f} | "
            f"{c.offer_pvalue:.3f} | {c.passes_fdr} | {c.is_viable} |"
        )
    lines.append("")
    lines.append("## Кривая масштаба vs √t (описательная, вся история, §5.1)")
    lines.append("")
    if scale_curve_full.height > 0:
        lines.append("```")
        lines.append(scale_curve_full.to_pandas().to_string(index=False))
        lines.append("```")
    else:
        lines.append("_нет данных_")
    lines.append("")
    lines.append("## Проверка предсказаний П1–П5 (§9.2)")
    lines.append("")
    for k in sorted(verdict.predictions):
        lines.append(f"- **{k}**: {verdict.predictions[k]}")
    lines.append("")
    lines.append("## Слой [наблюдение] (§5.5 п.3 — вне вердикта)")
    lines.append("")
    for obs in verdict.observations:
        lines.append(f"- [наблюдение] {obs}")
    if not verdict.observations:
        lines.append("- _нет_")
    lines.append("")
    lines.append("## Provenance (§6)")
    lines.append(f"- data_hash: `{verdict.data_hash}`")
    lines.append(f"- code_version: {verdict.code_version}")
    lines.append(f"- seed: {verdict.seed}")
    lines.append(f"- lineup_hash: `{verdict.lineup_hash}`")
    lines.append("")
    return "\n".join(lines)


def write_atlas_artifacts(
    *,
    cells_df: pl.DataFrame,
    verdict: VerdictArtifact,
    scale_curve_full: pl.DataFrame,
    out_dir: Path,
    report_md: str | None = None,
    provenance: dict[str, str | int] | None = None,
) -> dict[str, Path]:
    """Запись артефактов атласа (§6): parquet + yaml + report.

    ``atlas_cells.parquet``, ``verdict.yaml``, ``atlas_report.md``.

    ``provenance`` обогащает поля ``VerdictArtifact`` (``data_hash``,
    ``code_version``, ``seed``, ``lineup_hash``, ``symbol``). Источник истины
    хэшей/зерна — у оркестратора (run), не у артефакта.

    Все продукты публикуются при любом ``verdict.aggregate_verdict`` (L20):
    ``cells_df``, ``verdict.yaml`` (со всеми слоями) и ``atlas_report.md``
    записываются безусловно — ранний выход по «не годится» недопустим (§3).

    Args:
        cells_df: агрегаты по ячейкам (:func:`~zetaflowlab.atlas.aggregate.aggregate_excursions`).
        verdict: модель вердикта (:func:`build_verdict`).
        scale_curve_full: кривая масштаба (для отчёта).
        out_dir: каталог назначения (создаётся при отсутствии).
        report_md: готовый текст отчёта или ``None`` (генерируется автоматически).
        provenance: метаданные прогона (хэши/зерно/символ).

    Returns:
        Словарь ``{"cells", "verdict", "report"}`` с путями артефактов.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    if provenance:
        for fld in ("data_hash", "code_version", "seed", "lineup_hash", "symbol"):
            if fld in provenance:
                setattr(verdict, fld, provenance[fld])

    paths: dict[str, Path] = {}

    # atlas_cells.parquet (§6 артефакт 1). Детерминированная запись: те же
    # данные + порядок строк → байтово идентичный файл (без timestamp в metadata).
    cells_path = out_dir / "atlas_cells.parquet"
    cells_df.write_parquet(cells_path)
    paths["cells"] = cells_path

    # verdict.yaml (§6 артефакт 2) — pydantic → YAML, sort_keys=False (логический
    # порядок полей модели), allow_unicode. Round-trip стабилен (тест).
    verdict_path = out_dir / "verdict.yaml"
    verdict_path.write_text(
        yaml.safe_dump(verdict.model_dump(mode="json"), allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )
    paths["verdict"] = verdict_path

    # atlas_report.md (§6 артефакт 3).
    report_path = out_dir / "atlas_report.md"
    report_path.write_text(
        report_md if report_md is not None else render_report(verdict, scale_curve_full, cells_df),
        encoding="utf-8",
    )
    paths["report"] = report_path

    logger.info(
        "атлас: артефакты записаны в {} (вердикт={}, n_comparisons={})",
        out_dir,
        verdict.aggregate_verdict,
        verdict.n_comparisons,
    )
    return paths


__all__ = [
    "CELLS_SCHEMA",
    "STYLE_BANDS",
    "StyleCell",
    "StyleMapRow",
    "VerdictArtifact",
    "bh_fdr",
    "build_verdict",
    "render_report",
    "representative_horizon",
    "style_for_horizon",
    "write_atlas_artifacts",
]
