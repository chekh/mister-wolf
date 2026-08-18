"""Тесты для модуля nanohttp.errors (спека §6)."""

import unittest

from nanohttp import (
    CircularDependencyError,
    Ctx,
    ErrorHandler,
    HttpError,
    MethodNotAllowedError,
    NotFoundError,
    Request,
    ResolutionError,
    Response,
    RouteConflictError,
)


class TestHttpError(unittest.TestCase):
    """Базовый HttpError и его подклассы."""

    def test_http_error_attrs(self) -> None:
        """HttpError хранит status, code, message."""
        err = HttpError(403, "forbidden", "access denied")
        self.assertEqual(err.status, 403)
        self.assertEqual(err.code, "forbidden")
        self.assertEqual(err.message, "access denied")
        self.assertEqual(str(err), "access denied")

    def test_not_found_defaults(self) -> None:
        e = NotFoundError()
        self.assertEqual(e.status, 404)
        self.assertEqual(e.code, "not_found")
        self.assertEqual(e.message, "not found")

    def test_not_found_custom_message(self) -> None:
        e = NotFoundError("user missing")
        self.assertEqual(e.message, "user missing")

    def test_method_not_allowed(self) -> None:
        e = MethodNotAllowedError(["POST", "PUT", "GET"])
        self.assertEqual(e.status, 405)
        self.assertEqual(e.code, "method_not_allowed")
        self.assertEqual(e.message, "method not allowed")
        self.assertEqual(e.allowed, ["GET", "POST", "PUT"])  # sorted

    def test_route_conflict(self) -> None:
        e = RouteConflictError()
        self.assertEqual(e.status, 409)
        self.assertEqual(e.code, "route_conflict")

    def test_resolution_error(self) -> None:
        e = ResolutionError()
        self.assertEqual(e.status, 500)
        self.assertEqual(e.code, "resolution")

    def test_circular_dependency_error(self) -> None:
        e = CircularDependencyError()
        self.assertEqual(e.status, 500)
        self.assertEqual(e.code, "circular_dependency")


class TestErrorHandler(unittest.TestCase):
    """ErrorHandler: регистрация, MRO, fallback."""

    def test_on_registers(self) -> None:
        """Метод on сохраняет обработчик и он находится по handle."""
        handler = ErrorHandler()
        called = []

        def custom_handler(ctx: Ctx, exc: BaseException) -> Response:
            called.append(True)
            return Response(418, {"msg": "custom"})

        handler.on(ValueError, custom_handler)

        ctx = Ctx(Request("GET", "/"))
        resp = handler.handle(ctx, ValueError("bad value"))
        self.assertTrue(called)
        self.assertEqual(resp.status, 418)

    def test_mro_exact_first(self) -> None:
        """Точный тип исключения выигрывает у базового в MRO."""
        handler = ErrorHandler()
        log: list[str] = []

        def base_handler(ctx: Ctx, exc: BaseException) -> Response:
            log.append("base")
            return Response(500, {"from": "base"})

        def child_handler(ctx: Ctx, exc: BaseException) -> Response:
            log.append("child")
            return Response(400, {"from": "child"})

        handler.on(ValueError, base_handler)
        handler.on(UnicodeError, child_handler)

        ctx = Ctx(Request("GET", "/"))
        # UnicodeError — точное совпадение
        resp = handler.handle(ctx, UnicodeError("bad decode"))
        self.assertEqual(resp.status, 400)
        self.assertEqual(log, ["child"])

    def test_base_class_fallback(self) -> None:
        """Если точного типа нет — ближайший базовый по MRO."""
        handler = ErrorHandler()
        log: list[str] = []

        def value_handler(ctx: Ctx, exc: BaseException) -> Response:
            log.append("value")
            return Response(400, {"from": "value"})

        def lookup_handler(ctx: Ctx, exc: BaseException) -> Response:
            log.append("lookup")
            return Response(500, {"from": "lookup"})

        handler.on(LookupError, lookup_handler)
        handler.on(ValueError, value_handler)

        ctx = Ctx(Request("GET", "/"))
        # KeyError — нет точного, ближайший базовый = LookupError
        resp = handler.handle(ctx, KeyError("missing"))
        self.assertEqual(resp.status, 500)
        self.assertEqual(log, ["lookup"])

    def test_no_handler_500(self) -> None:
        """Без зарегистрированного обработчика — fallback 500 для произвольного исключения."""
        handler = ErrorHandler()
        ctx = Ctx(Request("GET", "/"))
        resp = handler.handle(ctx, RuntimeError("boom"))
        self.assertEqual(resp.status, 500)
        self.assertEqual(resp.body, {"error": "internal", "message": "boom"})

    def test_http_error_fallback_body(self) -> None:
        """HttpError без обработчика → тело {error, message} с его статусом."""
        handler = ErrorHandler()
        ctx = Ctx(Request("GET", "/"))
        resp = handler.handle(ctx, NotFoundError("gone"))
        self.assertEqual(resp.status, 404)
        self.assertEqual(resp.body, {"error": "not_found", "message": "gone"})

    def test_validation_details_in_body(self) -> None:
        """Исключение с атрибутом .errors → тело содержит 'details'."""
        handler = ErrorHandler()
        ctx = Ctx(Request("GET", "/"))

        # Собственный временный подкласс с .errors (duck typing)
        class FakeValidationError(HttpError):
            def __init__(self, errors: list[dict]) -> None:
                self.errors = errors
                super().__init__(400, "validation", "validation failed")

        errs = [{"field": "name", "message": "missing"}, {"field": "age", "message": "too big"}]
        exc = FakeValidationError(errs)
        resp = handler.handle(ctx, exc)
        self.assertEqual(resp.status, 400)
        self.assertEqual(resp.body["error"], "validation")
        self.assertEqual(resp.body["message"], "validation failed")
        self.assertEqual(resp.body["details"], errs)


if __name__ == "__main__":
    unittest.main()
