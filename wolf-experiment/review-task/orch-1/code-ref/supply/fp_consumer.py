# src/zetaflowlab/supply/fp_consumer.py
"""Consumer-слой first-passage §3.4 (задача 2 WП-1, атлас v4.2).

Производные потребителя над :class:`~zetaflowlab.supply.first_passage.FpArrays`
(только 1-D массивы, без pandas/polars):

* :func:`normalize_tau` — нормализация sentinel-времён §3.4:
  ``t̃ = τ`` при ``τ > 0``, ``+∞`` при ``τ = −1``; после нормализации sentinel
  не участвует в сравнениях как обычное число (``∞ ≤ h`` и ``∞ < ∞`` = False);
* :func:`hit_mask` — механическая hit-маска ``0 < τ ≤ h`` (единственный
  источник истины о «касании в окне h»);
* :func:`classify_tp_adv` / :func:`classify_direction` — классификация
  «порядок барьеров» §3.4 только через hit-маски (сравнение положительных
  времён — исключительно под обеими масками);
* :func:`unresolved_tp_adv_flag` — источник истины same-bar
  неоднозначности: ``tp_hit ∧ adv_hit ∧ (t_tp = t_adv)``;
* :func:`assert_unresolved_invariant` — проверочный storage-agnostic
  инвариант-эквивалентность (errata e3) через накопленные ядром поля.

Соглашения ядра задачи 1, на которые опирается слой: adverse-время long на
уровне ``a`` — это ``tau_dn[:, i_a]`` (ядро считает то же running-количество
``(entry − rmin)/entry·10⁴``), для short — ``tau_up[:, i_a]``;
``pre_touch_window_empty ≡ (tau == 1)``.
"""
from __future__ import annotations

import enum
from typing import Any

import numpy as np
import numpy.typing as npt


class OrderTpAdv(enum.IntEnum):
    """Классы «порядок цель/просадка» §3.4 (order_tp_adv, для C5)."""

    NEITHER = 0
    TP_FIRST = 1
    ADV_FIRST = 2
    UNRESOLVED_TP_ADV = 3


class OrderDirection(enum.IntEnum):
    """Классы «порядок направлений» §3.4 (order_direction, для C1)."""

    NEITHER = 0
    LONG_FIRST = 1
    SHORT_FIRST = 2
    UNRESOLVED_LONG_SHORT = 3


def _require_1d_aligned(**arrays: npt.NDArray[Any]) -> None:
    """Проверить контракт слоя: все массивы 1-D и равной длины.

    Args:
        **arrays: именованные массивы (имя попадает в сообщение ошибки).

    Raises:
        ValueError: если какой-либо массив не 1-D или длины не равны.
    """
    n_ref = -1
    name_ref = ""
    for name, arr in arrays.items():
        if arr.ndim != 1:
            raise ValueError(
                f"{name} должен быть 1-D массивом, получен shape={arr.shape}"
            )
        if n_ref == -1:
            n_ref, name_ref = arr.shape[0], name
        elif arr.shape[0] != n_ref:
            raise ValueError(
                f"длины массивов не равны: {name}={arr.shape[0]} != "
                f"{name_ref}={n_ref}"
            )


def normalize_tau(tau: npt.NDArray[np.int64]) -> npt.NDArray[np.float64]:
    """Нормализация sentinel-времени §3.4: ``t̃ = τ`` при ``τ > 0``, иначе ``+∞``.

    После нормализации sentinel не участвует в сравнениях как обычное число:
    для ``t̃ = +∞`` любое ``t̃ ≤ h`` и ``t̃ < t̃_другое-∞`` = False, поэтому
    no-hit/no-adverse якори автоматически исключаются из множеств §3.9/§3.10.

    Args:
        tau: 1-D int64 массив времён первого касания (sentinel −1).

    Returns:
        1-D float64 массив ``t̃`` (sentinel и любое ``τ ≤ 0`` → ``+∞``).

    Raises:
        ValueError: если ``tau`` не 1-D.
    """
    _require_1d_aligned(tau=tau)
    return np.where(tau > 0, tau, np.inf).astype(np.float64, copy=False)


