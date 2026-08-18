# src/zetaflowlab/supply/first_passage.py
"""Preflight-контракт WП-1 (атлас v4.2 «Supply & Paths») и ядро first-passage.

Задача 0 — исполняемый preflight-контракт:

* ``CONTROL`` — контрольные числа WП-0 (семантический аудит корпуса c1_v4,
  ``analysis/v4_wp0_audit.py``, спека v4.2 §3.2): граница OOS, число якорей,
  валидность окон 10 080, sha256 канонического bars-файла и число позитивных
  M1-пар регрессии A3;
* :func:`load_anchor_universe` — канонический keys-кадр корпуса
  (``row_id=real/group=keys``): позиции якорей ``rows``, рабочие окна
  ``k_tot_v42 = min(10_080, window_len)`` и корпусный ``window_len``;
  рассинхрон keys↔bars или расхождение с CONTROL — ``ValueError`` «ряд
  пересобран — стоп до разбора» (§4 манифеста корпуса);
* :func:`bars_sha256` — потоковый sha256 bars-файла (chunk 8 MB);
* :func:`code_hash_of_paths` — provenance-хэш файлового множества кода
  (один алгоритм для хост-обёртки и контейнера, задача 3).

Задача 1 — numba-ядро прямого first-passage прохода §3.4 (контракт §8):
:func:`run_first_passage` — один проход на якорь по окну ``k_tot ≤ H_MAX_V42``
на сетке уникальных уровней :data:`GRID_LEVELS`; порог — только
зарегистрированная bps-форма ``(x − entry)/entry·10⁴ ≥ lvl`` (e4, побитовая
совместимость с корпусом — WП-0 A3); входы проверяет :func:`validate_inputs`
(production-политика невалидных OHLC — стоп до numba).

Задача 3 (Step 7) — гейт потребления артефакта :func:`read_latest_fp`:
``LATEST.json`` → immutable-пара ``fp_{run_id}`` того же run_id → статус
``PASS`` в манифесте; WП-2+ читают материализованный артефакт только через
него (запрет повторного расчёта first-passage).
"""
from __future__ import annotations

import glob
import hashlib
import json
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

import numpy as np
import numpy.typing as npt
import polars as pl
from loguru import logger
from numba import njit, prange

#: Рабочее окно v4.2 (7 дней × 1440 минут): ``k_tot = min(10_080, window_len)``.
K_TOT_V42: int = 10_080

#: Размер чанка потокового sha256 (8 MB).
_SHA_CHUNK_BYTES: int = 8 * 1024 * 1024

#: Сообщение-стоп при пересборке ряда (§4 манифеста корпуса c1_v4).
_REBUILD_STOP_MSG: str = "ряд пересобран — стоп до разбора"


@dataclass(frozen=True)
class ControlNumbers:
    """Контрольные числа WП-0 — канон для любого прогона WП-1.

    Attributes:
        oos_cut: позиция первого OOS-бара (``ts >= reserved_oos_start``);
            train∪val — бары ``0..oos_cut-1``.
        n_anchors: число якорей keys-кадра (бары ``0..n_anchors-1`` без
            пропусков, ``n_anchors = oos_cut - 15``).
        n_valid_10080: число якорей с ``k_tot >= 10_080`` (A4 WП-0).
        bars_sha256: sha256 файла ``data/parquet/bars_1m_enriched.parquet``
            (= ``run_manifest.data_hash`` корпуса c1_v4).
        oos_start: ISO-момент первого OOS-бара (``reserved_oos_start``).
        m1_zone_pairs_wp0: позитивных M1-пар регрессии A3 WП-0 (16 уровней
            × 2 направления × 3 партиции; сверка в задаче 1/3).
    """

    oos_cut: int
    n_anchors: int
    n_valid_10080: int
    bars_sha256: str
    oos_start: str
    m1_zone_pairs_wp0: int


