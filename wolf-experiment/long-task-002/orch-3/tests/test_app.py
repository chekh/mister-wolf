"""Тесты модуля app.py (спека §8, приложение B)."""

import unittest

from nanohttp import (
    Field,
    MethodNotAllowedError,
    NanoApp,
    NotFoundError,
    Response,
    RouteConflictError,
    ValidationError,
    default_logger,
    validate,
)


class TestFullLifecycle(unittest.TestCase):
    """test_full_lifecycle: request → router (параметры :id) → middleware (state) → handler → response."""

    def test_full_lifecycle(self):
        app = NanoApp()

        def mw_set_state(ctx, next_):
            ctx.state["tenant"] = "acme"
            return next_()

        app.use(mw_set_state)

        def handler(ctx):
            return Response(200, {
                "id": ctx.params["id"],
                "tenant": ctx.state["tenant"],
            })

        app.get("/items/:id", handler)
        resp = app.handle("GET", "/items/42")
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.body, {"id": "42", "tenant": "acme"})


class Test404UnknownPath(unittest.TestCase):
    """test_404_unknown_path: несуществующий путь → 404."""

    def test_404_unknown_path(self):
        app = NanoApp()
        app.get("/exists", lambda ctx: Response(200))
        resp = app.handle("GET", "/nope")
        self.assertEqual(resp.status, 404)


class Test405WrongMethod(unittest.TestCase):
    """test_405_wrong_method: путь есть, метод другой → 405."""

    def test_405_wrong_method(self):
        app = NanoApp()
        app.get("/items", lambda ctx: Response(200))
        resp = app.handle("POST", "/items")
        self.assertEqual(resp.status, 405)


class TestValidationError400Details(unittest.TestCase):
    """test_validation_error_400_details: ValidationError → 400 + details."""

    def test_validation_error_400_details(self):
        app = NanoApp()

        def handler(ctx):
            raise ValidationError([{"field": "name", "message": "missing field"}])

        app.post("/items", handler)
        resp = app.handle("POST", "/items", body={"wrong": 1})
        self.assertEqual(resp.status, 400)
        self.assertIn("details", resp.body)
        self.assertEqual(resp.body["details"], [{"field": "name", "message": "missing field"}])


class TestDIInjectedHandler(unittest.TestCase):
    """test_di_injected_handler: handler resolve'ит зависимость из контейнера."""

    def test_di_injected_handler(self):
        app = NanoApp()

        app.container.singleton("repo", lambda: {"items": [1, 2, 3]})

        def handler(ctx):
            repo = app.container.resolve("repo")
            return Response(200, {"items": repo["items"]})

        app.get("/items", handler)
        resp = app.handle("GET", "/items")
        self.assertEqual(resp.body, {"items": [1, 2, 3]})


class TestStateShared(unittest.TestCase):
    """test_state_shared: middleware пишет в ctx.state, handler читает."""

    def test_state_shared(self):
        app = NanoApp()

        def mw(ctx, next_):
            ctx.state["counter"] = 99
            return next_()

        app.use(mw)

        def handler(ctx):
            return Response(200, {"counter": ctx.state["counter"]})

        app.get("/check", handler)
        resp = app.handle("GET", "/check")
        self.assertEqual(resp.body, {"counter": 99})


class TestErrorInMiddlewareHandled(unittest.TestCase):
    """test_error_in_middleware_handled: middleware ValueError → 500 или кастомный."""

    def test_error_in_middleware_handled(self):
        # Без on(): 500 internal
        app = NanoApp()
        n_before = len(default_logger.records())

        def bad_mw(ctx, next_):
            raise ValueError("boom")

        app.use(bad_mw)
        app.get("/fail", lambda ctx: Response(200))
        resp = app.handle("GET", "/fail")
        self.assertEqual(resp.status, 500)
        # Лог-запись появилась
        log_recs = default_logger.records()[n_before:]
        self.assertTrue(any("GET /fail" in r["msg"] for r in log_recs))

        # С on(): кастомный Response
        app2 = NanoApp()
        app2.on(ValueError, lambda ctx, exc: Response(418, {"error": "teapot"}))

        def bad_mw2(ctx, next_):
            raise ValueError("boom2")

        app2.use(bad_mw2)
        app2.get("/fail2", lambda ctx: Response(200))
        resp2 = app2.handle("GET", "/fail2")
        self.assertEqual(resp2.status, 418)
        self.assertEqual(resp2.body, {"error": "teapot"})


class TestRequestLoggedAlways(unittest.TestCase):
    """test_request_logged_always: ошибка внутри → запись в default_logger (status=500)."""

    def test_request_logged_always(self):
        # Очищаем default_logger для чистоты теста
        before_count = len(default_logger.records())

        app = NanoApp()

        def bad_handler(ctx):
            raise RuntimeError("internal oops")

        app.get("/boom", bad_handler)
        resp = app.handle("GET", "/boom")
        self.assertEqual(resp.status, 500)

        # Запись в default_logger появилась
        new_recs = default_logger.records()[before_count:]
        self.assertTrue(len(new_recs) >= 1)
        self.assertEqual(new_recs[0]["msg"], "GET /boom")
        self.assertEqual(new_recs[0]["status"], 500)


class TestRouteConflict409Surfaced(unittest.TestCase):
    """test_route_conflict_409_surfaced: повторный add → RouteConflictError .status==409."""

    def test_route_conflict_409_surfaced(self):
        app = NanoApp()
        app.get("/dup", lambda ctx: Response(200))
        with self.assertRaises(RouteConflictError) as cm:
            app.get("/dup", lambda ctx: Response(201))
        self.assertEqual(cm.exception.status, 409)


class TestExampleFromSpecWorks(unittest.TestCase):
    """test_example_from_spec_works: дословный пример из спеки."""

    def test_example_from_spec_works(self):
        app = NanoApp()

        def make_user_repo():
            return {"users": {}, "next_id": 1}

        app.container.singleton("user_repo", make_user_repo)

        def create_user(ctx):
            schema = {
                "name": Field("str", min_len=2),
                "age": Field("int", ge=0, le=150),
            }
            try:
                data = validate(ctx.request.body, schema)
            except ValidationError:
                raise
            repo = app.container.resolve("user_repo")
            uid = repo["next_id"]
            repo["next_id"] += 1
            repo["users"][uid] = data
            return Response(201, {"id": uid, **data})

        app.post("/users", create_user)
        resp = app.handle("POST", "/users", body={"name": "Ann", "age": 33})
        self.assertEqual(resp.status, 201)
        self.assertEqual(resp.body, {"id": 1, "name": "Ann", "age": 33})


if __name__ == "__main__":
    unittest.main()
