# src/zetaflowlab/atlas/__init__.py
"""Атлас инструмента (Портрет v2).

Сырая раздача экскурсий цены от каждого бара без предположений о стиле
торговли (спека v2 §1–§3). Стиль — вывод, не вход.

Task 1: :mod:`zetaflowlab.atlas.config` — конфиг атласа (лестницы, стыки
разрешений, пол позитивности, пороги вердикта §9.3 verbatim, provenance) и
контейнеры записей §4.1 (схемы).

Task 2: :mod:`zetaflowlab.atlas.rollout` — векторизованный rollout экскурсий
мульти-разрешения (numba, чанкование, детерминизм): MFE/MAE на лестнице
горизонтов, osc, fp-уровни, gap_flags.

Task 3: :mod:`zetaflowlab.atlas.events` — каузальный детектор δ-импульсов
(«цена прошла δ за ≤ w шагов», сетка δ×w, оба направления, no-lookahead).

Task 4: :mod:`zetaflowlab.atlas.gaps` — полная популяция overnight/weekend
гэпов (квантили/хвосты, направление).

Task 5: :mod:`zetaflowlab.atlas.costs` — пол позитивности (издержки + свопы от
длительности, sensitivity 1–2 bps).

Task 6: :mod:`zetaflowlab.atlas.aggregate` (блочный бутстреп CI, раздачи по
ячейкам split×regime×event×horizon) + :mod:`zetaflowlab.atlas.scales` (кривая
масштаба, √t-нейтраль, насыщение, память — KS+permutation).

Task 7: :mod:`zetaflowlab.atlas.rotation` — ситуации (плотность, срок жизни,
вложенность), кривые загрузки (номинальная + эффективная через синхронность).

Task 8: :mod:`zetaflowlab.atlas.artifact` (карта стилей, векторный вердикт §5.5,
provenance) + :mod:`zetaflowlab.atlas.run` (полный конвейер, CLI).
"""

from zetaflowlab.atlas.aggregate import aggregate_excursions, block_bootstrap_ci
from zetaflowlab.atlas.artifact import (
    STYLE_BANDS,
    StyleCell,
    StyleMapRow,
    VerdictArtifact,
    bh_fdr,
    build_verdict,
    render_report,
    representative_horizon,
    style_for_horizon,
    write_atlas_artifacts,
)
from zetaflowlab.atlas.config import (
    AtlasConfig,
    BarLabels,
    ExcursionRecord,
    PositivityFloor,
    ResolutionZone,
    SwapRates,
    ValidationParams,
    VerdictThresholds,
)
from zetaflowlab.atlas.costs import floor_bps, floor_curve, sensitivity_floors
from zetaflowlab.atlas.events import detect_impulses
from zetaflowlab.atlas.gaps import extract_gaps, gap_summary
from zetaflowlab.atlas.rollout import compute_excursions
from zetaflowlab.atlas.rotation import (
    effective_loading,
    loading_curve,
    situation_mask,
    situation_stats,
    synchrony,
)
from zetaflowlab.atlas.run import run_atlas
from zetaflowlab.atlas.scales import (
    calibrate_base_std,
    memory_distance,
    saturation_horizon,
    scale_curve,
    sqrt_t_neutral,
)

__all__ = [
    "AtlasConfig",
    "BarLabels",
    "ExcursionRecord",
    "PositivityFloor",
    "ResolutionZone",
    "STYLE_BANDS",
    "StyleCell",
    "StyleMapRow",
    "SwapRates",
    "ValidationParams",
    "VerdictArtifact",
    "VerdictThresholds",
    "aggregate_excursions",
    "bh_fdr",
    "block_bootstrap_ci",
    "build_verdict",
    "calibrate_base_std",
    "compute_excursions",
    "detect_impulses",
    "effective_loading",
    "extract_gaps",
    "floor_bps",
    "floor_curve",
    "gap_summary",
    "loading_curve",
    "memory_distance",
    "render_report",
    "representative_horizon",
    "run_atlas",
    "saturation_horizon",
    "scale_curve",
    "sensitivity_floors",
    "situation_mask",
    "situation_stats",
    "sqrt_t_neutral",
    "style_for_horizon",
    "synchrony",
    "write_atlas_artifacts",
]