#: Контрольные числа WП-0 (верифицированы аудитом 2026-08-15, seed=42).
CONTROL: ControlNumbers = ControlNumbers(
    oos_cut=1_507_726,
    n_anchors=1_507_711,
    n_valid_10080=1_497_646,
    bars_sha256="3f24c40e33d2305d3a1691d291709557d7614f0a89bfdf4fab06b0cc394a0be7",
    oos_start="2025-08-04T00:02:00Z",
    m1_zone_pairs_wp0=1_870_709,
)


def _resolve_glob(paths: str | Path | list[str | Path]) -> list[str]:
    """Раскрыть glob-путь в отсортированный список файлов (или взять список).

    ``Path`` со звёздочкой сам не раскрывается — приводим к ``str`` и
    используем :func:`glob.glob`; порядок файлов детерминированный (sorted).
    ``list``-вход — готовый список файлов: элементы не прогоняются через
    glob (берутся как есть, ``str``-нормализация + sorted).
    """
    if isinstance(paths, (str, Path)):
        return sorted(glob.glob(str(paths)))
    return sorted(str(p) for p in paths)


def bars_sha256(path: str | Path, chunk_bytes: int = _SHA_CHUNK_BYTES) -> str:
    """SHA-256 файла баров, потоковое чтение чанками (8 MB по умолчанию).

    Args:
        path: путь к parquet-файлу баров.
        chunk_bytes: размер чанка чтения.

    Returns:
        hex-строка sha256.
    """
    digest = hashlib.sha256()
    with Path(path).open("rb") as fh:
        while chunk := fh.read(chunk_bytes):
            digest.update(chunk)
    return digest.hexdigest()


def code_hash_of_paths(
    root: str | Path, extra_patterns: tuple[str, ...] = ()
) -> str:
    """Provenance-хэш файлового множества кода.

    Множество: ``src/zetaflowlab/supply/**/*.py`` (рекурсивно) плюс
    ``analysis/v42_wp1_first_passage_run.py`` (дефолт WП-1) плюс точные
    posix-пути ``extra_patterns`` от ``root`` (WП-2 передаёт
    ``("analysis/v42_wp2_run.py", "analysis/v42_wp2_report.py")``).
    Каждый файл: sha256 его байтов; итог — sha256 конкатенации строк
    ``f"{relpath}:{file_sha256}\\n"`` в порядке sorted posix-relpath —
    алгоритм побайтово неизменен, дефолтное множество = множеству WП-1.

    Соглашение о несуществующих файлах: отдельные отсутствующие файлы
    множества НЕ входят в него и не являются ошибкой (run-скрипт появляется
    только в задаче 3); пустое множество даёт sha256 пустой конкатенации.
    Сам ``root`` обязан существовать и быть каталогом.

    Args:
        root: корень кодовой базы (репозиторий lab).
        extra_patterns: точные posix-relpath дополнительных файлов кода
            относительно ``root`` (в хэш входят существующие).

    Returns:
        hex-строка sha256.

    Raises:
        ValueError: если ``root`` не существует или не каталог.
    """
    root_path = Path(root)
    if not root_path.is_dir():
        raise ValueError(f"корень кодовой базы не найден: {root_path}")
    files = {p for p in root_path.glob("src/zetaflowlab/supply/**/*.py") if p.is_file()}
    run_script = root_path / "analysis" / "v42_wp1_first_passage_run.py"
    if run_script.is_file():
        files.add(run_script)
    for pattern in extra_patterns:
        extra = root_path / Path(pattern)
        if extra.is_file():
            files.add(extra)
    digest = hashlib.sha256()
    for path in sorted(files, key=lambda p: p.relative_to(root_path).as_posix()):
        rel = path.relative_to(root_path).as_posix()
        file_digest = hashlib.sha256(path.read_bytes()).hexdigest()
        digest.update(f"{rel}:{file_digest}\n".encode())
    return digest.hexdigest()


def _load_json_object(path: Path) -> dict[str, Any]:
    """Прочитать JSON-объект; контекст пути — в сообщении ошибки.

    Args:
        path: файл JSON.

    Returns:
        Словарь верхнего уровня.

    Raises:
        ValueError: невалидный JSON или верхний уровень не объект.
    """
    try:
        payload: Any = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"невалидный JSON: {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise ValueError(f"JSON верхнего уровня не объект: {path}")
    return payload


