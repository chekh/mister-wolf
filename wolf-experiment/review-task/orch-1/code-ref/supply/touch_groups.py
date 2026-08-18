# src/zetaflowlab/supply/touch_groups.py
"""Touch groups §3.5 (задача 4 WП-1, атлас v4.2): направленные окна + membership.

``W(τ; k, h, dir) = {t : t_hit_{dir,k}(t) ≤ h ∧ touch_id(t) = τ}`` — после
маски ``t_hit > 0`` (единственный источник маски —
:func:`zetaflowlab.supply.fp_consumer.hit_mask`). Координаты касаний §3.3:
``touch_row = row_index(anchor) + t_hit`` (позиционные индексы баров),
``touch_id = ts[touch_row]`` — lookup по ряду; арифметика ``timestamp + τ``
запрещена. Группировка по ``touch_row`` эквивалентна группировке по
``touch_id`` на каноническом ряду с уникальными timestamps.

:func:`build_touch_groups` возвращает :class:`TouchGroupsResult`:

* ``groups`` — одна строка на касание (поля §3.5): ``direction, k, h,
  touch_id, touch_row, first_anchor, last_anchor`` (row_index),
  ``span_first_to_last = last − first``,
  ``gross_span_to_touch_bars = touch_row − first_anchor + 1`` (валовая
  протяжённость ДО касания: включает неуспешные якори, внутренние разрывы и
  периоды отсутствия возможности — **не мера доступного времени**; доступное
  время — ``n_successful_anchors, longest_contiguous_run,
  contiguous_run_count``), ``n_successful_anchors``,
  ``contiguous_run_count`` (число максимальных серий подряд идущих anchor
  row_index), ``longest_contiguous_run``, ``is_contiguous``
  (⟺ ``contiguous_run_count = 1``);
* ``membership`` — long-формат самодостаточных ключей (однозначен при
  объединении результатов нескольких (dir, k, h)): ``direction, k_bps,
  horizon, anchor_row, tau, touch_row, touch_id, group_id``; ``group_id``
  детерминирован и устойчив — форматная строка из
  ``(direction, k_bps, horizon, touch_row)``, не порядковый номер group_by
  (порядок групп polars не гарантирован).

Инварианты (проверяются тестами): ``touch_row − anchor_row = τ``; якорь
входит ровно в одну группу своего (dir, k, h) (``membership.anchor_row``
уникальны); ``Σ n_successful_anchors`` = числу hits ``0 < τ ≤ h``.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import numpy.typing as npt
import polars as pl
from loguru import logger

from zetaflowlab.supply.fp_consumer import hit_mask

#: Допустимые теги направления (соглашение ядра §3.4: "up" | "dn").
_DIRECTIONS: tuple[str, ...] = ("up", "dn")

#: Схема кадра групп (поля §3.5; k — bps, h — observed M1 bars).
_GROUPS_SCHEMA: pl.Schema = pl.Schema(
    {
        "direction": pl.String,
        "k": pl.Float64,
        "h": pl.Int64,
        "touch_id": pl.Int64,
        "touch_row": pl.Int64,
        "first_anchor": pl.Int64,
        "last_anchor": pl.Int64,
        "span_first_to_last": pl.Int64,
        "gross_span_to_touch_bars": pl.Int64,
        "n_successful_anchors": pl.Int64,
        "contiguous_run_count": pl.Int64,
        "longest_contiguous_run": pl.Int64,
        "is_contiguous": pl.Boolean,
    }
)

#: Схема membership-кадра (самодостаточные ключи ячейки + якоря).
_MEMBERSHIP_SCHEMA: pl.Schema = pl.Schema(
    {
        "direction": pl.String,
        "k_bps": pl.Float64,
        "horizon": pl.Int64,
        "anchor_row": pl.Int64,
        "tau": pl.Int64,
        "touch_row": pl.Int64,
        "touch_id": pl.Int64,
        "group_id": pl.String,
    }
)


@dataclass(frozen=True)
class TouchGroupsResult:
    """Результат сборки touch groups §3.5 для одной ячейки (dir, k, h).

    Attributes:
        groups: по одной строке на касание (touch_row): поля §3.5 —
            идентификация ячейки, якорные extents, валовый спан до касания,
            доступность (``n_successful_anchors``, contiguous-статистики);
            отсортирован по ``touch_row``.
        membership: одна строка на успешный якорь (long-формат
            самодостаточных ключей) — биекция якорь→группа внутри ячейки;
            отсортирован по ``anchor_row``.
    """

    groups: pl.DataFrame
    membership: pl.DataFrame


def group_id_of(direction: str, k: float, h: int, touch_row: int) -> str:
    """Детерминированный ``group_id`` из (direction, k_bps, horizon, touch_row).

    Формат ``{direction}_k{k:g}_h{h}_r{touch_row}`` (``%g`` — уровень без
    хвостовых нулей, как :func:`zetaflowlab.supply.first_passage.fp_col_tag`);
    устойчив к порядку групп и одинаков в ``groups``/``membership``.

    Args:
        direction: тег направления ("up" | "dn").
        k: уровень цели, bps.
        h: горизонт окна, баров.
        touch_row: позиционный индекс бара-касания.

    Returns:
        Строковый идентификатор группы.
    """
    return f"{direction}_k{k:g}_h{h}_r{touch_row}"


def _validate_touch_inputs(
    rows: npt.NDArray[np.int64],
    tau: npt.NDArray[np.int64],
    ts: npt.NDArray[np.int64],
    k: float,
    h: int,
    dir_tag: str,
) -> npt.NDArray[np.bool_]:
    """Проверить входы сборки групп; production-политика — стоп (§8).

    Правила (каждое — ``ValueError`` с указанием первого нарушителя):
    ``dir_tag ∈ {"up", "dn"}``; ``k > 0``; ``0 < h``; ``rows``/``tau``/``ts``
    1-D; ``rows`` и ``tau`` равной длины; ``rows`` уникальны (якорь входит
    ровно в одну группу — биекция §3.5); для каждого hit-якоря
    ``rows + tau`` внутри ряда (``0 ≤ touch_row < len(ts)`` — lookup
    ``touch_id`` обязан существовать).

    Args:
        rows: позиции якорей, int64.
        tau: времена первого касания (sentinel −1), int64.
        ts: timestamps ряда баров, epoch ns, int64.
        k: уровень цели, bps.
        h: горизонт окна, баров.
        dir_tag: тег направления ("up" | "dn").

    Returns:
        Hit-маска ``0 < τ ≤ h`` (единственный источник —
        :func:`zetaflowlab.supply.fp_consumer.hit_mask`; вызывающий код
        повторно не вычисляет).

    Raises:
        ValueError: при нарушении любого правила.
    """
    if dir_tag not in _DIRECTIONS:
        raise ValueError(
            f"dir_tag должен быть 'up' | 'dn', получен {dir_tag!r}"
        )
    if not k > 0.0:
        raise ValueError(f"k > 0 нарушено: k = {k}")
    if not h > 0:
        raise ValueError(f"0 < h нарушено: h = {h}")
    for name, arr in (("rows", rows), ("tau", tau), ("ts", ts)):
        if arr.ndim != 1:
            raise ValueError(
                f"{name} должен быть 1-D массивом, получен shape={arr.shape}"
            )
    if rows.shape[0] != tau.shape[0]:
        raise ValueError(
            f"длины rows/tau не равны: rows={rows.shape[0]} != "
            f"tau={tau.shape[0]}"
        )
    if np.unique(rows).size != rows.size:
        sorted_rows = np.sort(rows)
        dup = sorted_rows[1:][sorted_rows[1:] == sorted_rows[:-1]]
        raise ValueError(
            f"rows содержат дубликаты: row={int(dup[0])} встречается более "
            "одного раза — якорь входит ровно в одну группу (биекция §3.5)"
        )
    hit = hit_mask(tau, h)
    touch_rows = rows[hit] + tau[hit]
    out = (touch_rows < 0) | (touch_rows >= ts.shape[0])
    if bool(out.any()):
        i = int(np.argmax(out))
        raise ValueError(
            f"touch_row за пределами ряда: rows[{int(rows[hit][i])}] + "
            f"tau={int(tau[hit][i])} → touch_row={int(touch_rows[i])} "
            f"(требуется 0 ≤ touch_row < len(ts)={ts.shape[0]}) — "
            "touch_id lookup невозможен"
        )
    return hit


def build_touch_groups(
    rows: npt.NDArray[np.int64],
    tau: npt.NDArray[np.int64],
    ts: npt.NDArray[np.int64],
    k: float,
    h: int,
    dir_tag: str,
) -> TouchGroupsResult:
    """Собрать touch groups §3.5 и membership для одной ячейки (dir, k, h).

    Пайплайн: hit-маска ``0 < τ ≤ h`` (sentinel −1 и якоря вне-h исключены
    до любых вычислений) → ``touch_row = rows + τ`` (§3.3) → группировка по
    ``touch_row`` (эквивалентна ``touch_id`` на ряду с уникальными
    timestamps) → поля §3.5 + membership. Детерминизм: позиционная
    арифметика int64, ``np.unique``/``lexsort`` (stable), ``group_id`` —
    форматная строка, кадры отсортированы (``groups`` — по ``touch_row``,
    ``membership`` — по ``anchor_row``).

    Args:
        rows: позиции якорей в ряду баров, int64.
        tau: времена первого касания этих якорей (sentinel −1), int64;
            источник — M1-точный ``t_hit`` прямого прохода §3.4.
        ts: timestamps всего ряда баров, epoch ns, int64 (``touch_id =
            ts[touch_row]`` — lookup).
        k: уровень цели, bps.
        h: горизонт окна, observed M1 bars.
        dir_tag: тег направления ("up" | "dn").

    Returns:
        :class:`TouchGroupsResult` — ``groups`` (поля §3.5) и ``membership``
        (самодостаточные ключи); при отсутствии hits — пустые кадры полной
        схемы.

    Raises:
        ValueError: нарушения контракта входов
            (см. :func:`_validate_touch_inputs`).
    """
    hit = _validate_touch_inputs(rows, tau, ts, k, h, dir_tag)
    anchor = rows[hit]
    taus = tau[hit]
    if anchor.shape[0] == 0:
        logger.info(
            "touch groups {}/k{}: hits нет — пустые кадры полной схемы",
            dir_tag, k,
        )
        return TouchGroupsResult(
            groups=pl.DataFrame(schema=_GROUPS_SCHEMA),
            membership=pl.DataFrame(schema=_MEMBERSHIP_SCHEMA),
        )

    touch_rows = anchor + taus
    order = np.lexsort((anchor, touch_rows))
    trow_s = touch_rows[order]
    anchor_s = anchor[order]
    n = trow_s.shape[0]

    uniq_trow, starts = np.unique(trow_s, return_index=True)
    ends = np.append(starts[1:], n)
    first_anchor = anchor_s[starts]
    last_anchor = anchor_s[ends - 1]

    # contiguous-прогоны: новый прогон = старт группы ИЛИ разрыв row_index > 1
    is_group_start = np.zeros(n, dtype=np.bool_)
    is_group_start[starts] = True
    gap = anchor_s[1:] - anchor_s[:-1] > 1
    break_run = np.ones(n, dtype=np.bool_)
    break_run[1:] = is_group_start[1:] | gap
    run_id = np.cumsum(break_run) - 1
    run_len = np.bincount(run_id)
    anchor_run_len = run_len[run_id]
    run_count = np.add.reduceat(break_run.astype(np.int64), starts)
    longest_run = np.maximum.reduceat(anchor_run_len, starts)

    groups = pl.DataFrame(
        {
            "direction": [dir_tag] * uniq_trow.shape[0],
            "k": [float(k)] * uniq_trow.shape[0],
            "h": [int(h)] * uniq_trow.shape[0],
            "touch_id": ts[uniq_trow].tolist(),
            "touch_row": uniq_trow.tolist(),
            "first_anchor": first_anchor.tolist(),
            "last_anchor": last_anchor.tolist(),
            "span_first_to_last": (last_anchor - first_anchor).tolist(),
            "gross_span_to_touch_bars": (uniq_trow - first_anchor + 1).tolist(),
            "n_successful_anchors": (ends - starts).tolist(),
            "contiguous_run_count": run_count.tolist(),
            "longest_contiguous_run": longest_run.tolist(),
            "is_contiguous": (run_count == 1).tolist(),
        },
        schema=_GROUPS_SCHEMA,
    )

    morder = np.argsort(anchor, kind="stable")
    # group_id: по уникальным touch_row + обратный индекс (важно для полного
    # ранна: длина membership ~10⁶ строк, python-цикл по всем — узкое место)
    uniq_trows, inv = np.unique(touch_rows, return_inverse=True)
    uniq_gids = np.array(
        [group_id_of(dir_tag, k, h, int(tr)) for tr in uniq_trows],
        dtype=object,
    )
    membership = pl.DataFrame(
        {
            "direction": [dir_tag] * n,
            "k_bps": [float(k)] * n,
            "horizon": [int(h)] * n,
            "anchor_row": anchor[morder].tolist(),
            "tau": taus[morder].tolist(),
            "touch_row": touch_rows[morder].tolist(),
            "touch_id": ts[touch_rows[morder]].tolist(),
            "group_id": uniq_gids[inv][morder].tolist(),
        },
        schema=_MEMBERSHIP_SCHEMA,
    )
    logger.info(
        "touch groups {}/k{}/h{}: {} групп, {} успешных якорей "
        "(gross_span — валовый, доступность — n/run-поля)",
        dir_tag, k, h, groups.height, membership.height,
    )
    return TouchGroupsResult(groups=groups, membership=membership)
