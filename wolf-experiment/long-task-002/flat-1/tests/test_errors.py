import unittest

from nanohttp import Ctx, ErrorHandler, HttpError, Request, Response, ValidationError


class TestErrors(unittest.TestCase):
    def _ctx(self):
        return Ctx(Request("GET", "/"))

    def test_mro_exact_first(self):
        class BaseExc(Exception):
            pass

        class SubExc(BaseExc):
            pass

        eh = ErrorHandler()
        calls = []
        eh.on(SubExc, lambda ctx, exc: calls.append("sub") or Response(200, "sub"))
        eh.on(BaseExc, lambda ctx, exc: calls.append("base") or Response(200, "base"))
        resp = eh.handle(self._ctx(), SubExc())
        self.assertEqual(resp.body, "sub")
        self.assertEqual(calls, ["sub"])

    def test_base_class_fallback(self):
        class BaseExc(Exception):
            pass

        class SubExc(BaseExc):
            pass

        eh = ErrorHandler()
        eh.on(BaseExc, lambda ctx, exc: Response(200, "base"))
        resp = eh.handle(self._ctx(), SubExc())  # точного обработчика нет
        self.assertEqual(resp.body, "base")

    def test_no_handler_500(self):
        eh = ErrorHandler()
        resp = eh.handle(self._ctx(), ValueError("boom"))
        self.assertEqual(resp.status, 500)
        self.assertEqual(resp.body, {"error": "internal", "message": "boom"})

    def test_validation_details_in_body(self):
        eh = ErrorHandler()
        details = [{"field": "name", "message": "missing field"}]
        resp = eh.handle(self._ctx(), ValidationError(details))
        self.assertEqual(resp.status, 400)
        self.assertEqual(resp.body["error"], "validation")
        self.assertIn("message", resp.body)
        self.assertEqual(resp.body["details"], details)

    def test_http_error_attrs(self):
        err = HttpError(418, "teapot", "short and stout")
        self.assertEqual(err.status, 418)
        self.assertEqual(err.code, "teapot")
        self.assertEqual(err.message, "short and stout")
        self.assertIsInstance(err, Exception)
        # HttpError без обработчика — fallback со своим статусом
        eh = ErrorHandler()
        resp = eh.handle(self._ctx(), err)
        self.assertEqual(resp.status, 418)
        self.assertEqual(resp.body, {"error": "teapot", "message": "short and stout"})

    def test_on_registers(self):
        eh = ErrorHandler()
        got = {}

        def handler(ctx, exc):
            got["ctx"] = ctx
            got["exc"] = exc
            return Response(422, "custom")

        eh.on(ValueError, handler)
        exc = ValueError("wat")
        resp = eh.handle(self._ctx(), exc)
        self.assertEqual(resp.status, 422)
        self.assertIs(got["exc"], exc)
        self.assertIsInstance(got["ctx"], Ctx)


if __name__ == "__main__":
    unittest.main()