def read_latest_fp(fp_dir: str | Path) -> tuple[Path, dict[str, Any]]:
    """Гейт потребления fp-артефакта (задача 3, Step 7): LATEST → пара → PASS.

    Единственный разрешённый способ потребления материализованного
    first-passage артефакта в WП-2+ (запрет повторного расчёта): читает
    ``LATEST.json``, проверяет существование immutable-пары
    ``fp_{run_id}.parquet`` + ``fp_{run_id}.manifest.json`` того же ``run_id``
    и статус ``"PASS"`` в манифесте.

    Args:
        fp_dir: каталог артефакта
            (``data/corpus/analysis_v4/first_passage``).

    Returns:
        ``(parquet_path, manifest)`` — путь к parquet-файлу артефакта и
        словарь манифеста.

    Raises:
        FileNotFoundError: ``LATEST.json`` отсутствует или immutable-пара
            run_id неполна (в сообщении — недостающие файлы).
        ValueError: ``LATEST.json``/манифест — невалидный JSON; ``run_id``
            отсутствует/пуст/содержит path-разделители (инъекция пути).
        RuntimeError: манифест чужого run_id или статус не ``PASS`` —
            целостность/валидация нарушены, стоп до разбора.
    """
    latest_path = Path(fp_dir) / "LATEST.json"
    if not latest_path.is_file():
        raise FileNotFoundError(
            f"LATEST.json не найден: {latest_path} — валидный fp-артефакт "
            "не опубликован; повторный расчёт запрещён (гейт потребления)"
        )
    latest = _load_json_object(latest_path)
    run_id = latest.get("run_id")
    if not isinstance(run_id, str) or not run_id:
        raise ValueError(f"LATEST.json без непустого run_id: {latest_path}")
    if "/" in run_id or "\\" in run_id or run_id in {".", ".."} or "\x00" in run_id:
        raise ValueError(f"run_id из LATEST.json не допущен в пути: {run_id!r}")

    fp_path = Path(fp_dir) / f"fp_{run_id}.parquet"
    mf_path = Path(fp_dir) / f"fp_{run_id}.manifest.json"
    missing = [p.name for p in (fp_path, mf_path) if not p.is_file()]
    if missing:
        raise FileNotFoundError(
            f"run_id={run_id} из LATEST.json не имеет полной immutable-пары "
            f"в {Path(fp_dir)}: отсутствуют {missing}"
        )
    manifest = _load_json_object(mf_path)
    if manifest.get("run_id") != run_id:
        raise RuntimeError(
            f"манифест чужого run_id: manifest.run_id={manifest.get('run_id')!r} "
            f"!= LATEST.run_id={run_id!r} — целостность каталога нарушена, "
            "стоп до разбора"
        )
    if manifest.get("status") != "PASS":
        raise RuntimeError(
            f"fp-артефакт run_id={run_id} не валидирован: status="
            f"{manifest.get('status')!r} != 'PASS' — потребление запрещено, "
            "стоп до разбора"
        )
    logger.info("гейт потребления fp: run_id={}, артефакт {}", run_id, fp_path.name)
    return fp_path, manifest


