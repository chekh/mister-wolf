"""Тесты иерархии ошибок и error handler'а (спека, раздел 6)."""

import unittest

from nanohttp import Ctx, ErrorHandler, HttpError, Request, Response, ValidationError


def _ctx():
    return Ctx(Request("GET", "/"))


class TestErrors(unittest.TestCase):

    def test_mro_exact_first(self):
        class Base(Exception):
            pass

        class Exact(Base):
            pass

        handler = ErrorHandler()
        handler.on(Base, lambda ctx, exc: Response(200, "base"))
        handler.on(Exact, lambda ctx, exc: Response(201, "exact"))
        response = handler.handle(_ctx(), Exact("x"))
        self.assertEqual(response.status, 201)
        self.assertEqual(response.body, "exact")

    def test_base_class_fallback(self):
        class Base(Exception):
            pass

        class Child(Base):
            pass

        handler = ErrorHandler()
        handler.on(Base, lambda ctx, exc: Response(202, "base-caught"))
        response = handler.handle(_ctx(), Child("x"))
        self.assertEqual(response.status, 202)
        self.assertEqual(response.body, "base-caught")

        # незарегистрированный тип — не ловится base-обработчиком... кроме MRO object
        class Other(Exception):
            pass

        response = handler.handle(_ctx(), Other("x"))
        self.assertEqual(response.status, 500)

    def test_no_handler_500(self):
        handler = ErrorHandler()
        response = handler.handle(_ctx(), ValueError("boom"))
        self.assertEqual(response.status, 500)
        self.assertEqual(response.body, {"error": "internal", "message": "boom"})

    def test_validation_details_in_body(self):
        handler = ErrorHandler()
        details = [
            {"field": "name", "message": "missing field"},
            {"field": "age", "message": "expected int"},
        ]
        response = handler.handle(_ctx(), ValidationError(details))
        self.assertEqual(response.status, 400)
        self.assertEqual(response.body["error"], "validation")
        self.assertIn("message", response.body)
        self.assertEqual(response.body["details"], details)

    def test_http_error_attrs(self):
        exc = HttpError(418, "teapot", "short and stout")
        self.assertEqual(exc.status, 418)
        self.assertEqual(exc.code, "teapot")
        self.assertEqual(exc.message, "short and stout")
        # HttpError без обработчика -> uniform-ответ по статусу/коду
        response = ErrorHandler().handle(_ctx(), exc)
        self.assertEqual(response.status, 418)
        self.assertEqual(response.body, {"error": "teapot", "message": "short and stout"})

    def test_on_registers(self):
        handler = ErrorHandler()
        seen = {}

        def on_value_error(ctx, exc):
            seen["ctx"] = ctx
            seen["exc"] = exc
            return Response(422, {"caught": True})

        handler.on(ValueError, on_value_error)
        original = ValueError("the one")
        response = handler.handle(_ctx(), original)
        self.assertEqual(response.status, 422)
        self.assertEqual(response.body, {"caught": True})
        self.assertIs(seen["exc"], original)
        self.assertIsInstance(seen["ctx"], Ctx)


if __name__ == "__main__":
    unittest.main()
