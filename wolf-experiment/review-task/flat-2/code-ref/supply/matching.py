# src/zetaflowlab/supply/matching.py
"""Episode–window matching §3.12 (задача 8 WП-1, атлас v4.2): rev.1 + C2c.

Сопоставление touch group (τ, dir, k) определению эпизодов D §3.11: касание
матчится эпизоду, чья нога ``[start_row, ext_row]`` содержит ``touch_row``
**и** направление совпадает (up/long ↔ UP, dn/short ↔ DOWN); матчинг к любой
ноге, не только qualifying (``touch of k ⇏ leg amplitude ≥ k`` — разные
базы: target к entry, амплитуда к start_price).

Шесть взаимоисключающих состояний §3.12(3) (полное разбиение, сумма долей
= 1): ``matched_qualifying`` · ``matched_nonqualifying`` (нога-служба < k —
полезная статистика, не QA-ошибка) · ``init_or_censored`` ·
``direction_mismatch`` · ``unresolved_episode`` · ``unmatched``.
Детерминированный приоритет при нескольких применимых причинах:
``unresolved_episode → init_or_censored → direction_mismatch →
matched_qualifying/matched_nonqualifying → unmatched``.

Граничные правила (§3.12(2), тайл-семантика задачи 6):

* общая граница ``ext_row`` двух ног разрешается НАПРАВЛЕНИЕМ (у ног
  чередующиеся направления — выживает единственная совпадающая);
* confirm-бар и retracement-tail ``(ext_n, confirm_n)`` принадлежат НОВОЙ
  (следующей) ноге ``[ext_n, ext_{n+1}]``; при нескольких выживших по
  направлению ногах (вырожденный случай нулевой ноги — три ноги содержат
  один бар) выбирается нога с БОЛЬШИМ индексом («новая нога»);
* ``unresolved_episode`` — ТОЛЬКО подтверждённые ноги с
  ``order_unresolved=True`` (INIT_UNRESOLVED-лид-ин — зона инициализации →
  ``init_or_censored``);
* касание в ``init``/``init_unresolved``/``censored``-спане →
  ``init_or_censored`` независимо от контейнер-ноги (приоритет 2 над
  matched/direction_mismatch, но НЕ над ``unresolved_episode``);
* ``unmatched`` — defensive-fallback И согласованный residual: tracking-хвост
  ``(ext_N, confirm_N)`` ПОСЛЕДНЕГО эпизода лежит за пределами всех ног (на
  реальном ряду таких баров ≤ confirm_delay финального эпизода → доля ≈ 0).

Cardinality §3.12(2): одна группа ≤ 1 match на ``episode_definition_id``
(внутри определения ноги не перекрываются, кроме граничного ``ext_row``);
разные группы законно матчатся к одной ноге/эпизоду; в batch-выходе ключи
``(group_id, episode_definition_id)`` уникальны (дубль ``group_id`` — стоп).

C2c-прототип (§3.12(5), C2c): вклад qualifying-эпизода в coverage =
``unique_successful_anchors`` его matching-групп (объединение якорей, НЕ
сумма длин — перекрытия групп не считаются дважды) / все успешные якори;
топ-1/5/10 — только qualifying-эпизоды; ``nonqualifying_touch_share`` —
доля matched_nonqualifying-групп среди всех групп; признак qualifying
выводится из состояний матча (эпизод без matched-групп виден прототипу
как nonqualifying — ограничение rev.1, полный признак в
``EpisodeLeg.qualifying``).
"""
from __future__ import annotations

from bisect import bisect_right
from collections import Counter
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Protocol

from loguru import logger

from zetaflowlab.supply.episodes import (
    DIR_DOWN,
    DIR_UP,
    STATE_CENSORED,
    STATE_INIT,
    STATE_INIT_UNRESOLVED,
    STATE_TRACKING,
    EpisodeLeg,
    StateSpan,
)

