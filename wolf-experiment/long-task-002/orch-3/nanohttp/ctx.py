"""Context: Request / Response / Ctx (спека §1)."""


class Request:
    """Request(method, path, query=None, headers=None, body=None).

    Атрибуты: method, path, query (дефолт {}), headers (дефолт {}), body (дефолт {}).
    """

    def __init__(self, method: str, path: str,
                 query: dict[str, str] | None = None,
                 headers: dict[str, str] | None = None,
                 body: dict | None = None) -> None:
        self.method = method
        self.path = path
        self.query = query if query is not None else {}
        self.headers = headers if headers is not None else {}
        self.body = body if body is not None else {}


class Response:
    """Response(status=200, body=None, headers=None).

    Атрибуты: status, body, headers (дефолт {}).
    """

    def __init__(self, status: int = 200, body=None,
                 headers: dict | None = None) -> None:
        self.status = status
        self.body = body
        self.headers = headers if headers is not None else {}


class Ctx:
    """Ctx(request) — обёртка.

    Атрибуты: .request, .response (Response() с дефолтами, создаётся
    автоматически при конструировании), .params: dict (заполняется роутером),
    .state: dict (общее хранилище middleware<->handler, пустое при старте).
    """

    def __init__(self, request: Request) -> None:
        self.request = request
        self.response = Response()
        self.params: dict = {}
        self.state: dict = {}
