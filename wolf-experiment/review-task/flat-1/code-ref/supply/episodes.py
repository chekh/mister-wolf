# src/zetaflowlab/supply/episodes.py
"""FSM эпизодов движения §3.11 (задача 6 WП-1): rev.1 — буквальный проход.

Фаза 6b (GREEN): контракты 6a + реализация :func:`run_episodes` —
буквальный python-проход по ряду, spans записываются параллельно
сегментации; контракты ниже дословно из §3.11 спеки v4.2 и брифа задачи 6.

Определение (§3.11): ``episode_definition_id: zigzag_reversal_v1_k{k}_r{r}``;
квалификация ``amplitude ≥ k`` НЕ зависит от ``r``; базовое определение
D₀ — ``r = k``. Нормировка единая: развороты — bps к опорному экстремуму
текущего направления; амплитуда — bps к ``start_price`` (началу ноги);
все сравнения включительные ``≥``, float64, без округления.

Две раздельные сущности (не смешивать):

* :class:`EpisodeLeg` — matchable-сущность §3.12: нога подтверждённого
  эпизода ``[start_row, ext_row]``;
* :class:`StateSpan` — состояние автомата: покрывает ВЕСЬ ряд без дыр
  (полуинтервалы ``[start_row, end_row)``; последний span — до конца ряда).

Тайл-семантика ног (§3.12(2)): ноги подтверждённых эпизодов чейнятся общими
ext-границами: ``leg_{n+1}.start_row = leg_n.ext_row``; объединение ног =
``[leg_1.start_row, leg_N.ext_row]`` — каждый бар диапазона ровно в одной
ноге (граничный ``ext_row`` — в двух, разрешается направлением).
Retracement-хвост ``(ext_n, confirm_n)`` лежит ВНУТРИ ``leg_{n+1} =
[ext_n, ext_{n+1}]`` (running-экстремум новой ноги стартует с confirm-бара
⇒ ``ext_{n+1} ≥ confirm_n``) — touch там матчится по общему правилу
контейна+направление, состояние ``unmatched`` для него НЕ вводится. Бары
вне ``[leg_1.start, leg_N.ext]`` классифицируются по :class:`StateSpan`
(init/init_unresolved/censored → ``init_or_censored``).

Соотношение сущностей (намеренное расхождение — причина разделения):
tracking-span эпизода ``n+1`` начинается с ``confirm_n`` (§3.11 «бар j
принадлежит НОВОМУ сегменту»), а нога ``n+1`` — с ``ext_n < confirm_n``:
retracement-хвост ``(ext_n, confirm_n)`` лежит в **leg n+1**, но в
**tracking-span n** (до подтверждения автомат ещё в состоянии n).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

import numpy as np
import numpy.typing as npt

#: Знаменатель bps-нормировки §3.2/§3.11: ``(x/ref − 1)·10⁴``.
BPS_DENOM: float = 10_000.0

#: Направления эпизодов/ног.
DIR_UP: str = "UP"
DIR_DOWN: str = "DOWN"

#: Состояния автомата §3.11 (``StateSpan.state``).
STATE_INIT: str = "init"
STATE_INIT_UNRESOLVED: str = "init_unresolved"
STATE_TRACKING: str = "tracking"
STATE_CENSORED: str = "censored"

#: Политики внутрибарного порядка ``same_bar`` §3.11: ``unresolved`` —
#: основная (флаг ``order_unresolved``); ``high_first``/``low_first`` —
#: глобальные конвенции sensitivity-range (две полные FSM-траектории).
SAME_BAR_POLICIES: frozenset[str] = frozenset({"unresolved", "high_first", "low_first"})


@dataclass(frozen=True)
class Episode:
    """Подтверждённый эпизод движения §3.11 (поля rev.1).

    ``start`` — экстремум-старт ноги (= ``ext`` предыдущего сегмента; для
    первого эпизода — экстремум INIT-лид-ина); ``ext`` — экстремум-финиш;
    ``confirm`` — бар подтверждения разворота. «Не более одного
    подтверждения на бар — следующий reversal подтверждается только
    с бара ≥ confirm_row + 1». Последний незавершённый сегмент — censored,
    эпизодом НЕ становится.

    Attributes:
        direction: ``"UP" | "DOWN"``.
        start_row / start_price / start_ts_ns: старт ноги (row, цена
            экстремума-старта, timestamp этого бара, ns).
        ext_row / ext_price / ext_ts_ns: экстремум-финиш (row, цена,
            timestamp; «extremum timestamp хранится отдельно» §3.11).
        confirm_row / confirm_ts_ns: бар подтверждения разворота.
        duration_bars: ``ext_row − start_row`` (движение).
        confirm_delay_bars: ``confirm_row − ext_row`` (co-поле).
        amplitude_bps: UP ``(ext_price/start_price − 1)·10⁴``; DOWN
            ``(1 − ext_price/start_price)·10⁴`` — к ``start_price``.
        overshoot_bps: ``reversal_bps(confirm_row) − r ≥ 0`` (float-допуск
            ≥ −1e-9): UP ``(1 − low[confirm_row]/ext_price)·10⁴ − r``;
            DOWN ``(high[confirm_row]/ext_price − 1)·10⁴ − r``.
        year / month: календарный год/месяц **экстремума** ``ext_ts_ns``
            (UTC; «active days supply — по дате extremum» §3.11).
        qualifying: ``amplitude_bps ≥ k`` (НЕ зависит от ``r``).
        order_unresolved: подтверждение на баре, который сам обновил
            экстремум (``ext_row == confirm_row``) — внутрибарный порядок
            high/low неизвестен; в основной счёт не входит (§3.11).
        episode_definition_id: идентификатор определения
            (:func:`episode_definition_id`).
    """

    direction: str
    start_row: int
    start_price: float
    start_ts_ns: int
    ext_row: int
    ext_price: float
    ext_ts_ns: int
    confirm_row: int
    confirm_ts_ns: int
    duration_bars: int
    confirm_delay_bars: int
    amplitude_bps: float
    overshoot_bps: float
    year: int
    month: int
    qualifying: bool
    order_unresolved: bool
    episode_definition_id: str


@dataclass(frozen=True)
class EpisodeLeg:
    """Matchable-сущность §3.12: нога подтверждённого эпизода ``[start_row, ext_row]``.

    Ноги чейнятся общими ext-границами: ``leg_{n+1}.start_row =
    leg_n.ext_row``; внутри одного определения ноги не перекрываются
    (кроме граничного ``ext_row``, где направление разрешает
    неоднозначность) → максимум один эпизод на touch group (§3.12(2)).

    Attributes:
        start_row: экстремум-старт ноги (= ``ext_row`` предыдущей).
        ext_row: экстремум-финиш ноги.
        direction: ``"UP" | "DOWN"`` (long-touch ↔ UP, short ↔ DOWN).
        episode_index: индекс эпизода в ``EpisodesResult.episodes`` (0-базис).
        amplitude_bps: амплитуда ноги (= ``Episode.amplitude_bps``).
        qualifying: ``amplitude_bps ≥ k`` (граница включительно).
        order_unresolved: флаг ``episode_order_unresolved`` эпизода.
        episode_definition_id: идентификатор определения.
    """

    start_row: int
    ext_row: int
    direction: str
    episode_index: int
    amplitude_bps: float
    qualifying: bool
    order_unresolved: bool
    episode_definition_id: str


@dataclass(frozen=True)
class StateSpan:
    """Состояние автомата — ПОКРЫВАЕТ ВЕСЬ РЯД без дыр.

    Полуинтервалы ``[start_row, end_row)`` внутри реализации; последний
    span — до конца ряда. Стык ``span_n.end_row = span_{n+1}.start_row``.

    Attributes:
        start_row: первый бар спана (включительно).
        end_row: конец спана (исключительно; ``end_row = len(high)`` у последнего).
        state: ``"init" | "init_unresolved" | "tracking" | "censored"``.
        direction: направление сегмента (``None`` для init/init_unresolved;
            для censored-хвоста — направление незавершённого кандидата,
            ``None`` если направление так и не назначено).
        episode_index: индекс эпизода для ``tracking``; иначе ``None``
            (censored-кандидат в счёт не входит).
        censored: ``True`` у незавершённых хвостов (лид-ин без выхода или
            последний незавершённый сегмент; state при этом ``"censored"``).
    """

    start_row: int
    end_row: int
    state: str
    direction: str | None
    episode_index: int | None
    censored: bool


@dataclass(frozen=True)
class EpisodeCounts:
    """Три именованных счёта §3.11 (политика ``unresolved``); НЕ min/max-границы.

    Помеченный эпизод меняет и последующую сегментацию — два счёта в одной
    operational-сегментации не являются границами допустимого числа
    эпизодов; диапазон двух глобальных конвенций — sensitivity-range
    (``high_first``/``low_first``), не границы допустимого счёта (§3.11).

    Attributes:
        resolved_episode_count: подтверждённые эпизоды без флага
            (основной ledger).
        flagged_episode_count: эпизоды с ``order_unresolved=True``
            (в основной счёт не входят).
        count_if_flagged_included: resolved + flagged.
    """

    resolved_episode_count: int
    flagged_episode_count: int
    count_if_flagged_included: int


@dataclass(frozen=True)
class EpisodesResult:
    """Выход :func:`run_episodes`: эпизоды + раздельные ledgers.

    Attributes:
        episodes: подтверждённые эпизоды в порядке ``confirm_row``
            (censored-кандидаты НЕ входят).
        legs: matchable-ноги подтверждённых эпизодов (§3.12), чейнинг общими
            ext-границами.
        spans: state-ledger на весь ряд (без дыр, полуинтервалы).
        n_init_censored: суммарное число баров в состояниях
            init/init_unresolved/censored (лид-ин + незавершённые хвосты —
            зона «init_or_censored» §3.12(3)).
        episode_counts: три именованных счёта §3.11.
    """

    episodes: list[Episode]
    legs: list[EpisodeLeg]
    spans: list[StateSpan]
    n_init_censored: int
    episode_counts: EpisodeCounts


def episode_definition_id(k: float, r: float) -> str:
    """Идентификатор определения эпизодов §3.11: ``zigzag_reversal_v1_k{k}_r{r}``.

    Уровни — формат ``%g`` (без хвостовых нулей): ``k=22 → "k22"``,
    ``k=37.5 → "k37.5"``. ``episodes/year`` публикуется всегда с этим id.

    Args:
        k: ``movement_scale_bps`` — масштаб исследуемой цели (квалификация
            ``amplitude ≥ k``).
        r: ``reversal_threshold_bps`` — порог подтверждения разворота.

    Returns:
        Стабильная строка идентификатора определения.

    Raises:
        ValueError: ``k ≤ 0`` или ``r ≤ 0``.
    """
    if not k > 0.0:
        raise ValueError(f"k должно быть > 0: k={k}")
    if not r > 0.0:
        raise ValueError(f"r должно быть > 0: r={r}")
    return f"zigzag_reversal_v1_k{k:g}_r{r:g}"


def _validate_inputs(
    high: npt.NDArray[np.float64],
    low: npt.NDArray[np.float64],
    ts_ns: npt.NDArray[np.int64],
    k: float,
    r: float,
    same_bar: str,
) -> None:
    """Проверить входы FSM §3.11; production-политика — стоп (§8).

    Правила (каждое — ``ValueError`` с указанием первого нарушителя):

    * ``high``/``low``/``ts_ns`` — 1-D равной длины ≥ 1 (пустой ряд
      не имеет состояний);
    * цены конечны (NaN/inf запрещены) и ``> 0``; ``high[j] ≥ low[j]``;
    * ``k > 0`` и ``r > 0``;
    * ``same_bar ∈ {"unresolved", "high_first", "low_first"}``.

    Raises:
        ValueError: при нарушении любого правила.
    """
    n_bars = high.shape[0]
    if high.ndim != 1 or low.ndim != 1 or ts_ns.ndim != 1:
        raise ValueError("high/low/ts_ns должны быть 1-D массивами баров")
    if not (low.shape[0] == n_bars and ts_ns.shape[0] == n_bars):
        raise ValueError(
            f"длины рядов не равны: high={n_bars}, low={low.shape[0]}, "
            f"ts_ns={ts_ns.shape[0]}"
        )
    if n_bars == 0:
        raise ValueError("пустой ряд: FSM требует минимум один бар")
    for name, arr in (("high", high), ("low", low)):
        finite = np.isfinite(arr)
        if not bool(finite.all()):
            i = int(np.argmax(~finite))
            raise ValueError(f"цены не конечны: {name}[{i}] = {arr[i]}")
        bad = ~(arr > 0.0)
        if bool(bad.any()):
            i = int(np.argmax(bad))
            raise ValueError(f"цены должны быть > 0: {name}[{i}] = {arr[i]}")
    inverted = high < low
    if bool(inverted.any()):
        i = int(np.argmax(inverted))
        raise ValueError(
            f"инвертированный бар: high[{i}]={high[i]} < low[{i}]={low[i]}"
        )
    if not k > 0.0:
        raise ValueError(f"k должно быть > 0: k={k}")
    if not r > 0.0:
        raise ValueError(f"r должно быть > 0: r={r}")
    if same_bar not in SAME_BAR_POLICIES:
        raise ValueError(
            f"same_bar={same_bar!r} ∉ {sorted(SAME_BAR_POLICIES)}"
        )


def _year_month_utc(ts_ns: int) -> tuple[int, int]:
    """Календарный год/месяц timestamp (ns) в UTC — без float-деления.

    Секундное деление ``//`` сохраняет точность (float-деление ns теряло
    бы разряды); календарные поля эпизода — по ts экстремума (§3.11).
    """
    dt = datetime.fromtimestamp(ts_ns // 1_000_000_000, tz=UTC)
    return dt.year, dt.month


def run_episodes(
    high: npt.ArrayLike,
    low: npt.ArrayLike,
    ts_ns: npt.ArrayLike,
    k: float,
    r: float,
    same_bar: str = "unresolved",
) -> EpisodesResult:
    """FSM эпизодов движения §3.11 по наблюдаемым M1-барам (буквальный проход).

    Буквальный python-проход по ряду (Step 2→3): INIT-лид-ин →
    tracking-сегменты zigzag-определения ``zigzag_reversal_v1``; spans
    записываются параллельно сегментации.

    Контракт (§3.11, дословно):

    * INIT, порядок на каждом баре — как в TRACKING (сначала обновить,
      потом проверять): ``hi = max(hi, high[j])``, ``lo = min(lo, low[j])``
      (с row; при равенстве — БОЛЕЕ РАННИЙ row); проверка первого
      подтверждения: UP ``(high[j]/lo − 1)·10⁴ ≥ r`` (ref = lo), DOWN
      ``(1 − low[j]/hi)·10⁴ ≥ r`` (ref = hi); оба условия на одном баре:
      ``hi.row ≠ lo.row`` → детерминированно сегмент от БОЛЕЕ РАННЕГО
      экстремума; направление зависит от неизвестного внутрибарного
      порядка (в т.ч. ``hi.row == lo.row``) → INIT_UNRESOLVED: направление
      не назначается, hi/lo продолжают обновляться, выход — первое
      однозначное подтверждение; если не наступило до края данных — весь
      лид-ин censored.
    * TRACKING (UP; DOWN зеркально), строго по порядку: (1) обновить
      running-экстремум ``high[j] > ext → ext = high[j], ext_row = j``
      (при равенстве — сохраняется более ранний, детерминизм); (2)
      подтвердить разворот ``(1 − low[j]/ext)·10⁴ ≥ r``; подтверждение на
      баре-обновлении экстремума (``ext_row == j``) при политике
      ``unresolved`` даёт эпизоду флаг ``order_unresolved`` (в основной
      счёт не входит); при ``high_first``/``low_first`` неоднозначность
      разрешается конвенцией (``high_first``: экстремум раньше отката —
      подтверждение валидно; ``low_first``: подтверждение на таком баре не
      наступает, проверка продолжается со следующих баров).
    * При подтверждении: сегмент закрывается (episode с ``amplitude_bps``
      к ``start_price``, ``qualifying: amplitude_bps ≥ k``); новый сегмент
      противоположного направления: ``start = ext`` (row/price); **бар j
      принадлежит НОВОМУ сегменту** (``low[j]`` обновляет его running min;
      tracking-span нового эпизода начинается с ``confirm_row``); НЕ БОЛЕЕ
      ОДНОГО подтверждения на бар — следующий reversal подтверждается
      только с бара ``≥ j+1`` (overshoot/гэп через несколько уровней
      поглощается амплитудой; счёт консервативен).
    * Данные: data-gap/weekend бары НЕ сбрасывают состояние (переходы
      классифицируются отдельно, §3.13); края: первый бар — INIT, последний
      незавершённый сегмент — censored, в счёт не входит; календарные
      поля эпизода — UTC по ``ts_ns`` экстремума.

    Args:
        high: максимум баров, float64-совместимый 1-D массив.
        low: минимум баров (``low[j] ≤ high[j]``, цены ``> 0``).
        ts_ns: timestamps баров, epoch ns int64 (календарь эпизода).
        k: ``movement_scale_bps`` — квалификация ``amplitude ≥ k``.
        r: ``reversal_threshold_bps`` — порог подтверждения разворота
            (D₀: ``r = k``).
        same_bar: политика внутрибарного порядка: ``"unresolved"``
            (основная, флаг) | ``"high_first"`` | ``"low_first"``
            (sensitivity-range).

    Returns:
        :class:`EpisodesResult` — эпизоды, matchable-ноги, state-ledger
        на весь ряд, ``n_init_censored`` и именованные счёты.

    Raises:
        ValueError: нарушения контракта входов (см. :func:`_validate_inputs`).
    """
    high64 = np.asarray(high, dtype=np.float64)
    low64 = np.asarray(low, dtype=np.float64)
    ts64 = np.asarray(ts_ns, dtype=np.int64)
    _validate_inputs(high64, low64, ts64, k, r, same_bar)

    n_bars = int(high64.shape[0])
    definition_id = episode_definition_id(k, r)

    # Леджеры результата.
    episodes: list[Episode] = []
    legs: list[EpisodeLeg] = []
    spans: list[StateSpan] = []

    # Состояние автомата: лид-ин (init/init_unresolved) или tracking.
    tracking = False
    unresolved_from: int | None = None  # бар первой неоднозначности лид-ина
    # Running-экстремумы лид-ина (row при равенстве — более ранний).
    hi_price = float("-inf")
    hi_row = -1
    lo_price = float("inf")
    lo_row = -1
    # Текущий tracking-сегмент.
    dir_up = False
    start_row = -1
    start_price = 0.0
    ext_row = -1
    ext_price = 0.0
    seg_start_row = -1  # старт tracking-span сегмента (= confirm предыдущего)

    for j in range(n_bars):
        hj = float(high64[j])
        lj = float(low64[j])

        if not tracking:
            # INIT: сначала обновить, потом проверять (как в TRACKING).
            if hj > hi_price:
                hi_price, hi_row = hj, j
            if lj < lo_price:
                lo_price, lo_row = lj, j
            up_ok = (hj / lo_price - 1.0) * BPS_DENOM >= r
            down_ok = (1.0 - lj / hi_price) * BPS_DENOM >= r
            exit_up: bool | None = None
            if up_ok and down_ok:
                if hi_row != lo_row:
                    # детерминированно: сегмент от БОЛЕЕ РАННЕГО экстремума
                    exit_up = lo_row < hi_row
                elif same_bar == "high_first":
                    exit_up = True
                elif same_bar == "low_first":
                    exit_up = False
                elif unresolved_from is None:
                    unresolved_from = j  # INIT_UNRESOLVED: лид-ин ждёт выхода
            elif up_ok:
                exit_up = True
            elif down_ok:
                exit_up = False

            if exit_up is not None:
                # Спаны лид-ина: init [+ init_unresolved], до бара выхода j.
                if unresolved_from is not None:
                    if unresolved_from > 0:
                        spans.append(
                            StateSpan(0, unresolved_from, STATE_INIT, None, None, False)
                        )
                    spans.append(
                        StateSpan(
                            unresolved_from, j, STATE_INIT_UNRESOLVED, None, None, False
                        )
                    )
                else:
                    spans.append(StateSpan(0, j, STATE_INIT, None, None, False))
                tracking = True
                if exit_up:
                    dir_up = True
                    start_row, start_price = lo_row, lo_price
                    ext_row, ext_price = j, hj
                else:
                    dir_up = False
                    start_row, start_price = hi_row, hi_price
                    ext_row, ext_price = j, lj
                seg_start_row = j  # бар j принадлежит НОВОМУ сегменту
            continue

        # TRACKING: (1) обновить running-экстремум (равенство — ранний row).
        if dir_up:
            if hj > ext_price:
                ext_price, ext_row = hj, j
            reversal_bps = (1.0 - lj / ext_price) * BPS_DENOM
        else:
            if lj < ext_price:
                ext_price, ext_row = lj, j
            reversal_bps = (hj / ext_price - 1.0) * BPS_DENOM

        # (2) проверить подтверждение разворота (включительное ≥).
        if reversal_bps < r:
            continue
        confirmed = True
        flagged = False
        if ext_row == j:
            # Подтверждение на баре-обновлении экстремума: порядок неизвестен.
            if same_bar == "unresolved":
                flagged = True
            elif same_bar == "high_first":
                confirmed = dir_up  # экстремум раньше отката — только для UP
            else:  # low_first
                confirmed = not dir_up  # экстремум раньше отката — только DOWN
        if not confirmed:
            continue

        # Закрыть сегмент: эпизод + matchable-нога + tracking-span.
        if dir_up:
            amplitude_bps = (ext_price / start_price - 1.0) * BPS_DENOM
        else:
            amplitude_bps = (1.0 - ext_price / start_price) * BPS_DENOM
        year, month = _year_month_utc(int(ts64[ext_row]))
        episode = Episode(
            direction=DIR_UP if dir_up else DIR_DOWN,
            start_row=start_row,
            start_price=start_price,
            start_ts_ns=int(ts64[start_row]),
            ext_row=ext_row,
            ext_price=ext_price,
            ext_ts_ns=int(ts64[ext_row]),
            confirm_row=j,
            confirm_ts_ns=int(ts64[j]),
            duration_bars=ext_row - start_row,
            confirm_delay_bars=j - ext_row,
            amplitude_bps=amplitude_bps,
            overshoot_bps=reversal_bps - r,
            year=year,
            month=month,
            qualifying=amplitude_bps >= k,
            order_unresolved=flagged,
            episode_definition_id=definition_id,
        )
        episode_index = len(episodes)
        episodes.append(episode)
        legs.append(
            EpisodeLeg(
                start_row=start_row,
                ext_row=ext_row,
                direction=episode.direction,
                episode_index=episode_index,
                amplitude_bps=amplitude_bps,
                qualifying=episode.qualifying,
                order_unresolved=flagged,
                episode_definition_id=definition_id,
            )
        )
        spans.append(
            StateSpan(seg_start_row, j, STATE_TRACKING, episode.direction, episode_index, False)
        )

        # Новый сегмент противоположного направления от ext; бар j — его
        # первый бар (экстремум confirm-бара обновляет running-экстремум);
        # следующее подтверждение — только с бара ≥ j+1 (цикл идёт дальше).
        dir_up = not dir_up
        start_row, start_price = ext_row, ext_price
        if dir_up:
            ext_row, ext_price = j, hj
        else:
            ext_row, ext_price = j, lj
        seg_start_row = j

    # Хвост: последний незавершённый сегмент (или весь лид-ин) — censored.
    if tracking:
        spans.append(
            StateSpan(
                seg_start_row, n_bars, STATE_CENSORED,
                DIR_UP if dir_up else DIR_DOWN, None, True,
            )
        )
    else:
        spans.append(StateSpan(0, n_bars, STATE_CENSORED, None, None, True))

    n_init_censored = sum(
        s.end_row - s.start_row for s in spans if s.state != STATE_TRACKING
    )
    resolved = sum(1 for e in episodes if not e.order_unresolved)
    flagged_count = len(episodes) - resolved
    return EpisodesResult(
        episodes=episodes,
        legs=legs,
        spans=spans,
        n_init_censored=n_init_censored,
        episode_counts=EpisodeCounts(
            resolved_episode_count=resolved,
            flagged_episode_count=flagged_count,
            count_if_flagged_included=len(episodes),
        ),
    )