#: Шесть состояний матча §3.12(3) (полное разбиение).
MATCHED_QUALIFYING: str = "matched_qualifying"
MATCHED_NONQUALIFYING: str = "matched_nonqualifying"
INIT_OR_CENSORED: str = "init_or_censored"
DIRECTION_MISMATCH: str = "direction_mismatch"
UNRESOLVED_EPISODE: str = "unresolved_episode"
UNMATCHED: str = "unmatched"

#: Множество шести состояний (partition-тест: сумма долей = 1).
MATCH_STATES: frozenset[str] = frozenset(
    {
        MATCHED_QUALIFYING,
        MATCHED_NONQUALIFYING,
        INIT_OR_CENSORED,
        DIRECTION_MISMATCH,
        UNRESOLVED_EPISODE,
        UNMATCHED,
    }
)

#: Спаны зоны инициализации/цензурирования → ``init_or_censored``.
_INIT_CENSORED_SPANS: frozenset[str] = frozenset(
    {STATE_INIT, STATE_INIT_UNRESOLVED, STATE_CENSORED}
)

#: Допустимые состояния state-ledger задачи 6 (§3.11).
_KNOWN_SPAN_STATES: frozenset[str] = frozenset(
    {STATE_INIT, STATE_INIT_UNRESOLVED, STATE_TRACKING, STATE_CENSORED}
)

#: Тег направления группы (§3.5 "up" | "dn") → направление ноги §3.11.
_DIR_TAG_TO_LEG: dict[str, str] = {"up": DIR_UP, "dn": DIR_DOWN}


class TouchGroupLike(Protocol):
    """Структурный контракт touch group для матчинга (DIP).

    Достаточно полей идентификации касания: ``group_id`` (детерминированный
    формат :func:`zetaflowlab.supply.touch_groups.group_id_of`),
    ``touch_row`` (позиционный индекс бара-касания) и ``direction``
    (тег направления якорей группы: ``"up" | "dn"``).
    """

    group_id: str
    touch_row: int
    direction: str


@dataclass(frozen=True)
class MatchResult:
    """Результат матча одной группы под одним определением эпизодов.

    Attributes:
        group_id: идентификатор touch group (§3.5).
        state: одно из шести состояний §3.12(3) (:data:`MATCH_STATES`).
        episode_index: индекс эпизода в ``EpisodesResult.episodes``; не
            ``None`` ТОЛЬКО для matched-состояний (кардинальность: не-null
            episode_index ⟺ matched_qualifying/matched_nonqualifying).
        episode_definition_id: идентификатор определения §3.11
            (``zigzag_reversal_v1_k{k}_r{r}``).
        matched_leg_index: индекс matched-ноги во входной последовательности
            ``legs``; ``None`` для всех нематченных состояний.
    """

    group_id: str
    state: str
    episode_index: int | None
    episode_definition_id: str
    matched_leg_index: int | None


@dataclass(frozen=True)
class EpisodeContribution:
    """Вклад одного эпизода в coverage (C2c-прототип).

    Attributes:
        episode_index: индекс эпизода (0-базис).
        qualifying: ``True`` ⟺ у эпизода есть matched_qualifying-группы
            (вывод по состояниям матча; окно без matching-групп —
            ``False``, ограничение rev.1).
        n_groups: число matched-групп эпизода (qualifying + nonqualifying).
        unique_successful_anchors: мощность объединения якорей matched-групп
            (основная мера доступного времени; сумма длин групп не
            используется — включает перекрытия).
        contribution_share: ``unique_successful_anchors /
            total_successful_anchors`` (NaN при пустом знаменателе).
    """

    episode_index: int
    qualifying: bool
    n_groups: int
    unique_successful_anchors: int
    contribution_share: float