def hit_mask(tau: npt.NDArray[np.int64], h: int) -> npt.NDArray[np.bool_]:
    """Механическая hit-маска §3.4: ``0 < τ ≤ h`` (эквивалентно ``t̃ ≤ h``).

    Единственный источник истины о «касании в окне h»; sentinel −1 (и защитно
    любое ``τ ≤ 0``) маской исключается до любых сравнений.

    Args:
        tau: 1-D int64 массив времён первого касания (sentinel −1).
        h: горизонт окна, баров.

    Returns:
        1-D bool маска касания в окне.

    Raises:
        ValueError: если ``tau`` не 1-D.
    """
    _require_1d_aligned(tau=tau)
    return (tau > 0) & (tau <= h)


def _first_order_codes(
    t_a: npt.NDArray[np.int64], t_b: npt.NDArray[np.int64], h: int
) -> npt.NDArray[np.int8]:
    """Порядок двух первых касаний: 0=NEITHER, 1=a_first, 2=b_first, 3=same-bar.

    Механическое правило §3.4: сравнение ``t_a < t_b`` — только под обеими
    hit-масками (sentinel никогда не сравнивается как обычное число).
    """
    a_hit = hit_mask(t_a, h)
    b_hit = hit_mask(t_b, h)
    both = a_hit & b_hit
    same_bar = both & (t_a == t_b)
    a_first = a_hit & ~same_bar & (~b_hit | (both & (t_a < t_b)))
    b_first = b_hit & ~same_bar & (~a_hit | (both & (t_b < t_a)))
    return np.select(
        [same_bar, a_first, b_first],
        [np.int8(3), np.int8(1), np.int8(2)],
        default=np.int8(0),
    ).astype(np.int8, copy=False)


def classify_tp_adv(
    t_tp: npt.NDArray[np.int64], t_adv: npt.NDArray[np.int64], h: int
) -> npt.NDArray[np.int8]:
    """Классификация «порядок цель/просадка» §3.4 (order_tp_adv).

    ``TP_FIRST | ADV_FIRST | NEITHER | UNRESOLVED_TP_ADV`` по hit-маскам
    ``0 < t ≤ h`` обоих времён; same-bar положительных времён →
    ``UNRESOLVED_TP_ADV`` (не зависит от способа хранения path-полей).

    Args:
        t_tp: 1-D int64 время первого tp-касания (sentinel −1).
        t_adv: 1-D int64 время первого adverse-касания (sentinel −1).
        h: горизонт окна, баров.

    Returns:
        1-D int8 массив кодов :class:`OrderTpAdv`.

    Raises:
        ValueError: если входы не 1-D или разной длины.
    """
    _require_1d_aligned(t_tp=t_tp, t_adv=t_adv)
    return _first_order_codes(t_tp, t_adv, h)


def classify_direction(
    t_up: npt.NDArray[np.int64], t_dn: npt.NDArray[np.int64], h: int
) -> npt.NDArray[np.int8]:
    """Классификация «порядок направлений» §3.4 (order_direction, k без a).

    ``LONG_FIRST | SHORT_FIRST | NEITHER | UNRESOLVED_LONG_SHORT`` по первым
    tp-барам двух направлений; совпадение бара → ``UNRESOLVED_LONG_SHORT``.

    Args:
        t_up: 1-D int64 время первого long-tp-касания (sentinel −1).
        t_dn: 1-D int64 время первого short-tp-касания (sentinel −1).
        h: горизонт окна, баров.

    Returns:
        1-D int8 массив кодов :class:`OrderDirection`.

    Raises:
        ValueError: если входы не 1-D или разной длины.
    """
    _require_1d_aligned(t_up=t_up, t_dn=t_dn)
    return _first_order_codes(t_up, t_dn, h)


def unresolved_tp_adv_flag(
    t_tp: npt.NDArray[np.int64], t_adv: npt.NDArray[np.int64], h: int
) -> npt.NDArray[np.bool_]:
    """Same-bar неоднозначность цель/просадка §3.4 — источник истины.

    ``tp_hit ∧ adv_hit ∧ (t_tp = t_adv)``: сравнение только положительных
    времён, hit-маски обязательны (равенство sentinel'ов ``−1 = −1`` маской
    исключается).

    Args:
        t_tp: 1-D int64 время первого tp-касания (sentinel −1).
        t_adv: 1-D int64 время первого adverse-касания (sentinel −1).
        h: горизонт окна, баров.

    Returns:
        1-D bool маска ``UNRESOLVED_TP_ADV``.

    Raises:
        ValueError: если входы не 1-D или разной длины.
    """
    _require_1d_aligned(t_tp=t_tp, t_adv=t_adv)
    flag: npt.NDArray[np.bool_] = (
        hit_mask(t_tp, h) & hit_mask(t_adv, h) & (t_tp == t_adv)
    )
    return flag


