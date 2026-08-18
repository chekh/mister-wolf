# src/zetaflowlab/atlas/config.py
"""Конфиг атласа инструмента и контейнеры записей §4.1 (спека v2 §3, §4, §6, §7, §9.3).

Атлас измеряет инструмент **без предположений о стиле**: сырая раздача
экскурсий от каждого бара; стиль торговли — вывод, не вход (§1–§2).
Единицы записи — сырые (bps и минуты/дни); нормировка ATR-линейками — на
этапе анализа, не в rollout (§2, §4.1).

Паттерны конфига — наследие :mod:`zetaflowlab.portrait.config` и
:mod:`zetaflowlab.config` (``extra="forbid"``, provenance-поля, модельные
валидаторы инвариантов).

Provenance (§6): каждый решающий артефакт несёт ``data_hash``, ``code_version``,
``seed`` и ``lineup_hash`` (детерминированный хэш лестниц горизонтов/линеек/
уровней). ``data_hash`` и ``seed`` — внешние; ``lineup_hash`` вычисляется из
лестниц и НЕ зависит от provenance-полей (методологическая сетка отделена от
идентификации прогона).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import numpy as np
import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

# --- Единицы времени --------------------------------------------------------
#
# Горизонты выражены в минутах «живого» торгового времени (бары идут в
# календарном времени, но FX EURUSD торгуется 24/5; 1 торговый день = 1440
# минут «живого» времени). H_max = 60 торговых дней = 86400 минут (§4.1, §7).
# «1 неделя» лестницы = 5 торговых дней = 7200 минут (торговая неделя), что
# совпадает с опорной точкой «5д» — поэтому 5д и 1н в минутах идентичны и в
# дефолтной лестнице не дублируются. Реальное сопоставление горизонтов с
# барами (календарными vs живыми, с учётом выходных) — ответственность
# rollout (Task 2), не конфига.

#: Дефолтная лестница горизонтов в минутах (спека §4.1).
#: {30м, 1ч, 2ч, 4ч, 8ч, 1д, 2д, 3д, 5д≡1н, 2н, 3н, …, 12н≡H_max}.
DEFAULT_HORIZONS_MIN: tuple[int, ...] = (
    30,  # 30м
    60,  # 1ч
    120,  # 2ч
    240,  # 4ч
    480,  # 8ч
    1440,  # 1д
    2880,  # 2д
    4320,  # 3д
    7200,  # 5д ≡ 1 торговая неделя
    14400,  # 2н
    21600,  # 3н
    28800,  # 4н
    36000,  # 5н
    43200,  # 6н
    50400,  # 7н
    57600,  # 8н
    64800,  # 9н
    72000,  # 10н
    79200,  # 11н
    86400,  # 12н ≡ 60 торговых дней ≡ H_max
)

#: 1 торговый день в минутах «живого» времени FX EURUSD (24ч рынок).
TRADING_DAY_MINUTES: int = 1440

#: H_max — потолок горизонта раздачи (спека §4.1, §7), торговых дней.
H_MAX_TRADING_DAYS: int = 60


class VerdictThresholds(BaseModel):
    """Пороги вердикта §9.3 / §9.4 — verbatim, утверждены пользователем 2026-08-07.

    Эти значения — методологические константы, зафиксированные ДО запуска
    (§2: «грамматика вердикта и её пороги фиксируются до запуска»). Тест
    ``test_verdict_thresholds_spec_9_3_values`` проверяет точные значения по
    спеке. Изменение — только явным пересмотром спеки с ревью.

    Пороги применяются **по ячейкам «стиль × режим»** (вердикт векторный, §5.5).

    Attributes:
        min_floor_coverage_pct: (а) доля баров выше пола позитивности ≥ 20%.
        min_situation_density_per_week: (а) альт. критерий — ≥ 2 ситуаций/неделю.
        expectation_test: (б) ожидание над полом > 0 с BH-FDR по семейству ячеек.
        trader_no_hft: фильтр трейдера — HFT запрещён.
        trader_max_horizon_weeks: фильтр трейдера — горизонт ≤ 2 недель.
        g3_loading_threshold_pct: (§9.4 G3) загрузка < 40% на всех прошедших
            стилях → цель «постоянно в рынке» недостижима на одном инструменте.
    """

    model_config = ConfigDict(extra="forbid")

    min_floor_coverage_pct: float = 20.0
    min_situation_density_per_week: float = 2.0
    expectation_test: Literal["bh_fdr"] = "bh_fdr"
    trader_no_hft: bool = True
    trader_max_horizon_weeks: int = 2
    g3_loading_threshold_pct: float = 40.0


#: Разрешение пути на зоне горизонта (спека §4.2).
Resolution = Literal["1m", "H1", "D1"]


class ResolutionZone(BaseModel):
    """Зона разрешения пути (спека §4.2: разрешение гаснет с расстоянием).

    Полуоткрытый интервал ``(prev_upper, upper_bound_min]``; последняя зона
    имеет ``upper_bound_min = None`` (бесконечность). Зоны смежны: верхняя
    граница предыдущей = нижняя следующей, без дыр и пересечений.

    Attributes:
        resolution: шаг bars path (1m — ближняя зона, H1 — дневная, D1 — недельная).
        upper_bound_min: верхняя граница зоны в минутах (вкл.); ``None`` — ∞.
    """

    model_config = ConfigDict(extra="forbid")

    resolution: Resolution
    upper_bound_min: int | None = Field(default=None, gt=0)


class SwapRates(BaseModel):
    """Свопы как функция длительности удержания (пол позитивности §4.5).

    Линейная модель (ставка bps/день × длина удержания в днях) — разумный
    дефолт; спека допускает нелинейную таблицу «по направлению и длине»,
    но таблица вносится пользователем/брокером. Дефолт 0.0 — нейтральный
    (нет данных о свопах); конкретные ставки — параметр прогона.

    Attributes:
        long_bps_per_day: своп long-позиции, bps за торговый день.
        short_bps_per_day: своп short-позиции, bps за торговый день.
    """

    model_config = ConfigDict(extra="forbid")

    long_bps_per_day: float = 0.0
    short_bps_per_day: float = 0.0


class PositivityFloor(BaseModel):
    """Пол позитивности: издержки + свопы (спека §4.5).

    ``floor(h) = commission + spread + slippage + swaps(h)`` в bps. Вычисление
    пола по горизонту — в :mod:`zetaflowlab.atlas.costs` (Task 5); здесь —
    только схема ставок и издержек. Пересчёт пола в режимные ATR — на анализе.

    Attributes:
        commission_bps: комиссия (круговая), bps.
        spread_bps: спред, bps.
        slippage_bps: проскальзывание на вход (taker), bps.
        swaps: ставки свопов по направлению (:class:`SwapRates`).
        slippage_sensitivity_bps: sensitivity-аудит slippage (1–2 bps, §4.5) —
            обязательный контролируемый пересчёт ключевых сводок (один прогон).
    """

    model_config = ConfigDict(extra="forbid")

    commission_bps: float = Field(default=0.5, ge=0)
    spread_bps: float = Field(default=0.5, ge=0)
    slippage_bps: float = Field(default=1.0, ge=0)
    swaps: SwapRates = SwapRates()
    slippage_sensitivity_bps: tuple[float, ...] = (1.0, 2.0)


class ValidationParams(BaseModel):
    """Параметры валидационной дисциплины (спека §7).

    Атлас ничего не обучает, но его продукт — выбор (стиль/пороги/вердикт).
    Дисциплина концентрируется на границе решений: blocked CV с embargo
    (окна экскурсий не должны пересекать границы фолдов). OOS — временной
    хвост, атласом не расходуется (§7 п.4).

    Attributes:
        cv_block_weeks: длина блока CV в неделях (по умолчанию недельные, как v1).
        embargo_trading_days: зазор embargo ≥ горизонта раздачи (~60 торговых
            дней + запас). Инвариант: ``embargo_trading_days ≥ h_max_trading_days``.
        oos_weeks: размер OOS-хвоста (52 ISO-недели, §7 п.4) — граница решающей
            области фиксируется до анализа; атлас OOS не видит.
    """

    model_config = ConfigDict(extra="forbid")

    cv_block_weeks: int = Field(default=1, ge=1)
    embargo_trading_days: int = Field(default=65, ge=1)
    oos_weeks: int = Field(default=52, ge=1)


class AtlasConfig(BaseModel):
    """Конфиг прогона атласа инструмента (спека v2 §3, §4, §6, §7).

    ``extra="forbid"``: опечатка в YAML обязана падать, а не молча применять
    дефолт (канон проекта, :class:`zetaflowlab.config.ZetaCoreConfig`).

    Attributes:
        config_id: идентификатор прогона атласа.
        seed: seed детерминизма (бутстреп и др.).
        data_hash: SHA-256 источника данных (внешний, из data-слоя).
        code_version: версия кода лаборатории (для воспроизводимости).
        symbol: инструмент (EURUSD на первом этапе).
        timeframe: базовый таймфрейм развертки (1m).
        horizons_min: лестница горизонтов экскурсий (минуты, строго возрастает,
            последний ≤ H_max). Дефолт — :data:`DEFAULT_HORIZONS_MIN`.
        trading_day_minutes: 1 торговый день в минутах (FX 24ч = 1440).
        h_max_trading_days: потолок горизонта, торговых дней (60, §4.1).
        atr_scales: ATR-линейки для нормировки на анализе (§2: {1h, 4h, 1d, 3d, 1w}).
        fp_levels_bps: лестница уровней first-passage (bps, строго возрастает).
        resolution_zones: стыки разрешений пути (§4.2), детерминированные.
        event_deltas_bps: δ-сетка событий-пути (§4.4), bps, оба направления.
        event_windows_min: w-сетка событий-пути (§4.4), минуты.
        positivity_floor: пол позитивности (издержки + свопы, §4.5).
        verdict: пороги вердикта §9.3 / §9.4 (verbatim, константы).
        validation: валидационные параметры §7 (блоки CV, embargo, OOS).
        out_dir: каталог артефактов атласа.
    """

    model_config = ConfigDict(extra="forbid", validate_assignment=True)

    # Provenance / идентификация прогона
    config_id: str
    seed: int = 42
    data_hash: str = Field(description="SHA-256 источника данных (внешний)")
    code_version: str = "0.1.0"

    # Инструмент
    symbol: str = "EURUSD"
    timeframe: str = "1m"

    # Лестница горизонтов (§4.1)
    horizons_min: tuple[int, ...] = DEFAULT_HORIZONS_MIN
    trading_day_minutes: int = Field(default=TRADING_DAY_MINUTES, gt=0)
    h_max_trading_days: int = Field(default=H_MAX_TRADING_DAYS, gt=0)

    # ATR-линейки нормировки (§2, §4.1) — на анализе, не в rollout
    atr_scales: tuple[str, ...] = ("1h", "4h", "1d", "3d", "1w")

    # Лестница уровней first-passage (§4.1)
    fp_levels_bps: tuple[int, ...] = (10, 25, 50, 100, 200)

    # Стыки разрешений пути (§4.2)
    resolution_zones: tuple[ResolutionZone, ...] = (
        ResolutionZone(resolution="1m", upper_bound_min=480),
        ResolutionZone(resolution="H1", upper_bound_min=7200),
        ResolutionZone(resolution="D1", upper_bound_min=None),
    )

    # δ-сетка событий-пути (§4.4) — оба направления
    event_deltas_bps: tuple[int, ...] = (10, 25, 50, 100)
    event_windows_min: tuple[int, ...] = (5, 15, 30, 60)

    # Пол позитивности (§4.5) и пороги вердикта (§9.3)
    positivity_floor: PositivityFloor = PositivityFloor()
    verdict: VerdictThresholds = VerdictThresholds()

    # Валидация (§7)
    validation: ValidationParams = ValidationParams()

    # Артефакты
    out_dir: Path = Path("data/atlas")

    @property
    def h_max_minutes(self) -> int:
        """H_max в минутах: ``h_max_trading_days * trading_day_minutes``."""
        return self.h_max_trading_days * self.trading_day_minutes

    @model_validator(mode="after")
    def _check_invariants(self) -> AtlasConfig:
        # Лестница горизонтов: строго возрастает, положительна, последний ≤ H_max.
        if len(self.horizons_min) == 0:
            raise ValueError("horizons_min: лестница горизонтов пуста")
        if any(h <= 0 for h in self.horizons_min):
            raise ValueError("horizons_min: горизонты должны быть положительными")
        if any(b <= a for a, b in zip(self.horizons_min, self.horizons_min[1:], strict=False)):
            raise ValueError("horizons_min: горизонты должны строго возрастать")
        if self.horizons_min[-1] > self.h_max_minutes:
            raise ValueError(
                f"horizons_min: последний горизонт ({self.horizons_min[-1]}) "
                f"превышает H_max ({self.h_max_minutes} мин)"
            )

        # Уровни first-passage: строго возрастают, положительны.
        if len(self.fp_levels_bps) == 0:
            raise ValueError("fp_levels_bps: лестница уровней пуста")
        if any(x <= 0 for x in self.fp_levels_bps):
            raise ValueError("fp_levels_bps: уровни должны быть положительными")
        if any(b <= a for a, b in zip(self.fp_levels_bps, self.fp_levels_bps[1:], strict=False)):
            raise ValueError("fp_levels_bps: уровни должны строго возрастать")

        # ATR-линейки непустые.
        if len(self.atr_scales) == 0:
            raise ValueError("atr_scales: линейка ATR пуста")

        # δ/w-сетки положительные.
        if any(d <= 0 for d in self.event_deltas_bps) or len(self.event_deltas_bps) == 0:
            raise ValueError("event_deltas_bps: сетка δ должна быть непустой и положительной")
        if any(w <= 0 for w in self.event_windows_min) or len(self.event_windows_min) == 0:
            raise ValueError("event_windows_min: сетка w должна быть непустой и положительной")

        # Стыки разрешений: ровно одна открытая зона, уникальные разрешения,
        # границы (кроме None) строго возрастают и > 0 → покрывают (0, ∞) без дыр.
        self._check_resolution_zones()

        # Embargo ≥ H_max (§7): окна экскурсий не пересекают границы фолдов.
        if self.validation.embargo_trading_days < self.h_max_trading_days:
            raise ValueError(
                f"validation.embargo_trading_days ({self.validation.embargo_trading_days}) "
                f"< h_max_trading_days ({self.h_max_trading_days}): embargo должен "
                f"быть ≥ горизонта раздачи"
            )
        return self

    def _check_resolution_zones(self) -> None:
        zones = self.resolution_zones
        if len(zones) == 0:
            raise ValueError("resolution_zones: зоны разрешений пусты")
        open_ends = [z for z in zones if z.upper_bound_min is None]
        if len(open_ends) != 1:
            raise ValueError(
                "resolution_zones: ровно одна зона разрешений может быть без "
                "верхней границы (None); покрыто (0, ∞) без дыр и пересечений"
            )
        resolutions = [z.resolution for z in zones]
        if len(set(resolutions)) != len(resolutions):
            raise ValueError("resolution_zones: разрешения зон должны быть уникальны")
        # Границы (кроме None) строго возрастают и > 0.
        bounds = [z.upper_bound_min for z in zones if z.upper_bound_min is not None]
        if any(b <= 0 for b in bounds):
            raise ValueError("resolution_zones: границы зон должны быть положительными")
        if any(b <= a for a, b in zip(bounds, bounds[1:], strict=False)):
            raise ValueError(
                "resolution_zones: верхние границы зон должны строго возрастать; "
                "зоны разрешений должны покрывать лестницу без дыр и пересечений"
            )
        # Открытая зона обязана быть последней (зоны упорядочены по расстоянию).
        if zones[-1].upper_bound_min is not None:
            raise ValueError(
                "resolution_zones: открытая зона (None) должна быть последней "
                "по удалению от точки измерения"
            )

    @property
    def lineup_hash(self) -> str:
        """Детерминированный хэш лестниц (методологическая сетка, §6 provenance).

        В отличие от ``grid_hash`` портрета v1, покрывает все лестницы атласа:
        горизонты, ATR-линейки, уровни first-passage, стыки разрешений,
        δ/w-сетки событий. **Не** зависит от provenance-полей (``config_id``,
        ``data_hash``, ``seed``, ``code_version``) — методологическая сетка
        отделена от идентификации прогона (одна и та же сетка → один хэш при
        разных прогонах).

        Returns:
            Первые 16 hex-символов SHA-256 канонического JSON (``sort_keys``).
        """
        payload: dict[str, object] = {
            "horizons_min": list(self.horizons_min),
            "atr_scales": list(self.atr_scales),
            "fp_levels_bps": list(self.fp_levels_bps),
            "resolution_zones": [z.model_dump(mode="json") for z in self.resolution_zones],
            "event_deltas_bps": list(self.event_deltas_bps),
            "event_windows_min": list(self.event_windows_min),
        }
        blob = json.dumps(payload, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(blob.encode()).hexdigest()[:16]

    def to_yaml(self) -> str:
        """Каноническая YAML-сериализация конфига (детерминированная).

        ``sort_keys=False`` сохраняет логический порядок полей модели;
        ``model_dump(mode="json")`` даёт YAML-совместимые скаляры. Round-trip
        (:meth:`to_yaml` → ``yaml.safe_load`` → :meth:`pydantic.BaseModel.model_validate`)
        байт-в-байт стабилен (тест ``test_yaml_roundtrip_equal_and_deterministic``).

        Returns:
            Строка YAML, воспроизводимо описывающая конфиг.
        """
        data = self.model_dump(mode="json")
        text = yaml.safe_dump(data, sort_keys=False, allow_unicode=True)
        return str(text)


# --- Контейнеры записей §4.1 (схемы, без логики rollout) --------------------


@dataclass(frozen=True)
class BarLabels:
    """Метки режима/события на баре входа (строго из прошлого, §4.1, правило
    завершённого бара).

    Режимы — наследие классификатора V×T×W портрета v1 (regimes.py). События-
    пути (§4.4) — ``event_type`` каузального детектора δ-импульсов; ``None``
    — событие на баре не зафиксировано.

    Attributes:
        regime_v: режим волатильности (``"V1"|"V2"|"V3"|"UNKNOWN"``).
        regime_t: режим тренда (``"T1"|"T2"|"T3"|"UNKNOWN"``).
        regime_w: сессия недели (``"asia"|"london"|"ny"``).
        event_type: тип δ-события (напр. ``"delta_up"``/``"delta_dn"`` с
            параметрами) или ``None``.
    """

    regime_v: str
    regime_t: str
    regime_w: str
    event_type: str | None = None


@dataclass(frozen=True)
class ExcursionRecord:
    """Запись экскурсии одного бара на лестнице горизонтов (сырая, §4.1).

    Все величины — сырые, до нормировки ATR (нормировка — на анализе, §2).
    Единицы: отклонения — bps от close бара входа; время — минуты от входа;
    first-passage — минуты до первого касания уровня (``inf`` — не достигнут).
    Поля-векторы индексируются по лестнице (горизонтов/уровней) конфига;
    длина задаётся потребителем (rollout, Task 2). Контейнер описывает схему
    записи, без логики вычисления.

    Attributes:
        mfe_bps: максимум favourable-экскурсии по лестнице h (длина = len(horizons)).
        mae_bps: минимум adverse-экскурсии по лестнице h (≤ 0).
        t_mfe_min: время до mfe на каждом горизонте h.
        t_mae_min: время до mae на каждом горизонте h.
        osc_crossings: дрожание пути — число пересечений уровня входа (до mfe).
        osc_subswing_amp_bps: амплитуды под-качелей (до первого достижения mfe).
        fp_up_min: первые касания лестницы уровней вверх (длина = len(fp_levels)).
        fp_dn_min: первые касания лестницы уровней вниз (``inf`` — не достигнут).
        gap_count: число overnight/weekend гэпов на пути.
        gap_max_bps: размер максимального гэпа на пути, bps (0 — гэпов нет).
        gap_dir: направление максимального гэпа (``"up"|"down"|"none"``).
    """

    mfe_bps: np.ndarray
    mae_bps: np.ndarray
    t_mfe_min: np.ndarray
    t_mae_min: np.ndarray
    osc_crossings: np.int64
    osc_subswing_amp_bps: np.ndarray
    fp_up_min: np.ndarray
    fp_dn_min: np.ndarray
    gap_count: np.int64
    gap_max_bps: float
    gap_dir: str


__all__ = [
    "DEFAULT_HORIZONS_MIN",
    "H_MAX_TRADING_DAYS",
    "TRADING_DAY_MINUTES",
    "AtlasConfig",
    "BarLabels",
    "ExcursionRecord",
    "PositivityFloor",
    "ResolutionZone",
    "SwapRates",
    "ValidationParams",
    "VerdictThresholds",
]