@dataclass(frozen=True)
class C2cPrototypeResult:
    """Выход :func:`c2c_prototype`: вклады эпизодов + агрегаты C2c rev.1.

    Attributes:
        contributions: вклады всех эпизодов ``0..n_episodes−1`` по возрастанию
            индекса (эпизоды без matched-групп — нулевые вклады).
        top_k_shares: доля coverage от топ-K qualifying-эпизодов по
            ``unique_successful_anchors`` (детерминизм: убывание вклада, при
            равенстве — меньший episode_index).
        nonqualifying_touch_share: доля matched_nonqualifying-групп среди
            всех групп матча.
        episode_with_window_share: доля эпизодов с ≥1 matched-группой.
        unmatched_share: доля unmatched-групп (defensive + residual-хвост
            последнего эпизода).
        state_shares: доли всех шести состояний (сумма = 1; NaN-значения
            при пустой популяции).
        n_groups: число групп в матче.
        total_successful_anchors: Σ длин якорей групп, присутствующих в
            ``anchors_by_group`` (все успешные якори ячейки).
    """

    contributions: list[EpisodeContribution]
    top_k_shares: dict[int, float]
    nonqualifying_touch_share: float
    episode_with_window_share: float
    unmatched_share: float
    state_shares: dict[str, float]
    n_groups: int
    total_successful_anchors: int


def match_group(
    group: TouchGroupLike,
    legs: Sequence[EpisodeLeg],
    state_spans: Sequence[StateSpan],
    episode_definition_id: str,
    k: float,
) -> MatchResult:
    """Сопоставить одну touch group эпизодам определения (§3.12).

    Классификация — по приоритету §3.12(3): ``unresolved_episode →
    init_or_censored → direction_mismatch → matched_* → unmatched``
    (бисекция по ``legs[].start_row`` + walk-back по граничным ``ext_row``).

    Args:
        group: группа касаний (``group_id``, ``touch_row``, ``direction``).
        legs: matchable-ноги подтверждённых эпизодов (``run_episodes``).
        state_spans: state-ledger на весь ряд (задача 6); пусто —
            span-классификация пропускается (вырожденный вход).
        episode_definition_id: идентификатор определения (== id ног).
        k: уровень квалификации ``amplitude ≥ k`` (должен совпадать с k ног).

    Returns:
        :class:`MatchResult` — ровно одно из шести состояний §3.12(3).

    Raises:
        ValueError: нарушение контракта входов (production-политика §8).
    """
    _validate_definition(legs, state_spans, episode_definition_id, k)
    n_bars = state_spans[-1].end_row if state_spans else None
    _validate_group(group, n_bars)
    return _match_one(
        group,
        legs,
        [leg.start_row for leg in legs],
        state_spans,
        [span.start_row for span in state_spans],
        episode_definition_id,
    )


def match_groups(
    groups: Sequence[TouchGroupLike],
    legs: Sequence[EpisodeLeg],
    state_spans: Sequence[StateSpan],
    episode_definition_id: str,
    k: float,
) -> list[MatchResult]:
    """Batch-матчинг: по одному :class:`MatchResult` на группу (порядок входа).

    Инвариант кардинальности §3.12(2): ключи ``(group_id,
    episode_definition_id)`` уникальны — дубль ``group_id`` в batch
    останавливает выполнение (ValueError).

    Args:
        groups: группы касаний одной или нескольких ячеек (k, h, dir).
        legs: matchable-ноги подтверждённых эпизодов определения.
        state_spans: state-ledger на весь ряд.
        episode_definition_id: идентификатор определения.
        k: уровень квалификации (== k ног).

    Returns:
        Список :class:`MatchResult` в порядке входа; ``len == len(groups)``.

    Raises:
        ValueError: нарушение контракта входов или дубль ``group_id``.
    """
    _validate_definition(legs, state_spans, episode_definition_id, k)
    leg_starts = [leg.start_row for leg in legs]
    span_starts = [span.start_row for span in state_spans]
    n_bars = state_spans[-1].end_row if state_spans else None
    seen: set[str] = set()
    results: list[MatchResult] = []
    for group in groups:
        _validate_group(group, n_bars)
        if group.group_id in seen:
            raise ValueError(
                f"дубль group_id={group.group_id!r} в batch — ключ "
                "(group_id, episode_definition_id) должен быть уникален (§3.12(2))"
            )
        seen.add(group.group_id)
        results.append(
            _match_one(
                group, legs, leg_starts, state_spans, span_starts, episode_definition_id
            )
        )
    counts = Counter(m.state for m in results)
    logger.info(
        "matching {}: {} групп, состояния: {}",
        episode_definition_id,
        len(results),
        dict(sorted(counts.items())),
    )
    return results


