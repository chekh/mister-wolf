# src/zetaflowlab/supply/catalog.py
"""Каталог оценок атласа v4.2 (WП-2): схема, запись строк, публикация.

Каталог — плоская таблица «одна строка = одна оценка» (§4 базовые поля +
ключи разрезов Прил. A). Модуль отвечает только за форму записи:

* :data:`CATALOG_COLUMNS` — закреплённый порядок и типы колонок;
* :data:`DICT_V42` — словари статусов (verbatim §4, публикуются в манифесте);
* :func:`build_record` — одна строка каталога со словарями и grain-фильтрацией
  ключей Прил. A;
* :func:`write_catalog_parquet` — схематизированная атомарная запись
  (tmp ``.partial`` → fsync → ``os.replace``).

Вычисление оценок — не здесь (ячейки C1/C5, MBB, matching — свои модули).
"""
from __future__ import annotations

import math
import os
from pathlib import Path
from typing import Any

import pyarrow as pa
import pyarrow.parquet as pq
from loguru import logger

#: Колонки каталога v4.2 — §4 (базовые) + Прил. A (ключевые); порядок закреплён.
CATALOG_COLUMNS: tuple[tuple[str, str], ...] = (
    # базовые §4 (порядок как в спеке)
    ("metric_id", "large_string"), ("cost_model_id", "large_string"),
    ("data_hash", "large_string"), ("code_hash", "large_string"),
    ("seed", "int64"), ("n_eff", "double"), ("n_eff_status", "large_string"),
    ("estimate", "double"), ("ci_lo", "double"), ("ci_hi", "double"),
    ("horizon", "int64"), ("data_scope", "large_string"),
    ("epistemic_status", "large_string"), ("support_status", "large_string"),
    ("validation_stage", "large_string"), ("gate_status", "large_string"),
    ("run_id", "large_string"), ("n_raw", "int64"),
    # ключевые Прил. A
    ("denominator_unit", "large_string"), ("k_bps", "double"), ("a_bps", "double"),
    ("dir", "large_string"), ("year", "int64"), ("delta_bars", "int64"),
    ("episode_definition_id", "large_string"), ("gap_threshold", "large_string"),
    ("grain", "large_string"),
)

#: Словари статусов — verbatim §4; публикуются в манифесте.
DICT_V42: dict[str, Any] = {
    "epistemic_status": "measured",
    "validation_stage": "descriptive_v4_2",
    "gate_status": "descriptive_only",
    "data_scope": "row_id=real train ∪ val",
    "n_eff_status": "not_estimated",
    "support_status_rule": "insufficient ⟺ n_raw < 30; exploratory_tail не активен в C1/C5",
    "bound_suffixes": {  # конвенция WП-2; слова pessimistic/optimistic запрещены
        ".lb": "нижняя граница атрибуции same-bar U (share_min / P_min,i)",
        ".ub": "верхняя граница атрибуции same-bar U (share_max / P_max,i / (|B|+|U|)/(|A|+|U|))",
        ".incl_unresolved": "P(X) + P(UNRESOLVED_X) — простые порядковые доли §3.8",
    },
}

#: pyarrow-типы по строковым именам CATALOG_COLUMNS.
_PA_TYPES: dict[str, pa.DataType] = {
    "large_string": pa.large_string(),
    "int64": pa.int64(),
    "double": pa.float64(),
}

#: not-null поля Прил. A (verbatim контракта записи каталога).
_NOT_NULL: tuple[str, ...] = (
    "metric_id", "run_id", "data_hash", "code_hash", "seed", "data_scope",
    "epistemic_status", "support_status", "validation_stage", "gate_status",
    "n_eff_status", "n_raw", "denominator_unit", "grain", "horizon",
)

#: double-поля каталога (NaN-контроль в :func:`write_catalog_parquet`).
_DOUBLE_FIELDS: tuple[str, ...] = tuple(
    name for name, typ in CATALOG_COLUMNS if typ == "double"
)

#: Порог sufficient/insufficient (DICT_V42["support_status_rule"]).
_SUPPORT_MIN_N_RAW: int = 30

#: Фиксированный seed каталога v4.2.
_SEED: int = 42


def catalog_schema() -> pa.Schema:
    """Схема parquet каталога v4.2 по :data:`CATALOG_COLUMNS`.

    Все поля nullable, кроме not-null полей Прил. A (:data:`_NOT_NULL`).

    Returns:
        pyarrow-схема с закреплённым порядком колонок.
    """
    return pa.schema(
        pa.field(name, _PA_TYPES[typ], nullable=name not in _NOT_NULL)
        for name, typ in CATALOG_COLUMNS
    )


