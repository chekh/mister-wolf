"""Логгер с уровнями и log-middleware (спека LONG-002, раздел 7)."""

import time
from typing import Any, Callable

from .ctx import Ctx, Response
from .middleware import Middleware

LEVELS = {"DEBUG": 10, "INFO": 20, "WARN": 30, "ERROR": 40}


class Logger:
    """Уровни DEBUG < INFO < WARN < ERROR; записи ниже порога отбрасываются.
    records() возвращает копию (снимок для тестов)."""

    def __init__(self) -> None:
        self._threshold: str = "INFO"
        self._records: list[dict[str, Any]] = []

    def configure(self, level: str) -> None:
        """Установить порог фильтрации (дефолт 'INFO')."""
        if level not in LEVELS:
            raise ValueError(f"unknown level {level!r}; expected one of {sorted(LEVELS)}")
        self._threshold = level

    def debug(self, msg: str, **fields: Any) -> None:
        self._log("DEBUG", msg, fields)

    def info(self, msg: str, **fields: Any) -> None:
        self._log("INFO", msg, fields)

    def warn(self, msg: str, **fields: Any) -> None:
        self._log("WARN", msg, fields)

    def error(self, msg: str, **fields: Any) -> None:
        self._log("ERROR", msg, fields)

    def records(self) -> list[dict[str, Any]]:
        """Снимок записей: копия списка и каждой записи."""
        return [dict(record) for record in self._records]

    def _log(self, level: str, msg: str, fields: dict[str, Any]) -> None:
        if LEVELS[level] >= LEVELS[self._threshold]:
            self._records.append({"level": level, "msg": msg, **fields})


def log_middleware(logger: Logger) -> Middleware:
    """Middleware, логирующее каждый запрос после выполнения next():
    level INFO, msg '{method} {path}', fields status и duration_ms (int >= 0).
    При исключении внутри запись всё равно ставится (status из HttpError
    или 500), затем исключение перебрасывается."""

    def middleware(ctx: Ctx, next: Callable[[], Response]) -> Response:
        started = time.perf_counter()

        def _record(status: int) -> None:
            duration_ms = int((time.perf_counter() - started) * 1000)
            logger.info(f"{ctx.request.method} {ctx.request.path}", status=status, duration_ms=duration_ms)

        try:
            response = next()
        except BaseException as exc:
            _record(getattr(exc, "status", 500))
            raise
        _record(response.status)
        return response

    return middleware


default_logger = Logger()