def c2c_prototype(
    matches: Sequence[MatchResult],
    anchors_by_group: Mapping[str, Sequence[int]],
    n_episodes: int,
    top_k: Sequence[int] = (1, 5, 10),
) -> C2cPrototypeResult:
    """C2c-прототип rev.1: вклады эпизодов, топ-K coverage, доли состояний.

    ``unique_successful_anchors`` эпизода — мощность ОБЪЕДИНЕНИЯ якорей его
    matched-групп (перекрытия групп не считаются дважды; сумма длин —
    диагностическая величина и прототипом не публикуется). Топ-K и вклад в
    coverage — только qualifying-эпизоды (§3.12(5)); признак qualifying
    выводится из состояний матча (эпизод без matched-групп — nonqualifying,
    ограничение rev.1).

    Args:
        matches: результаты матчинга одного ``episode_definition_id``
            (смешение определений — ValueError).
        anchors_by_group: ``group_id → anchor_row`` успешных якорей группы;
            обязательны для всех matched-групп (отсутствие — ValueError).
        n_episodes: число эпизодов определения (0-базисные индексы матчей
            должны быть ``< n_episodes``).
        top_k: размеры топ-K qualifying-эпизодов (по умолчанию 1/5/10).

    Returns:
        :class:`C2cPrototypeResult`.

    Raises:
        ValueError: нарушение контракта входов (production-политика §8).
    """
    if n_episodes < 0:
        raise ValueError(f"n_episodes ≥ 0 нарушено: n_episodes={n_episodes}")
    for kk in top_k:
        if kk < 1:
            raise ValueError(f"top_k требует целых ≥ 1, получено {kk!r}")
    definition_ids = {m.episode_definition_id for m in matches}
    if len(definition_ids) > 1:
        raise ValueError(
            "смешение определений в matches: "
            f"{sorted(definition_ids)} — разные sensitivity-варианты не "
            "смешиваются (§3.12(4))"
        )
    seen: set[str] = set()
    for m in matches:
        if m.state not in MATCH_STATES:
            raise ValueError(f"неизвестное состояние матча: {m.state!r}")
        if m.group_id in seen:
            raise ValueError(
                f"дубль group_id={m.group_id!r} в matches — нарушение "
                "уникальности ключа (§3.12(2))"
            )
        seen.add(m.group_id)
    matched = [
        m for m in matches if m.state in (MATCHED_QUALIFYING, MATCHED_NONQUALIFYING)
    ]
    checked: list[tuple[MatchResult, int]] = []
    for m in matched:
        if m.group_id not in anchors_by_group:
            raise ValueError(
                f"у matched-группы {m.group_id!r} нет якорей в "
                "anchors_by_group — вклад эпизода невычислим"
            )
        ep = m.episode_index
        if ep is None or not 0 <= ep < n_episodes:
            raise ValueError(
                f"episode_index={m.episode_index!r} матча {m.group_id!r} "
                f"вне [0, n_episodes={n_episodes})"
            )
        checked.append((m, ep))

    n_groups_by_ep: Counter[int] = Counter()
    anchors_by_ep: dict[int, set[int]] = {}
    qualifying_eps: set[int] = set()
    for m, ep in checked:
        n_groups_by_ep[ep] += 1
        anchors_by_ep.setdefault(ep, set()).update(anchors_by_group[m.group_id])
        if m.state == MATCHED_QUALIFYING:
            qualifying_eps.add(ep)
    unique_by_ep = {ep: len(rows) for ep, rows in anchors_by_ep.items()}
    total = sum(len(rows) for gid, rows in anchors_by_group.items() if gid in seen)

    contributions = [
        EpisodeContribution(
            episode_index=ep,
            qualifying=ep in qualifying_eps,
            n_groups=n_groups_by_ep.get(ep, 0),
            unique_successful_anchors=unique_by_ep.get(ep, 0),
            contribution_share=_share(unique_by_ep.get(ep, 0), total),
        )
        for ep in range(n_episodes)
    ]
    ranked = sorted(
        (c for c in contributions if c.qualifying),
        key=lambda c: (-c.unique_successful_anchors, c.episode_index),
    )
    top_k_shares = {
        kk: _share(sum(c.unique_successful_anchors for c in ranked[:kk]), total)
        for kk in top_k
    }
    state_counts: Counter[str] = Counter(m.state for m in matches)
    n_matches = len(matches)
    with_window = sum(1 for c in contributions if c.n_groups > 0)
    result = C2cPrototypeResult(
        contributions=contributions,
        top_k_shares=top_k_shares,
        nonqualifying_touch_share=_share(
            state_counts.get(MATCHED_NONQUALIFYING, 0), n_matches
        ),
        episode_with_window_share=_share(with_window, n_episodes),
        unmatched_share=_share(state_counts.get(UNMATCHED, 0), n_matches),
        state_shares={
            st: _share(state_counts.get(st, 0), n_matches)
            for st in sorted(MATCH_STATES)
        },
        n_groups=n_matches,
        total_successful_anchors=total,
    )
    logger.info(
        "c2c-прототип: {} групп, {} эпизодов, топ-1={:.4f}, unmatched={:.4f}",
        n_matches,
        n_episodes,
        result.top_k_shares.get(top_k[0] if top_k else 1, float("nan")),
        result.unmatched_share,
    )
    return result