def assert_unresolved_invariant(
    t_tp: npt.NDArray[np.int64],
    t_adv: npt.NDArray[np.int64],
    h: int,
    touch_bar_adv: npt.NDArray[np.float64],
    pre_mae_signed: npt.NDArray[np.float64],
    pre_touch_window_empty: npt.NDArray[np.bool_],
    a: float,
) -> None:
    """Проверочный инвариант-эквивалентность UNRESOLVED §3.4 (errata e3).

    ``lhs = unresolved_tp_adv_flag(t_tp, t_adv, h)``;
    ``rhs = both_hit & (touch_bar_adv >= a) & (empty | (−pre_mae_signed < a))``.
    Инвариант storage-agnostic: lhs — только тайминги, rhs — только накопленные
    path-поля ядра; их равенство доказывает согласованность хранения.

    NaN-контракт: на TP-hit NaN в ``pre_mae_signed`` допустим только при пустом
    pre-touch (``empty=True``); NaN path-полей на TP-no-hit — контракт
    хранения задачи 1, нарушением не является. ``pre_touch_window_empty``
    обязана равняться ``t_tp == 1`` (конвенция хранения); расхождение —
    ``mask_violation``.

    Args:
        t_tp: 1-D int64 время первого tp-касания (sentinel −1).
        t_adv: 1-D int64 время первого adverse-касания уровня ``a``.
        h: горизонт окна, баров.
        touch_bar_adv: 1-D float64 adverse-экскурсия tp-бара, bps (≥ 0, NaN
            без касания).
        pre_mae_signed: 1-D float64 signed pre-touch MAE ≤ 0, bps (NaN без
            касания/при пустом pre-touch).
        pre_touch_window_empty: 1-D bool маска пустого pre-touch (``t_tp == 1``).
        a: adverse-уровень, bps.

    Raises:
        ValueError: если входы не 1-D или разной длины.
        AssertionError: при ``mask_violation`` (empty ≠ ``t_tp == 1``),
            ``nan_violation`` (NaN на TP-hit при непустом pre-touch) или
            расхождении ``lhs ≠ rhs``.
    """
    _require_1d_aligned(
        t_tp=t_tp,
        t_adv=t_adv,
        touch_bar_adv=touch_bar_adv,
        pre_mae_signed=pre_mae_signed,
        pre_touch_window_empty=pre_touch_window_empty,
    )
    lhs = unresolved_tp_adv_flag(t_tp, t_adv, h)
    tp_hit = hit_mask(t_tp, h)
    adv_hit = hit_mask(t_adv, h)
    both_hit = tp_hit & adv_hit
    expected_empty = t_tp == 1
    mask_violation = pre_touch_window_empty != expected_empty
    nan_violation = tp_hit & np.isnan(pre_mae_signed) & ~pre_touch_window_empty
    pre_ok = pre_touch_window_empty | (-pre_mae_signed < a)
    rhs = both_hit & (touch_bar_adv >= a) & pre_ok
    if bool(mask_violation.any()):
        i = int(np.argmax(mask_violation))
        raise AssertionError(
            f"mask_violation: pre_touch_window_empty[{i}]="
            f"{bool(pre_touch_window_empty[i])} != (t_tp[{i}]==1)="
            f"{bool(expected_empty[i])} — нарушена конвенция хранения"
        )
    if bool(nan_violation.any()):
        i = int(np.argmax(nan_violation))
        raise AssertionError(
            f"nan_violation: pre_mae_signed[{i}]=NaN на TP-hit "
            f"(t_tp[{i}]={t_tp[i]}) при непустом pre-touch"
        )
    if not bool(np.array_equal(lhs, rhs)):
        mismatch = lhs != rhs
        i = int(np.argmax(mismatch))
        raise AssertionError(
            f"инвариант UNRESOLVED (§3.4, e3) нарушен в строке {i}: "
            f"lhs={bool(lhs[i])} != rhs={bool(rhs[i])} "
            f"(t_tp={t_tp[i]}, t_adv={t_adv[i]}, "
            f"touch_bar_adv={touch_bar_adv[i]}, "
            f"pre_mae_signed={pre_mae_signed[i]}, "
            f"empty={bool(pre_touch_window_empty[i])}, a={a})"
        )
