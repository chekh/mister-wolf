"""Тесты error handler (спека §6, прил. B: test_errors)."""
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


def _ctx():
    return Ctx(Request("GET", "/"))


class ErrorHandlerTests(unittest.TestCase):
    def test_mro_exact_first(self):
        handler = ErrorHandler()
        calls = []

        def specific(ctx, exc):
            calls.append("specific")
            return Response(404, "specific")

        def base(ctx, exc):
            calls.append("base")
            return Response(500, "base")

        handler.on(NotFoundError, specific)
        handler.on(HttpError, base)
        resp = handler.handle(_ctx(), NotFoundError("nope"))
        self.assertEqual(calls, ["specific"])
        self.assertEqual(resp.body, "specific")

    def test_base_class_fallback(self):
        handler = ErrorHandler()

        def base(ctx, exc):
            return Response(418, "base")

        handler.on(HttpError, base)
        resp = handler.handle(_ctx(), NotFoundError("nope"))
        self.assertEqual(resp.status, 418)
        self.assertEqual(resp.body, "base")

    def test_no_handler_500(self):
        handler = ErrorHandler()
        resp = handler.handle(_ctx(), ValueError("boom"))
        self.assertEqual(resp.status, 500)
        self.assertEqual(resp.body, {"error": "internal", "message": "boom"})

    def test_validation_details_in_body(self):
        handler = ErrorHandler()
        exc = ValidationError([{"field": "name", "message": "missing field"}])
        resp = handler.handle(_ctx(), exc)
        self.assertEqual(resp.status, 400)
        self.assertEqual(resp.body["error"], "validation")
        self.assertEqual(
            resp.body["details"],
            [{"field": "name", "message": "missing field"}],
        )

    def test_http_error_attrs(self):
        err = HttpError(418, "teapot", "short and stout")
        self.assertEqual(err.status, 418)
        self.assertEqual(err.code, "teapot")
        self.assertEqual(err.message, "short and stout")
        not_found = NotFoundError("nothing here")
        self.assertEqual(not_found.status, 404)
        self.assertEqual(not_found.code, "not_found")
        self.assertEqual(not_found.message, "nothing here")

    def test_on_registers(self):
        handler = ErrorHandler()
        seen = {}

        def on_value_error(ctx, exc):
            seen["ctx"] = ctx
            seen["exc"] = exc
            return Response(400, "custom")

        handler.on(ValueError, on_value_error)
        exc = ValueError("bad value")
        ctx = _ctx()
        resp = handler.handle(ctx, exc)
        self.assertEqual(resp.status, 400)
        self.assertEqual(resp.body, "custom")
        self.assertIs(seen["ctx"], ctx)
        self.assertIs(seen["exc"], exc)


if __name__ == "__main__":
    unittest.main()