def _share(numerator: int, denominator: int) -> float:
    """Доля ``numerator / denominator``; NaN при пустом знаменателе.

    Args:
        numerator: числитель (≥ 0).
        denominator: знаменатель (≥ 0).

    Returns:
        Долю float64 либо NaN, если знаменатель 0.
    """
    if denominator == 0:
        return float("nan")
    return numerator / denominator


def _validate_definition(
    legs: Sequence[EpisodeLeg],
    state_spans: Sequence[StateSpan],
    episode_definition_id: str,
    k: float,
) -> None:
    """Проверить входы определения; production-политика — стоп (§8).

    Правила (каждое — ``ValueError`` с указанием первого нарушителя):
    непустой ``episode_definition_id``; ``k > 0``; для каждой ноги —
    направление ``UP``/``DOWN``, ``0 ≤ start_row ≤ ext_row``, совпадение
    ``episode_definition_id``, согласованность ``qualifying``-флага с
    ``amplitude_bps ≥ k``; ноги отсортированы по ``start_row`` и не
    перекрываются за пределами граничного ``ext_row``; спаны (если есть)
    тайлят весь ряд без дыр с корректными состояниями §3.11.

    Args:
        legs: matchable-ноги подтверждённых эпизодов.
        state_spans: state-ledger на весь ряд (может быть пустым).
        episode_definition_id: идентификатор определения.
        k: уровень квалификации ``amplitude ≥ k``.

    Raises:
        ValueError: при нарушении любого правила.
    """
    if not episode_definition_id:
        raise ValueError("episode_definition_id не должен быть пустым")
    if not k > 0.0:
        raise ValueError(f"k должно быть > 0: k={k}")
    for i, leg in enumerate(legs):
        if leg.direction not in (DIR_UP, DIR_DOWN):
            raise ValueError(
                f"legs[{i}].direction={leg.direction!r} "
                f"∉ ('{DIR_UP}', '{DIR_DOWN}')"
            )
        if not 0 <= leg.start_row <= leg.ext_row:
            raise ValueError(
                f"legs[{i}]: требуется 0 ≤ start_row ≤ ext_row, получено "
                f"({leg.start_row}, {leg.ext_row})"
            )
        if leg.episode_definition_id != episode_definition_id:
            raise ValueError(
                f"legs[{i}].episode_definition_id={leg.episode_definition_id!r} "
                f"≠ {episode_definition_id!r} — смешение определений (§3.12(4))"
            )
        if leg.qualifying != (leg.amplitude_bps >= k):
            raise ValueError(
                f"legs[{i}]: qualifying={leg.qualifying} несогласован с "
                f"amplitude_bps={leg.amplitude_bps!r} и k={k!r} — ноги "
                "построены при другом k"
            )
    for i in range(1, len(legs)):
        prev_leg, cur_leg = legs[i - 1], legs[i]
        if cur_leg.start_row < prev_leg.start_row:
            raise ValueError(
                f"legs не отсортированы по start_row: legs[{i}].start_row="
                f"{cur_leg.start_row} < legs[{i - 1}].start_row={prev_leg.start_row}"
            )
        if cur_leg.start_row < prev_leg.ext_row:
            raise ValueError(
                f"legs[{i}] перекрывает legs[{i - 1}] за пределами граничного "
                f"ext_row: start_row={cur_leg.start_row} < ext_row={prev_leg.ext_row}"
            )
    if state_spans:
        if state_spans[0].start_row != 0:
            raise ValueError(
                f"state_spans[0].start_row={state_spans[0].start_row} ≠ 0 — "
                "спаны покрывают ряд с бара 0"
            )
        for i, span in enumerate(state_spans):
            if span.end_row <= span.start_row:
                raise ValueError(
                    f"state_spans[{i}] пуст или инвертирован: "
                    f"[{span.start_row}, {span.end_row})"
                )
            if span.state not in _KNOWN_SPAN_STATES:
                raise ValueError(
                    f"state_spans[{i}].state={span.state!r} — неизвестное "
                    "состояние FSM §3.11"
                )
        for i in range(1, len(state_spans)):
            if state_spans[i].start_row != state_spans[i - 1].end_row:
                raise ValueError(
                    f"state_spans не тайлятся без дыр: spans[{i - 1}].end_row="
                    f"{state_spans[i - 1].end_row} ≠ spans[{i}].start_row="
                    f"{state_spans[i].start_row}"
                )