def load_anchor_universe(
    bars_path: str | Path,
    corpus_keys_path: str | Path | list[str | Path],
) -> tuple[npt.NDArray[np.int64], npt.NDArray[np.int64], npt.NDArray[np.int64]]:
    """Каноническая вселенная якорей WП-1 из keys-кадра корпуса c1_v4.

    Читает keys-партиции ``row_id=real/group=keys/year_month=*/part-0.parquet``
    (glob или готовый список файлов; раскрытие через ``sorted(glob.glob)``),
    сортирует по ``bar_id`` и проверяет согласованность с рядом баров:
    ``ts_keys == ts_bars[rows]`` (timestamp в ns int64 с обеих сторон,
    vectorized).

    Args:
        bars_path: parquet-файл канонического ряда баров (тот, чей sha256
            в ``CONTROL.bars_sha256``); используется только колонка
            ``timestamp``, сортировка по timestamp (bar_id корпуса —
            позиционный индекс этого ряда).
        corpus_keys_path: glob-путь keys-партиций (``str``/``Path`` со
            звёздочками) или список файлов.

    Returns:
        ``(rows, k_tot_v42, corpus_window_len)`` — int64-массивы:
        позиции якорей в отсортированном ряду баров, рабочие окна
        ``min(10_080, window_len)`` и корпусный ``window_len``
        (``min(86_400, oos_cut - 1 - bar_id)``).

    Raises:
        ValueError: если keys-партиции не найдены; если число якорей ≠
            ``CONTROL.n_anchors`` или timestamps keys≠bars («ряд пересобран —
            стоп до разбора», §4 манифеста).
    """
    files = _resolve_glob(corpus_keys_path)
    if not files:
        raise ValueError(f"keys-партиции корпуса не найдены: {corpus_keys_path}")
    keys = (
        pl.scan_parquet(files)
        .select("bar_id", "timestamp", "window_len")
        .sort("bar_id")
        .collect()
    )
    rows: npt.NDArray[np.int64] = keys["bar_id"].to_numpy().astype(np.int64)
    ts_keys: npt.NDArray[np.int64] = (
        keys["timestamp"].dt.epoch("ns").to_numpy().astype(np.int64)
    )
    window_len: npt.NDArray[np.int64] = keys["window_len"].to_numpy().astype(np.int64)

    bars_ts: npt.NDArray[np.int64] = (
        pl.read_parquet(bars_path, columns=["timestamp"])
        .sort("timestamp")["timestamp"]
        .dt.epoch("ns")
        .to_numpy()
        .astype(np.int64)
    )

    if rows.shape[0] != CONTROL.n_anchors:
        raise ValueError(
            f"якорей {rows.shape[0]} != CONTROL.n_anchors={CONTROL.n_anchors}; "
            f"{_REBUILD_STOP_MSG}"
        )
    ts_match: npt.NDArray[np.bool_] = ts_keys == bars_ts[rows]
    if not bool(ts_match.all()):
        n_mismatch = int(np.logical_not(ts_match).sum())
        raise ValueError(
            f"keys↔bars рассинхрон: {n_mismatch} из {rows.shape[0]} timestamps "
            f"не совпали; {_REBUILD_STOP_MSG}"
        )

    k_tot_v42: npt.NDArray[np.int64] = np.minimum(K_TOT_V42, window_len)
    logger.info(
        "вселенная якорей WП-1: n={} ({} файлов keys), k_tot.min={}, "
        "window_len.max={}",
        rows.shape[0],
        len(files),
        int(k_tot_v42.min()),
        int(window_len.max()),
    )
    return rows, k_tot_v42, window_len


# --- Ядро first-passage §3.4 (задача 1; контракт §8) --------------------------

#: Максимальный горизонт сетки §3.1: h_max = 10 080 observed M1-баров
#: (верхняя граница ``k_tot`` в :func:`validate_inputs`; окно v4.2 — §3.2).
H_MAX_V42: int = 10_080

#: Знаменатель зарегистрированной bps-формы (e4): ``(x − e)/e·10⁴``.
BPS_DENOM: float = 10_000.0

#: Рабочая сетка уровней v4.2 (§3.1, tp ∪ adv): k ∈ {22, 50, 75, 240} bps и
#: a = k·{0.5, 1, 2} — 12 уникальных значений по возрастанию. Один проход по
#: этой сетке даёт все ``(k, a)``-касания обоих направлений.
GRID_LEVELS: tuple[float, ...] = (
    11.0, 22.0, 25.0, 37.5, 44.0, 50.0, 75.0, 100.0, 120.0, 150.0, 240.0, 480.0,
)


