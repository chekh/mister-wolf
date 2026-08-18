"""Тесты для модуля nanohttp.ctx (спека §1)."""

import unittest

from nanohttp import Ctx, Request, Response


class TestRequest(unittest.TestCase):
    """Проверки Request."""

    def test_request_defaults_empty_dicts(self) -> None:
        """Дефолты query/headers/body — каждый экземпляр получает СВОЙ пустой dict."""
        r1 = Request("GET", "/")
        r2 = Request("POST", "/api")

        # Каждый дефолт — независимый dict
        self.assertEqual(r1.query, {})
        self.assertEqual(r1.headers, {})
        self.assertEqual(r1.body, {})

        # Мутация одного не влияет на другой
        r1.query["a"] = "1"
        self.assertEqual(r2.query, {})
        r1.headers["x"] = "y"
        self.assertEqual(r2.headers, {})
        r1.body["k"] = "v"
        self.assertEqual(r2.body, {})

        # Переданные значения используются
        r3 = Request("GET", "/", query={"q": "1"}, headers={"h": "v"}, body={"d": 1})
        self.assertEqual(r3.query, {"q": "1"})
        self.assertEqual(r3.headers, {"h": "v"})
        self.assertEqual(r3.body, {"d": 1})


class TestResponse(unittest.TestCase):
    """Проверки Response."""

    def test_response_defaults(self) -> None:
        """Дефолты status=200, body=None, headers={} — каждый экземпляр независим."""
        resp1 = Response()
        self.assertEqual(resp1.status, 200)
        self.assertIsNone(resp1.body)
        self.assertEqual(resp1.headers, {})

        # Мутация headers одного не влияет на другой
        resp2 = Response()
        resp1.headers["x"] = "y"
        self.assertEqual(resp2.headers, {})

        # Переданные значения
        resp3 = Response(status=201, body={"ok": True}, headers={"Content-Type": "json"})
        self.assertEqual(resp3.status, 201)
        self.assertEqual(resp3.body, {"ok": True})
        self.assertEqual(resp3.headers, {"Content-Type": "json"})


class TestCtx(unittest.TestCase):
    """Проверки Ctx."""

    def test_ctx_creates_default_response(self) -> None:
        """Ctx автоматически создаёт Response() с дефолтами."""
        req = Request("GET", "/")
        ctx = Ctx(req)
        self.assertIs(ctx.request, req)
        self.assertIsInstance(ctx.response, Response)
        self.assertEqual(ctx.response.status, 200)
        self.assertIsNone(ctx.response.body)

    def test_state_and_params_independent(self) -> None:
        """state и params — независимые словари для каждого Ctx."""
        ctx1 = Ctx(Request("GET", "/a"))
        ctx2 = Ctx(Request("GET", "/b"))

        # Пустые при старте
        self.assertEqual(ctx1.state, {})
        self.assertEqual(ctx1.params, {})

        # Мутация одного Ctx не влияет на другой
        ctx1.state["user"] = "alice"
        ctx1.params["id"] = "42"
        self.assertEqual(ctx2.state, {})
        self.assertEqual(ctx2.params, {})

        # state и params одного Ctx — разные объекты
        self.assertIsNot(ctx1.state, ctx1.params)