def _validate_group(group: TouchGroupLike, n_bars: int | None) -> None:
    """Проверить группу касаний; production-политика — стоп (§8).

    Правила (каждое — ``ValueError``): непустой строковый ``group_id``;
    ``direction ∈ {"up", "dn"}`` (теги §3.5); целочисленный
    ``touch_row ≥ 0`` и (при непустых спанах) внутри покрытия ряда.

    Args:
        group: группа касаний.
        n_bars: длина ряда по спанам (``None`` — спанов нет, проверка
            покрытия пропускается).

    Raises:
        ValueError: при нарушении любого правила.
    """
    if not isinstance(group.group_id, str) or not group.group_id:
        raise ValueError(
            f"group_id должен быть непустой строкой, получен {group.group_id!r}"
        )
    if group.direction not in _DIR_TAG_TO_LEG:
        raise ValueError(
            f"group.direction={group.direction!r} ∉ "
            f"{sorted(_DIR_TAG_TO_LEG)} (теги направлений §3.5)"
        )
    if not isinstance(group.touch_row, int) or isinstance(group.touch_row, bool):
        raise ValueError(
            f"group.touch_row должен быть int, получен "
            f"{type(group.touch_row).__name__}"
        )
    if group.touch_row < 0:
        raise ValueError(f"group.touch_row ≥ 0 нарушено: {group.touch_row}")
    if n_bars is not None and group.touch_row >= n_bars:
        raise ValueError(
            f"touch_row={group.touch_row} за пределами покрытия state_spans "
            f"[0, {n_bars}) — касание вне ряда"
        )


