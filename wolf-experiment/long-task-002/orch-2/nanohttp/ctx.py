"""Контекст запроса/ответа nanohttp (спецификация LONG-002, раздел 1)."""

from __future__ import annotations

from typing import Any


class Request:
    """HTTP-запрос: метод, путь, query, заголовки, тело."""

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
        self.query: dict[str, str] = query if query is not None else {}
        self.headers: dict[str, str] = headers if headers is not None else {}
        self.body: dict = body if body is not None else {}


class Response:
    """HTTP-ответ: статус, тело, заголовки."""

    def __init__(
        self,
        status: int = 200,
        body: Any = None,
        headers: dict | None = None,
    ) -> None:
        self.status = status
        self.body = body
        self.headers: dict = headers if headers is not None else {}


class Ctx:
    """Обёртка запроса: ответ создаётся автоматически, params заполняет
    роутер, state — общее хранилище middleware <-> handler."""

    def __init__(self, request: Request) -> None:
        self.request = request
        self.response = Response()
        self.params: dict = {}
        self.state: dict = {}
