"""Логгер с уровнями и логирующее middleware (спека LONG-002, §7)."""
from __future__ import annotations

import time
from typing import Callable

from .ctx import Ctx, Response

_LEVELS = {"DEBUG": 10, "INFO": 20, "WARN": 30, "ERROR": 40}


def _level_value(level: str) -> int:
    name = level.upper()
    if name == "WARNING":  # терпим синоним
        name = "WARN"
    return _LEVELS.get(name, 0)


class Logger:
    """Минимальный логгер с уровнями DEBUG < INFO < WARN < ERROR.

    Записи ниже порога отбрасываются (вызов метода не падает);
    records() возвращает копию снимка записей.
    """

    def __init__(self, level: str = "INFO") -> None:
        self._threshold = _level_value(level)
        self._records: list[dict] = []

    def configure(self, level: str) -> None:
        """Установить порог (глобальный для инстанса)."""
        self._threshold = _level_value(level)

    def _log(self, level: str, msg: str, fields: dict) -> None:
        if _LEVELS[level] >= self._threshold:
            self._records.append({"level": level, "msg": msg, **fields})

    def debug(self, msg: str, **fields) -> None:
        self._log("DEBUG", msg, fields)

    def info(self, msg: str, **fields) -> None:
        self._log("INFO", msg, fields)

    def warn(self, msg: str, **fields) -> None:
        self._log("WARN", msg, fields)

    def error(self, msg: str, **fields) -> None:
        self._log("ERROR", msg, fields)

    def records(self) -> list[dict]:
        """Снимок записей (копия: мутация результата не влияет на лог)."""
        return [dict(record) for record in self._records]


default_logger = Logger()


def log_middleware(logger: Logger) -> Callable:
    """Логирующее middleware: INFO `"{method} {path}"` + status/duration_ms.

    Логирует и при исключении из next() (status из HttpError или 500),
    затем перебрасывает исключение наружу — запись появляется всегда.
    """

    def middleware(ctx: Ctx, next: Callable[[], Response]) -> Response:
        started = time.perf_counter()
        try:
            response = next()
        except BaseException as exc:
            _emit(logger, ctx, getattr(exc, "status", 500), started)
            raise
        _emit(logger, ctx, response.status, started)
        return response

    return middleware


def _emit(logger: Logger, ctx: Ctx, status: int, started: float) -> None:
    duration_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        f"{ctx.request.method} {ctx.request.path}",
        status=status,
        duration_ms=duration_ms,
    )