def _legs_containing(
    touch_row: int,
    legs: Sequence[EpisodeLeg],
    leg_starts: Sequence[int],
) -> list[int]:
    """Индексы всех ног, содержащих ``touch_row`` (по возрастанию индекса).

    Бисекция по ``start_row`` даёт последнюю ногу со ``start ≤ touch_row``;
    walk-back собирает предыдущие ноги, чей ``ext_row == touch_row`` (общая
    граница; вырожденный случай нулевой ноги даёт три содержащие ноги).

    Args:
        touch_row: бар касания.
        legs: matchable-ноги (отсортированы по ``start_row``).
        leg_starts: кэш ``[leg.start_row ...]`` для бисекции.

    Returns:
        Индексы содержащих ног: от старой к новой (последний элемент —
        «новая нога» границы).
    """
    j = bisect_right(leg_starts, touch_row) - 1
    if j < 0 or not (legs[j].start_row <= touch_row <= legs[j].ext_row):
        return []
    out = [j]
    i = j - 1
    while i >= 0 and legs[i].ext_row == touch_row:
        out.append(i)
        i -= 1
    out.reverse()
    return out


def _span_at(
    touch_row: int,
    state_spans: Sequence[StateSpan],
    span_starts: Sequence[int],
) -> StateSpan | None:
    """Спан, содержащий ``touch_row`` (полуинтервалы ``[start, end)``).

    Args:
        touch_row: бар касания.
        state_spans: state-ledger без дыр (тилинг проверен валидацией).
        span_starts: кэш ``[span.start_row ...]`` для бисекции.

    Returns:
        Спан-состояние бара либо ``None`` при пустом ledger.
    """
    i = bisect_right(span_starts, touch_row) - 1
    return state_spans[i] if i >= 0 else None


def _match_one(
    group: TouchGroupLike,
    legs: Sequence[EpisodeLeg],
    leg_starts: Sequence[int],
    state_spans: Sequence[StateSpan],
    span_starts: Sequence[int],
    episode_definition_id: str,
) -> MatchResult:
    """Классифицировать одно касание по приоритету §3.12(3).

    Шаги (порядок = приоритет): (1) ``unresolved_episode`` — подтверждённая
    direction-matched нога с ``order_unresolved=True``; (2)
    ``init_or_censored`` — спан init/init_unresolved/censored; (3)
    ``direction_mismatch`` — содержащая нога есть, direction-matched нет;
    (4) ``matched_qualifying``/``matched_nonqualifying`` — по флагу ноги;
    (5) ``unmatched`` — residual (вырожденные входы; tracking-хвост
    последнего эпизода).

    Args:
        group: группа касаний (валидирована).
        legs: matchable-ноги (валидированы).
        leg_starts: кэш стартов ног.
        state_spans: state-ledger (валидирован).
        span_starts: кэш стартов спанов.
        episode_definition_id: идентификатор определения.

    Returns:
        :class:`MatchResult` с ровно одним из шести состояний.
    """
    touch_row = group.touch_row
    want_dir = _DIR_TAG_TO_LEG[group.direction]
    containing = _legs_containing(touch_row, legs, leg_starts)
    cand = [i for i in containing if legs[i].direction == want_dir]

    if cand:
        newest = cand[-1]  # «новая нога» границы (§3.12(2))
        if legs[newest].order_unresolved:
            return MatchResult(
                group.group_id, UNRESOLVED_EPISODE, None, episode_definition_id, None
            )
        span = _span_at(touch_row, state_spans, span_starts)
        if span is not None and span.state in _INIT_CENSORED_SPANS:
            return MatchResult(
                group.group_id, INIT_OR_CENSORED, None, episode_definition_id, None
            )
        leg = legs[newest]
        state = MATCHED_QUALIFYING if leg.qualifying else MATCHED_NONQUALIFYING
        return MatchResult(
            group.group_id, state, leg.episode_index, episode_definition_id, newest
        )

    span = _span_at(touch_row, state_spans, span_starts)
    if span is not None and span.state in _INIT_CENSORED_SPANS:
        return MatchResult(
            group.group_id, INIT_OR_CENSORED, None, episode_definition_id, None
        )
    if containing:
        return MatchResult(
            group.group_id, DIRECTION_MISMATCH, None, episode_definition_id, None
        )
    return MatchResult(group.group_id, UNMATCHED, None, episode_definition_id, None)
