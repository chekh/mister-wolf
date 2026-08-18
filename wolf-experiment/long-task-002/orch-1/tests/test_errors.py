"""tests/test_errors — тесты модуля errors (spec.md §6)."""

import unittest

from nanohttp import Ctx, ErrorHandler, HttpError, Request, Response


class FakeVE(HttpError):
    """Подделка ValidationError для теста details."""

    def __init__(self) -> None:
        super().__init__(400, "validation", "ve")
        self.errors = [{"field": "name", "message": "missing field"}]


class TestErrors(unittest.TestCase):
    def test_http_error_attrs(self) -> None:
        """HttpError: status, code, message."""
        err = HttpError(403, "forbidden", "No access")
        self.assertEqual(err.status, 403)
        self.assertEqual(err.code, "forbidden")
        self.assertEqual(err.message, "No access")

    def test_on_registers(self) -> None:
        """on() регистрирует обработчик."""
        eh = ErrorHandler()
        handler_called = False

        def handler(ctx, exc):
            nonlocal handler_called
            handler_called = True
            return Response(418, body={"teapot": True})

        eh.on(ValueError, handler)
        req = Request("GET", "/")
        ctx = Ctx(req)
        resp = eh.handle(ctx, ValueError("test"))
        self.assertTrue(handler_called)
        self.assertEqual(resp.status, 418)

    def test_mro_exact_first(self) -> None:
        """Точный тип — приоритетнее базового."""
        eh = ErrorHandler()
        chosen: list[str] = []

        def base_handler(ctx, exc):
            chosen.append("base")
            return Response(500)

        def exact_handler(ctx, exc):
            chosen.append("exact")
            return Response(422)

        eh.on(Exception, base_handler)
        eh.on(ValueError, exact_handler)

        req = Request("GET", "/")
        ctx = Ctx(req)
        eh.handle(ctx, ValueError("test"))
        self.assertEqual(chosen, ["exact"])

    def test_base_class_fallback(self) -> None:
        """Нет обработчика точного типа → fallback по MRO."""
        eh = ErrorHandler()
        chosen: list[str] = []

        def base_handler(ctx, exc):
            chosen.append("base")
            return Response(500)

        eh.on(Exception, base_handler)

        req = Request("GET", "/")
        ctx = Ctx(req)
        eh.handle(ctx, ValueError("test"))
        self.assertEqual(chosen, ["base"])

    def test_no_handler_500(self) -> None:
        """Нет обработчика, не HttpError → fallback 500."""
        eh = ErrorHandler()
        req = Request("GET", "/")
        ctx = Ctx(req)
        resp = eh.handle(ctx, RuntimeError("boom"))
        self.assertEqual(resp.status, 500)
        self.assertEqual(resp.body["error"], "internal")
        self.assertEqual(resp.body["message"], "boom")

    def test_validation_details_in_body(self) -> None:
        """HttpError с атрибутом errors → body содержит details."""
        eh = ErrorHandler()
        req = Request("GET", "/")
        ctx = Ctx(req)
        exc = FakeVE()
        resp = eh.handle(ctx, exc)
        self.assertEqual(resp.status, 400)
        self.assertEqual(resp.body["details"], exc.errors)


if __name__ == "__main__":
    unittest.main()
