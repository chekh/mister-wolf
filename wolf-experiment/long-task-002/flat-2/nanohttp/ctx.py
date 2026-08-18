"""Контекст запроса/ответа nanohttp (спека LONG-002, раздел 1)."""

from typing import Any


class Request:
    """HTTP-запрос: метод, путь, query/headers/body (дефолты — пустые dict)."""

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
    """HTTP-ответ: статус, тело, заголовки (дефолты: 200 / None / {})."""

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
    """Обёртка запроса: response создаётся автоматически, params заполняет
    роутер, state — общее хранилище middleware <-> handler."""

    def __init__(self, request: Request) -> None:
        self.request = request
        self.response = Response()
        self.params: dict[str, str] = {}
        self.state: dict[str, Any] = {}
