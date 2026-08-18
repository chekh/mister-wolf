"""Контекст запроса/ответа nanohttp.

Запрос и ответ — простые контейнеры данных; ``Ctx`` — обёртка,
создаваемая приложением на каждый запрос и связывающая request,
response, параметры роутера и общее хранилище state.
"""


class Request:
    """HTTP-запрос (упрощённая модель).

    Attributes:
        method: HTTP-метод (строка, как передали).
        path: путь запроса.
        query: query-параметры, дефолт — свежий пустой dict.
        headers: заголовки, дефолт — свежий пустой dict.
        body: тело (обычно dict), дефолт — свежий пустой dict.
    """

    def __init__(self, method, path, query=None, headers=None, body=None):
        self.method = method
        self.path = path
        self.query = query if query is not None else {}
        self.headers = headers if headers is not None else {}
        self.body = body if body is not None else {}


class Response:
    """HTTP-ответ.

    Attributes:
        status: код статуса, дефолт 200.
        body: тело ответа (Any), дефолт None.
        headers: заголовки, дефолт — свежий пустой dict.
    """

    def __init__(self, status=200, body=None, headers=None):
        self.status = status
        self.body = body
        self.headers = headers if headers is not None else {}


class Ctx:
    """Контекст одного запроса.

    Attributes:
        request: исходный :class:`Request`.
        response: ответ, создаётся автоматически как ``Response()``
            с дефолтами при конструировании Ctx.
        params: параметры пути, заполняются роутером; пустой dict.
        state: общее хранилище middleware <-> handler; пустой dict.
    """

    def __init__(self, request):
        self.request = request
        self.response = Response()
        self.params = {}
        self.state = {}
