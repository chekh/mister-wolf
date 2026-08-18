"""ctx — контекст запроса/ответа (spec.md §1)."""

from typing import Any


class Request:
    """HTTP-запрос."""

    def __init__(
        self,
        method: str,
        path: str,
        query: dict | None = None,
        headers: dict | None = None,
        body: dict | None = None,
    ) -> None:
        self.method = method
        self.path = path
        self.query = query if query is not None else {}
        self.headers = headers if headers is not None else {}
        self.body = body if body is not None else {}


class Response:
    """HTTP-ответ."""

    def __init__(
        self,
        status: int = 200,
        body: Any = None,
        headers: dict | None = None,
    ) -> None:
        self.status = status
        self.body = body
        self.headers = headers if headers is not None else {}


class Ctx:
    """Контекст: обёртка над запросом, ответом и auxiliary-словарями."""

    def __init__(self, request: Request) -> None:
        self.request = request
        self.response = Response()
        self.params: dict[str, str] = {}
        self.state: dict = {}