@dataclass(frozen=True)
class FpArrays:
    """Per-anchor выход прямого first-passage прохода §3.4 (контракт §8).

    Все массивы формы ``[n, n_lvl]`` (якорь × уровень), кроме ``window_len``
    (``[n]``). Соглашения: sentinel времени −1 (сравнение τ — только после
    маски ``τ > 0``); NaN path-поля = нет касания или пустой pre-touch;
    ``pre_touch_window_empty`` потребитель выводит как ``tau == 1``.

    Attributes:
        tau_up: первый tp-бар long (bps(high) ≥ lvl, включительно); −1.
        tau_dn: первый tp-бар short (bps(low) ≤ −lvl); −1.
        up_mae_thru: signed MAE ≤ 0 через конец tp-бара (bps running min low,
            клип 0 сверху); NaN без касания.
        up_pre_mfe: pre-touch MFE ≥ 0 (бары 1..τ−1, bps running max high,
            клип 0 снизу); NaN без касания или при пустом pre-touch.
        up_pre_mae: pre-touch MAE ≤ 0 (бары 1..τ−1, bps running min low);
            NaN — как ``up_pre_mfe``.
        up_touch_adv: adverse-экскурсия tp-бара long ≥ 0
            (``(e − low[τ])/e·10⁴``, клип 0); NaN без касания.
        up_t_pre: бар pre-touch adverse-экстремума long (running min low,
            при равенстве — более ранний); −1 без касания/при пустом pre-touch.
        dn_mae_thru: signed MAE ≤ 0 short через конец tp-бара
            (bps running max high со знаком минус); NaN без касания.
        dn_pre_mfe: pre-touch MFE ≥ 0 short (bps running min low со знаком
            минус); NaN без касания/при пустом pre-touch.
        dn_pre_mae: pre-touch MAE ≤ 0 short (bps running max high со знаком
            минус); NaN — как ``dn_pre_mfe``.
        dn_touch_adv: adverse-экскурсия tp-бара short ≥ 0
            (``(high[τ] − e)/e·10⁴``, клип 0); NaN без касания.
        dn_t_pre: бар pre-touch adverse-экстремума short — running **max**
            high (short adverse — вверх); −1 без касания/при пустом pre-touch.
        window_len: int64 ``[n]`` — pass-through входного ``k_tot``.
    """

    tau_up: npt.NDArray[np.int64]
    tau_dn: npt.NDArray[np.int64]
    up_mae_thru: npt.NDArray[np.float64]
    up_pre_mfe: npt.NDArray[np.float64]
    up_pre_mae: npt.NDArray[np.float64]
    up_touch_adv: npt.NDArray[np.float64]
    up_t_pre: npt.NDArray[np.int64]
    dn_mae_thru: npt.NDArray[np.float64]
    dn_pre_mfe: npt.NDArray[np.float64]
    dn_pre_mae: npt.NDArray[np.float64]
    dn_touch_adv: npt.NDArray[np.float64]
    dn_t_pre: npt.NDArray[np.int64]
    window_len: npt.NDArray[np.int64]


