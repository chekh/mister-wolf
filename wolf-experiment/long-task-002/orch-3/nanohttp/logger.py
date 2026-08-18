"""Логгер + log_middleware (спека §7)."""

from __future__ import annotations

import time
from typing import Callable

from .ctx import Ctx, Response

_LEVELS: dict[str, int] = {
    "DEBUG": 0,
    "INFO": 1,
    "WARN": 2,
    "ERROR": 3,
}


class Logger:
    """Уровни DEBUG < INFO < WARN < ERROR; configure(level) (дефолт "INFO");
    .debug/.info/.warn/.error(msg, **fields); .records() -> копия списка."""

    def __init__(self) -> None:
        self._threshold: int = _LEVELS["INFO"]
        self._records: list[dict] = []

    def configure(self, level: str) -> None:
        self._threshold = _LEVELS[level]

    def _log(self, level: str, msg: str, **fields: object) -> None:
        if _LEVELS[level] < self._threshold:
            return
        entry: dict = {"level": level, "msg": msg}
        entry.update(fields)
        self._records.append(entry)

    def debug(self, msg: str, **fields: object) -> None:
        self._log("DEBUG", msg, **fields)

    def info(self, msg: str, **fields: object) -> None:
        self._log("INFO", msg, **fields)

    def warn(self, msg: str, **fields: object) -> None:
        self._log("WARN", msg, **fields)

    def error(self, msg: str, **fields: object) -> None:
        self._log("ERROR", msg, **fields)

    def records(self) -> list[dict]:
        return list(self._records)


default_logger = Logger()


def log_middleware(
    logger: Logger,
) -> Callable[[Ctx, Callable[[], Response]], Response]:
    """Middleware: после next() логирует INFO "{method} {path}" c fields
    status, duration_ms (int >= 0). Запись появляется ВСЕГДА (в т.ч. при
    исключении внутри next() — тогда статус 500, исключение пробрасывается).
    """

    def _mw(ctx: Ctx, next_: Callable[[], Response]) -> Response:
        start = time.perf_counter()
        exc: BaseException | None = None
        try:
            resp = next_()
            status = resp.status
        except BaseException as e:
            exc = e
            status = 500
        finally:
            duration_ms = int((time.perf_counter() - start) * 1000)
            logger.info(
                f"{ctx.request.method} {ctx.request.path}",
                status=status,
                duration_ms=duration_ms,
            )
        if exc is not None:
            raise exc
        return resp

    return _mw
