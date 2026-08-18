"""logger — логгер с уровнями и log_middleware (spec.md §7)."""

from __future__ import annotations

import time
from typing import Callable

from .ctx import Ctx, Response
from .middleware import Middleware

_LEVEL_VALUES: dict[str, int] = {
    "DEBUG": 10,
    "INFO": 20,
    "WARN": 30,
    "ERROR": 40,
}


class Logger:
    """Простой логгер с порогом по уровням."""

    def __init__(self) -> None:
        self._threshold: int = _LEVEL_VALUES["INFO"]
        self._records: list[dict] = []

    def configure(self, level: str) -> None:
        """Установить порог логирования."""
        self._threshold = _LEVEL_VALUES[level.upper()]

    def _emit(self, level: str, msg: str, **fields: object) -> None:
        if _LEVEL_VALUES[level] < self._threshold:
            return
        entry: dict = {"level": level, "msg": msg}
        entry.update(fields)
        self._records.append(entry)

    def debug(self, msg: str, **fields: object) -> None:
        self._emit("DEBUG", msg, **fields)

    def info(self, msg: str, **fields: object) -> None:
        self._emit("INFO", msg, **fields)

    def warn(self, msg: str, **fields: object) -> None:
        self._emit("WARN", msg, **fields)

    def error(self, msg: str, **fields: object) -> None:
        self._emit("ERROR", msg, **fields)

    def records(self) -> list[dict]:
        """Вернуть копию списка записей."""
        return list(self._records)


def log_middleware(logger: Logger) -> Middleware:
    """Middleware, логирующий каждый запрос после выполнения next()."""

    def mw(ctx: Ctx, next_fn: Callable[[], Response]) -> Response:
        start = time.perf_counter()
        try:
            resp = next_fn()
            status = resp.status
        except Exception as exc:
            status = getattr(exc, "status", 500)
            duration_ms = int((time.perf_counter() - start) * 1000)
            logger.info(
                f"{ctx.request.method} {ctx.request.path}",
                status=status,
                duration_ms=duration_ms,
            )
            raise
        duration_ms = int((time.perf_counter() - start) * 1000)
        logger.info(
            f"{ctx.request.method} {ctx.request.path}",
            status=status,
            duration_ms=duration_ms,
        )
        return resp

    return mw


default_logger = Logger()
