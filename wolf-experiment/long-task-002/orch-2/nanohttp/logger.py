"""Логирование nanohttp (спецификация LONG-002, раздел 7).

Простой logger с пороговыми уровнями и middleware для логирования
каждого HTTP-запроса.
"""

from __future__ import annotations

import time
from typing import Any

from .ctx import Ctx, Response
from .middleware import Middleware

# Уровни логирования (по возрастанию важности)
_LEVELS: dict[str, int] = {
    "DEBUG": 0,
    "INFO": 1,
    "WARN": 2,
    "ERROR": 3,
}


class Logger:
    """Простой logger с пороговыми уровнями.

    Записи ниже порога не попадают в records (но вызов метода не падает).
    Метод records() возвращает глубокую копию (список + каждый dict).

    Attributes:
        level: Имя текущего порогового уровня (по умолчанию "INFO").
    """

    def __init__(self, level: str = "INFO") -> None:
        self._threshold: int = _LEVELS[level]
        self._records: list[dict[str, Any]] = []

    def configure(self, level: str) -> None:
        """Установить пороговый уровень логирования.

        Args:
            level: Одно из "DEBUG", "INFO", "WARN", "ERROR".

        Raises:
            ValueError: Несуществующий уровень.
        """
        if level not in _LEVELS:
            raise ValueError(
                f"Unknown level '{level}'. Must be one of {list(_LEVELS)}"
            )
        self._threshold = _LEVELS[level]

    def debug(self, msg: str, **fields: Any) -> None:
        """Записать сообщение уровня DEBUG."""
        self._log("DEBUG", msg, fields)

    def info(self, msg: str, **fields: Any) -> None:
        """Записать сообщение уровня INFO."""
        self._log("INFO", msg, fields)

    def warn(self, msg: str, **fields: Any) -> None:
        """Записать сообщение уровня WARN."""
        self._log("WARN", msg, fields)

    def error(self, msg: str, **fields: Any) -> None:
        """Записать сообщение уровня ERROR."""
        self._log("ERROR", msg, fields)

    def records(self) -> list[dict[str, Any]]:
        """Вернуть глубокую копию накопленных записей.

        Мутация возвращённого списка/словарей не влияет на внутреннее
        состояние логгера.
        """
        return [dict(r) for r in self._records]

    # ------------------------------------------------------------------
    # Внутренние методы
    # ------------------------------------------------------------------

    def _log(self, level: str, msg: str, fields: dict[str, Any]) -> None:
        """Записать сообщение, если уровень выше порога."""
        if _LEVELS[level] < self._threshold:
            return
        entry: dict[str, Any] = {"level": level, "msg": msg}
        entry.update(fields)
        self._records.append(entry)


def log_middleware(logger: Logger) -> Middleware:
    """Создать middleware для логирования каждого HTTP-запроса.

    Логирует на уровне INFO с msg ``"{method} {path}"`` и полями
    ``status`` и ``duration_ms``. Исключения также логируются
    (status берётся из атрибута ``exc.status`` или fallback 500),
    после чего исключение перебрасывается дальше.

    Args:
        logger: Инстанс :class:`Logger` для записи.

    Returns:
        Middleware-функция.
    """
    def middleware(ctx: Ctx, next_fn: Any) -> Response:  # noqa: ANN001
        start: float = time.perf_counter()
        method: str = ctx.request.method
        path: str = ctx.request.path
        try:
            resp: Response = next_fn()
            duration_ms: int = max(0, int((time.perf_counter() - start) * 1000))
            logger.info(
                f"{method} {path}",
                status=resp.status,
                duration_ms=duration_ms,
            )
            return resp
        except BaseException as exc:
            duration_ms = max(0, int((time.perf_counter() - start) * 1000))
            status: int = getattr(exc, "status", 500)
            logger.info(
                f"{method} {path}",
                status=status,
                duration_ms=duration_ms,
            )
            raise

    return middleware


# Глобальный дефолтный инстанс логгера
default_logger = Logger()