def build_record(
    metric_id: str,
    run_id: str,
    data_hash: str,
    code_hash: str,
    n_raw: int,
    denominator_unit: str,
    grain: str,
    horizon: int,
    estimate: float | None = None,
    ci_lo: float | None = None,
    ci_hi: float | None = None,
    *,
    k_bps: float | None = None,
    a_bps: float | None = None,
    dir_tag: str | None = None,
    year: int | None = None,
) -> dict[str, Any]:
    """Одна строка каталога v4.2 (§4 + Прил. A).

    Заполняет словари :data:`DICT_V42` (epistemic_status, validation_stage,
    gate_status, data_scope, n_eff_status) и ``support_status`` по правилу
    ``n_raw < 30 → "insufficient"``; ``seed=42``, ``cost_model_id``/``n_eff``
    — None. Параметр ``dir_tag`` соответствует полю «dir» Прил. A (имя
    ``dir`` зарезервировано в Python; в записи каталога ключ колонки —
    ``"dir"``). Поля не-грэйновых ключей → None (null): ``a_bps``/``dir``/
    ``year`` заносятся только если ключ ``"a"``/``"dir"``/``"year"`` входит
    в ``grain``; ``k`` — базовый ключ C1/C5, ``k_bps`` не фильтруется.
    ``delta_bars``/``episode_definition_id``/``gap_threshold`` — None во всех
    строках C1/C5 (ключи WП-3/4/5).

    Args:
        metric_id: идентификатор метрики (суффиксы границ — конвенция
            ``DICT_V42["bound_suffixes"]``).
        run_id: run_id прогона WП-2.
        data_hash: sha256 канонического bars-файла.
        code_hash: provenance-хэш кода (:func:`code_hash_of_paths`).
        n_raw: число наблюдений знаменателя оценки.
        denominator_unit: единица знаменателя (Прил. A).
        grain: ключи разреза через запятую (например ``"k,h"``, ``"k,a,dir"``).
        horizon: горизонт окна h, баров.
        estimate: точечная оценка; None → null.
        ci_lo: нижняя граница CI; None → null.
        ci_hi: верхняя граница CI; None → null.
        k_bps: уровень k, bps (ключ C1/C5).
        a_bps: adverse-уровень a, bps (только при ``"a"`` в grain).
        dir_tag: направление (``"long"``/``"short"``; только при ``"dir"``
            в grain; поле «dir» Прил. A).
        year: календарный год (только при ``"year"`` в grain; ключ WП-3).

    Returns:
        Словарь «колонка → значение» со всеми ключами CATALOG_COLUMNS
        (порядок вставки совпадает с порядком колонок).

    Raises:
        ValueError: NaN в ``estimate``/``ci_lo``/``ci_hi`` — NaN к публикации
            запрещён, вызывающий обязан передать None.
    """
    for name, value in (("estimate", estimate), ("ci_lo", ci_lo), ("ci_hi", ci_hi)):
        if value is not None and math.isnan(value):
            raise ValueError(f"NaN в {name} запрещён к публикации — передайте None")
    keys = {token.strip() for token in grain.split(",")}
    return {
        "metric_id": metric_id,
        "cost_model_id": None,
        "data_hash": data_hash,
        "code_hash": code_hash,
        "seed": _SEED,
        "n_eff": None,
        "n_eff_status": DICT_V42["n_eff_status"],
        "estimate": estimate,
        "ci_lo": ci_lo,
        "ci_hi": ci_hi,
        "horizon": horizon,
        "data_scope": DICT_V42["data_scope"],
        "epistemic_status": DICT_V42["epistemic_status"],
        "support_status": (
            "insufficient" if n_raw < _SUPPORT_MIN_N_RAW else "sufficient"
        ),
        "validation_stage": DICT_V42["validation_stage"],
        "gate_status": DICT_V42["gate_status"],
        "run_id": run_id,
        "n_raw": n_raw,
        "denominator_unit": denominator_unit,
        "k_bps": k_bps,
        "a_bps": a_bps if "a" in keys else None,
        "dir": dir_tag if "dir" in keys else None,
        "year": year if "year" in keys else None,
        "delta_bars": None,
        "episode_definition_id": None,
        "gap_threshold": None,
        "grain": grain,
    }


def write_catalog_parquet(records: list[dict[str, Any]], path: Path) -> None:
    """Атомарная схематизированная запись каталога v4.2 в parquet.

    Схема — :func:`catalog_schema` (:data:`CATALOG_COLUMNS`, порядок
    закреплён); ``None`` → null. Not-null поля Прил. A проверяются на входе
    (``ValueError``); NaN в double-полях — assert-защита (:func:`build_record`
    отклоняет NaN раньше, сюда рукописный NaN попасть не должен). Атомарная
    запись: tmp ``{path}.partial`` → fsync → ``os.replace`` — существующий
    файл заменяется целиком, tmp-файл не остаётся.

    Args:
        records: строки каталога (ключи — колонки CATALOG_COLUMNS;
            :func:`build_record`).
        path: целевой parquet-файл каталога.

    Raises:
        ValueError: not-null поле какой-либо записи — None.
        AssertionError: NaN в double-поле какой-либо записи.
    """
    for i, rec in enumerate(records):
        missing = [name for name in _NOT_NULL if rec.get(name) is None]
        if missing:
            raise ValueError(f"not-null поля записи #{i} пусты: {missing} (Прил. A)")
        for name in _DOUBLE_FIELDS:
            value = rec.get(name)
            assert not (isinstance(value, float) and math.isnan(value)), (
                f"NaN в records[{i}][{name!r}] — к публикации запрещён "
                "(передайте None)"
            )
    columns = {
        name: [rec.get(name) for rec in records] for name, _ in CATALOG_COLUMNS
    }
    table = pa.Table.from_pydict(columns, schema=catalog_schema())

    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_name(target.name + ".partial")
    pq.write_table(table, tmp)
    fd = os.open(tmp, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
    os.replace(tmp, target)
    logger.info("каталог v4.2 записан: {} строк → {}", len(records), target)