def validate_inputs(
    high: npt.NDArray[np.float64],
    low: npt.NDArray[np.float64],
    close: npt.NDArray[np.float64],
    rows: npt.NDArray[np.int64],
    k_tot: npt.NDArray[np.int64],
    levels: npt.NDArray[np.float64],
) -> None:
    """Проверить входы ядра first-passage; production-политика — стоп (§8).

    Правила (каждое — ``ValueError`` с указанием первого нарушителя):

    * длины ``high``/``low``/``close`` равны;
    * ``rows`` и ``k_tot`` равной длины;
    * ``0 ≤ row``;
    * ``0 < k_tot ≤ H_MAX_V42`` (10080);
    * ``row + k_tot < len(high)`` (окно целиком в ряду);
    * ``high``/``low``/``close`` конечны (NaN/inf запрещены) и
      ``entry = close[row] > 0``;
    * уровни положительные, уникальные, отсортированные по возрастанию.

    Args:
        high: максимум баров, float64.
        low: минимум баров, float64.
        close: закрытие баров, float64 (``close[row]`` — entry якоря).
        rows: позиции якорей, int64.
        k_tot: рабочие окна якорей, баров, int64.
        levels: сетка уровней, bps, float64.

    Raises:
        ValueError: при нарушении любого правила.
    """
    n_bars = high.shape[0]
    if not (low.shape[0] == n_bars and close.shape[0] == n_bars):
        raise ValueError(
            f"длины OHLC не равны: high={n_bars}, low={low.shape[0]}, "
            f"close={close.shape[0]}"
        )
    if rows.shape[0] != k_tot.shape[0]:
        raise ValueError(
            f"rows/k_tot разной длины: {rows.shape[0]} != {k_tot.shape[0]}"
        )
    if bool((rows < 0).any()):
        i = int(np.argmax(rows < 0))
        raise ValueError(f"0 ≤ row нарушено: rows[{i}] = {rows[i]}")
    if bool((k_tot <= 0).any()):
        i = int(np.argmax(k_tot <= 0))
        raise ValueError(f"0 < k_tot нарушено: k_tot[{i}] = {k_tot[i]}")
    if bool((k_tot > H_MAX_V42).any()):
        i = int(np.argmax(k_tot > H_MAX_V42))
        raise ValueError(
            f"k_tot[{i}] = {k_tot[i]} > H_MAX_V42 = {H_MAX_V42}"
        )
    over = rows + k_tot >= n_bars
    if bool(over.any()):
        i = int(np.argmax(over))
        raise ValueError(
            f"row + k_tot ≥ len(high): rows[{i}] + k_tot[{i}] = "
            f"{int(rows[i] + k_tot[i])} ≥ {n_bars}"
        )
    for name, arr in (("high", high), ("low", low), ("close", close)):
        finite = np.isfinite(arr)
        if not bool(finite.all()):
            i = int(np.argmax(~finite))
            raise ValueError(f"OHLC не конечны: {name}[{i}] = {arr[i]}")
    entries = close[rows]
    bad_entry = ~(entries > 0.0)
    if bool(bad_entry.any()):
        i = int(np.argmax(bad_entry))
        raise ValueError(f"entry > 0 нарушено: close[rows[{i}]] = {entries[i]}")
    if bool((levels <= 0.0).any()):
        i = int(np.argmax(levels <= 0.0))
        raise ValueError(f"уровни должны быть положительными: levels[{i}] = {levels[i]}")
    d = np.diff(levels)
    if bool((d < 0).any()):
        i = int(np.argmax(d < 0))
        raise ValueError(
            f"уровни не отсортированы по возрастанию: levels[{i}] = "
            f"{levels[i]} > levels[{i + 1}] = {levels[i + 1]}"
        )
    if bool((d == 0).any()):
        i = int(np.argmax(d == 0))
        raise ValueError(f"дубликат уровня: levels[{i}] = levels[{i + 1}] = {levels[i]}")


def fp_col_tag(field: str, direction: str, level: float) -> str:
    """Детерминированное имя колонки материализации fp-артефакта (задача 3).

    Формат ``{field}_{direction}_k{level}`` (``%g`` — уровень без хвостовых
    нулей): ``fp_col_tag("tau", "up", 22.0) → "tau_up_k22"``.

    Args:
        field: семантическое имя поля (``tau``, ``mae_thru``, ``pre_mfe``, …).
        direction: ``"up"`` | ``"dn"``.
        level: уровень сетки, bps.

    Returns:
        Имя колонки.
    """
    return f"{field}_{direction}_k{level:g}"


