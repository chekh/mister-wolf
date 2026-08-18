"""Контекст запроса/ответа nanohttp (спека LONG-002, §1)."""
from __future__ import annotations

from typing import Any


class Request:
    """Упрощённая модель HTTP-запроса.

    Attributes:
        method: HTTP-метод (регистр не нормализуется — этим занимается роутер).
        path: путь без query-строки.
        query: параметры запроса (дефолт — свежий пустой словарь).
        headers: заголовки (дефолт — свежий пустой словарь).
        body: тело запроса (дефолт — свежий пустой словарь).
    """

    def __init__(
        self,
        method: str,
        path: str,
        query: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        body: dict | None = None,
    ) -> None:
        self.method = method
        self.path = path
        self.query: dict[str, str] = {} if query is None else query
        self.headers: dict[str, str] = {} if headers is None else headers
        self.body: dict = {} if body is None else body


class Response:
    """Ответ обработчика: статус, произвольное тело, заголовки."""

    def __init__(
        self, status: int = 200, body: Any = None, headers: dict | None = None
    ) -> None:
        self.status = status
        self.body = body
        self.headers: dict = {} if headers is None else headers


class Ctx:
    """Обёртка контекста одного запроса.

    Attributes:
        request: запрос.
        response: ответ (создаётся автоматически с дефолтами).
        params: параметры пути (заполняется роутером).
        state: общее хранилище middleware <-> handler (пустое при старте).
    """

    def __init__(self, request: Request) -> None:
        self.request = request
        self.response = Response()
        self.params: dict = {}
        self.state: dict = {}
