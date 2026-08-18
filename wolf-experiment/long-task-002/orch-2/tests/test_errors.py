"""Тесты обработки ошибок (спецификация §6)."""

import unittest

from nanohttp import (
    Ctx,
    ErrorHandler,
    HttpError,
    NotFoundError,
    Request,
    Response,
    ValidationError,
)


class TestErrors(unittest.TestCase):
    def test_mro_exact_first(self):
        """Точный тип обработчика приоритетнее базового."""
        handler_calls = []

        def handle_value(ctx, exc):
            handler_calls.append("value")
            return Response(200, "value-handled")

        def handle_base(ctx, exc):
            handler_calls.append("base")
            return Response(200, "base-handled")

        eh = ErrorHandler()
        eh.on(Exception, handle_base)
        eh.on(ValueError, handle_value)

        ctx = Ctx(Request("GET", "/"))
        resp = eh.handle(ctx, ValueError("oops"))
        self.assertEqual(handler_calls, ["value"])
        self.assertEqual(resp.body, "value-handled")

    def test_base_class_fallback(self):
        """Нет точного обработчика → базовый по MRO."""
        handler_calls = []

        def handle_lookup(ctx, exc):
            handler_calls.append("lookup")
            return Response(200, "lookup-handled")

        eh = ErrorHandler()
        eh.on(LookupError, handle_lookup)

        ctx = Ctx(Request("GET", "/"))
        resp = eh.handle(ctx, KeyError("missing"))
        self.assertEqual(handler_calls, ["lookup"])

    def test_no_handler_500(self):
        """Нет обработчика, не HttpError → 500."""
        eh = ErrorHandler()
        ctx = Ctx(Request("GET", "/"))
        resp = eh.handle(ctx, RuntimeError("boom"))
        self.assertEqual(resp.status, 500)
        self.assertEqual(resp.body["error"], "internal")
        self.assertEqual(resp.body["message"], "boom")

    def test_validation_details_in_body(self):
        """ValidationError с .errors → в теле 'details'."""
        val_err = ValidationError([{"field": "x", "message": "missing field"}])
        eh = ErrorHandler()
        ctx = Ctx(Request("GET", "/"))
        resp = eh.handle(ctx, val_err)
        self.assertEqual(resp.status, 400)
        self.assertEqual(resp.body["error"], "validation")
        self.assertEqual(resp.body["details"], [{"field": "x", "message": "missing field"}])

    def test_http_error_attrs(self):
        err = NotFoundError()
        self.assertEqual(err.status, 404)
        self.assertEqual(err.code, "not_found")
        self.assertEqual(err.message, "Not Found")

    def test_on_registers(self):
        """on() регистрирует обработчик (вызов фиксируется)."""
        called = []

        def handler(ctx, exc):
            called.append(True)
            return Response(200)

        eh = ErrorHandler()
        eh.on(ValueError, handler)
        ctx = Ctx(Request("GET", "/"))
        eh.handle(ctx, ValueError("test"))
        self.assertTrue(called)


if __name__ == "__main__":
    unittest.main()