@njit(parallel=True, cache=True)
def _fp_kernel(
    high: np.ndarray,
    low: np.ndarray,
    close: np.ndarray,
    rows: np.ndarray,
    k_tot: np.ndarray,
    levels: np.ndarray,
) -> tuple[np.ndarray, ...]:
    """Прямой first-passage проход §3.4 (numba): tp-времена + path-поля.

    Для каждого якоря ``rows[t]`` (параллельно ``prange``) — скан
    ``k = 1..k_tot[t]`` от ``entry = close[row]`` с running ``rmax/rmin``
    (через текущий бар — обновляются до проверок касания) и отдельными
    pre-touch running ``pre_rmax/pre_rmin`` с их барами (обновляются ПОСЛЕ
    проверок касания: на касании бара k они покрывают бары 1..k−1, tp-бар
    исключён; при равенстве цен сохраняется более ранний бар). Порог — только
    зарегистрированная bps-форма (e4): ``(rmax − e)/e·10⁴ ≥ lvl`` и
    ``(e − rmin)/e·10⁴ ≥ lvl`` (побитово как ядро корпуса, WП-0 A3).
    MAE-поля signed ≤ 0, MFE ≥ 0 (клип 0); ранний выход — все уровни обоих
    направлений взяты.
    """
    n = rows.shape[0]
    n_lvl = levels.shape[0]
    tau_up = np.full((n, n_lvl), -1, dtype=np.int64)
    tau_dn = np.full((n, n_lvl), -1, dtype=np.int64)
    up_mae_thru = np.full((n, n_lvl), np.nan, dtype=np.float64)
    up_pre_mfe = np.full((n, n_lvl), np.nan, dtype=np.float64)
    up_pre_mae = np.full((n, n_lvl), np.nan, dtype=np.float64)
    up_touch_adv = np.full((n, n_lvl), np.nan, dtype=np.float64)
    up_t_pre = np.full((n, n_lvl), -1, dtype=np.int64)
    dn_mae_thru = np.full((n, n_lvl), np.nan, dtype=np.float64)
    dn_pre_mfe = np.full((n, n_lvl), np.nan, dtype=np.float64)
    dn_pre_mae = np.full((n, n_lvl), np.nan, dtype=np.float64)
    dn_touch_adv = np.full((n, n_lvl), np.nan, dtype=np.float64)
    dn_t_pre = np.full((n, n_lvl), -1, dtype=np.int64)
    for t in prange(n):  # type: ignore[no-untyped-call,attr-defined]
        g = rows[t]
        total = k_tot[t]
        entry = close[g]
        rmax = -np.inf
        rmin = np.inf
        pre_rmax = -np.inf
        pre_rmin = np.inf
        pre_rmax_bar = -1
        pre_rmin_bar = -1
        taken = 0
        for k in range(1, total + 1):
            idx = g + k
            h_k = high[idx]
            l_k = low[idx]
            if h_k > rmax:
                rmax = h_k
            if l_k < rmin:
                rmin = l_k
            fav = (rmax - entry) / entry * BPS_DENOM
            adv = (entry - rmin) / entry * BPS_DENOM
            for j in range(n_lvl):
                lvl = levels[j]
                if tau_up[t, j] < 0 and fav >= lvl:
                    tau_up[t, j] = k
                    mae = (rmin - entry) / entry * BPS_DENOM
                    if mae > 0.0:
                        mae = 0.0
                    up_mae_thru[t, j] = mae
                    tadv = (entry - l_k) / entry * BPS_DENOM
                    if tadv < 0.0:
                        tadv = 0.0
                    up_touch_adv[t, j] = tadv
                    if k > 1:
                        mfe = (pre_rmax - entry) / entry * BPS_DENOM
                        if mfe < 0.0:
                            mfe = 0.0
                        up_pre_mfe[t, j] = mfe
                        pmae = (pre_rmin - entry) / entry * BPS_DENOM
                        if pmae > 0.0:
                            pmae = 0.0
                        up_pre_mae[t, j] = pmae
                        up_t_pre[t, j] = pre_rmin_bar
                    taken += 1
                if tau_dn[t, j] < 0 and adv >= lvl:
                    tau_dn[t, j] = k
                    mae = (entry - rmax) / entry * BPS_DENOM
                    if mae > 0.0:
                        mae = 0.0
                    dn_mae_thru[t, j] = mae
                    tadv = (h_k - entry) / entry * BPS_DENOM
                    if tadv < 0.0:
                        tadv = 0.0
                    dn_touch_adv[t, j] = tadv
                    if k > 1:
                        mfe = (entry - pre_rmin) / entry * BPS_DENOM
                        if mfe < 0.0:
                            mfe = 0.0
                        dn_pre_mfe[t, j] = mfe
                        pmae = (entry - pre_rmax) / entry * BPS_DENOM
                        if pmae > 0.0:
                            pmae = 0.0
                        dn_pre_mae[t, j] = pmae
                        dn_t_pre[t, j] = pre_rmax_bar
                    taken += 1
            if h_k > pre_rmax:
                pre_rmax = h_k
                pre_rmax_bar = k
            if l_k < pre_rmin:
                pre_rmin = l_k
                pre_rmin_bar = k
            if taken >= 2 * n_lvl:
                break
    return (
        tau_up, tau_dn,
        up_mae_thru, up_pre_mfe, up_pre_mae, up_touch_adv, up_t_pre,
        dn_mae_thru, dn_pre_mfe, dn_pre_mae, dn_touch_adv, dn_t_pre,
    )


