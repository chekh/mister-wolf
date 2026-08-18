"""Логгер nanohttp и log-middleware.

Логгер хранит записи в памяти; ``records()`` возвращает снимок.
Уровни: ``DEBUG < INFO < WARN < ERROR``; записи ниже порога
отбрасываются (вызов метода не падает).
"""

import time

from .errors import HttpError

_LEVELS = {"DEBUG": 10, "INFO": 20, "WARN": 30, "ERROR": 40}


class Logger:
    """Логгер с уровнями и снимком записей для тестов."""

    def __init__(self, level="INFO"):
        self._level = str(level).upper()
        self._records = []

    def configure(self, level):
        """Установить глобальный порог (дефолт "INFO")."""
        self._level = str(level).upper()

    def debug(self, msg, **fields):
        self._log("DEBUG", msg, fields)

    def info(self, msg, **fields):
        self._log("INFO", msg, fields)

    def warn(self, msg, **fields):
        self._log("WARN", msg, fields)

    def error(self, msg, **fields):
        self._log("ERROR", msg, fields)

    def records(self):
        """Снимок записей (копия — мутация снятия не влияет)."""
        return [dict(record) for record in self._records]

    def _log(self, level, msg, fields):
        if _LEVELS[level] < _LEVELS[self._level]:
            return
        self._records.append({"level": level, "msg": msg, **fields})


def log_middleware(logger):
    """Middleware: логирует каждый запрос (INFO, "{method} {path}")
    с полями status и duration_ms (int >= 0) ПОСЛЕ выполнения next().

    Запись появляется и при исключении из next() (статус берётся из
    HttpError, иначе 500), после чего исключение пробрасывается.
    """

    def mw(ctx, next):
        start = time.perf_counter()
        try:
            response = next()
        except BaseException as exc:
            duration_ms = max(0, int((time.perf_counter() - start) * 1000))
            status = exc.status if isinstance(exc, HttpError) else 500
            logger.info(
                f"{ctx.request.method} {ctx.request.path}",
                status=status,
                duration_ms=duration_ms,
            )
            raise
        duration_ms = max(0, int((time.perf_counter() - start) * 1000))
        logger.info(
            f"{ctx.request.method} {ctx.request.path}",
            status=response.status,
            duration_ms=duration_ms,
        )
        return response

    return mw


default_logger = Logger()