def run_first_passage(
    high: npt.ArrayLike,
    low: npt.ArrayLike,
    close: npt.ArrayLike,
    rows: npt.ArrayLike,
    k_tot: npt.ArrayLike,
    levels: Sequence[float] | npt.ArrayLike = GRID_LEVELS,
) -> FpArrays:
    """Прямой first-passage проход §3.4 на сетке уровней (контракт §8).

    Один проход на якорь по окну ``k_tot[t] ≤ H_MAX_V42``; исходы для
    ``h < h_max`` — срезы потребителя, отдельные прогоны запрещены. Порог —
    только зарегистрированная bps-форма (e4); ``entry = close[row]``.
    Входы проверяются :func:`validate_inputs` ДО numba (production-политика
    невалидных OHLC — стоп). Детерминизм: ``prange`` по якорям пишет
    непересекающиеся строки, float64, фиксированный порядок уровней.

    Args:
        high: максимум баров (float64-совместимый массив).
        low: минимум баров.
        close: закрытие баров (``close[row]`` — entry якоря).
        rows: позиции якорей.
        k_tot: рабочие окна якорей, баров (``0 < k_tot ≤ H_MAX_V42``).
        levels: сетка уровней, bps (положительные, уникальные, ↑);
            по умолчанию :data:`GRID_LEVELS`.

    Returns:
        :class:`FpArrays` — per-anchor массивы ``[n, n_lvl]`` + ``window_len``.

    Raises:
        ValueError: нарушения контракта входов (см. :func:`validate_inputs`).
    """
    high64 = np.asarray(high, dtype=np.float64)
    low64 = np.asarray(low, dtype=np.float64)
    close64 = np.asarray(close, dtype=np.float64)
    rows64 = np.asarray(rows, dtype=np.int64)
    k64 = np.asarray(k_tot, dtype=np.int64)
    levels64 = np.asarray(levels, dtype=np.float64)
    validate_inputs(high64, low64, close64, rows64, k64, levels64)
    res: Any = _fp_kernel(high64, low64, close64, rows64, k64, levels64)
    return FpArrays(
        tau_up=cast(npt.NDArray[np.int64], res[0]),
        tau_dn=cast(npt.NDArray[np.int64], res[1]),
        up_mae_thru=cast(npt.NDArray[np.float64], res[2]),
        up_pre_mfe=cast(npt.NDArray[np.float64], res[3]),
        up_pre_mae=cast(npt.NDArray[np.float64], res[4]),
        up_touch_adv=cast(npt.NDArray[np.float64], res[5]),
        up_t_pre=cast(npt.NDArray[np.int64], res[6]),
        dn_mae_thru=cast(npt.NDArray[np.float64], res[7]),
        dn_pre_mfe=cast(npt.NDArray[np.float64], res[8]),
        dn_pre_mae=cast(npt.NDArray[np.float64], res[9]),
        dn_touch_adv=cast(npt.NDArray[np.float64], res[10]),
        dn_t_pre=cast(npt.NDArray[np.int64], res[11]),
        window_len=k64.astype(np.int64, copy=True),
    )
