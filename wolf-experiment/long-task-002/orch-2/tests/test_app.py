"""Интеграционные тесты приложения (спецификация §8)."""

import unittest

from nanohttp import (
    Ctx,
    Field,
    Logger,
    MiddlewareChain,
    NanoApp,
    Request,
    Response,
    RouteConflictError,
    ValidationError,
    default_logger,
    validate,
)


class TestApp(unittest.TestCase):

    # ------------------------------------------------------------------
    # test_full_lifecycle
    # ------------------------------------------------------------------
    def test_full_lifecycle(self):
        """Полный цикл: request → router params → middleware → handler → response."""
        app = NanoApp()
        app.add("GET", "/users/:id", lambda ctx: Response(200, {"id": ctx.params["id"]}))
        resp = app.handle("GET", "/users/42")
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.body, {"id": "42"})

    # ------------------------------------------------------------------
    # test_404_unknown_path
    # ------------------------------------------------------------------
    def test_404_unknown_path(self):
        app = NanoApp()
        resp = app.handle("GET", "/nonexistent")
        self.assertEqual(resp.status, 404)
        self.assertEqual(resp.body["error"], "not_found")

    # ------------------------------------------------------------------
    # test_405_wrong_method
    # ------------------------------------------------------------------
    def test_405_wrong_method(self):
        app = NanoApp()
        app.add("POST", "/items", lambda ctx: Response(200))
        resp = app.handle("GET", "/items")
        self.assertEqual(resp.status, 405)
        self.assertEqual(resp.body["error"], "method_not_allowed")

    # ------------------------------------------------------------------
    # test_validation_error_400_details
    # ------------------------------------------------------------------
    def test_validation_error_400_details(self):
        app = NanoApp()

        def handler(ctx):
            schema = {"name": Field("str", min_len=2)}
            validate(ctx.request.body, schema)

        app.post("/users", handler)
        resp = app.handle("POST", "/users", body={"name": "A"})
        self.assertEqual(resp.status, 400)
        self.assertIn("details", resp.body)

    # ------------------------------------------------------------------
    # test_di_injected_handler
    # ------------------------------------------------------------------
    def test_di_injected_handler(self):
        """Singleton-репозиторий через container; состояние сохраняется."""
        app = NanoApp()

        def make_repo():
            return {"users": {}}

        app.container.singleton("repo", make_repo)

        def handler(ctx):
            repo = app.container.resolve("repo")
            repo["users"]["k"] = "v"
            return Response(200, list(repo["users"].keys()))

        app.get("/add", handler)
        r1 = app.handle("GET", "/add")
        r2 = app.handle("GET", "/add")
        self.assertEqual(r1.body, ["k"])
        self.assertEqual(r2.body, ["k"])

    # ------------------------------------------------------------------
    # test_state_shared
    # ------------------------------------------------------------------
    def test_state_shared(self):
        """state из middleware доступен в handler."""
        app = NanoApp()

        def mw(ctx, nxt):
            ctx.state["injected"] = "hello"
            return nxt()

        app.use(mw)

        def handler(ctx):
            return Response(200, ctx.state.get("injected"))

        app.get("/test", handler)
        resp = app.handle("GET", "/test")
        self.assertEqual(resp.body, "hello")

    # ------------------------------------------------------------------
    # test_error_in_middleware_handled
    # ------------------------------------------------------------------
    def test_error_in_middleware_handled(self):
        """ValueError в middleware → кастомный обработчик."""
        app = NanoApp()

        def bad_mw(ctx, nxt):
            raise ValueError("mw-err")

        app.use(bad_mw)

        def custom_handler(ctx, exc):
            return Response(422, {"msg": str(exc)})

        app.on(ValueError, custom_handler)

        app.get("/err", lambda ctx: Response(200))
        resp = app.handle("GET", "/err")
        self.assertEqual(resp.status, 422)
        self.assertEqual(resp.body["msg"], "mw-err")

    # ------------------------------------------------------------------
    # test_request_logged_always
    # ------------------------------------------------------------------
    def test_request_logged_always(self):
        """Лог-запись появляется ВСЕГДА, даже при ошибке в middleware."""
        unique_path = "/err-logged-always-xyzzy"

        app = NanoApp()

        def bad_mw(ctx, nxt):
            raise RuntimeError("middleware-err")

        app.use(bad_mw)
        app.get(unique_path, lambda ctx: Response(200))

        # Без обработчика → fallback 500, но лог должен быть
        resp = app.handle("GET", unique_path)
        self.assertEqual(resp.status, 500)

        # Ищем ЛЮБУЮ запись с нужным msg
        recs = default_logger.records()
        found = any(
            r.get("msg") == f"GET {unique_path}" and r.get("level") == "INFO"
            for r in recs
        )
        self.assertTrue(found, f"No log record found for GET {unique_path} among {recs}")

    # ------------------------------------------------------------------
    # test_route_conflict_409_surfaced
    # ------------------------------------------------------------------
    def test_route_conflict_409_surfaced(self):
        """RouteConflictError всплывает через app.add."""
        app = NanoApp()
        app.add("GET", "/dup", lambda ctx: Response(200))
        with self.assertRaises(RouteConflictError):
            app.add("GET", "/dup", lambda ctx: Response(200))

    # ------------------------------------------------------------------
    # test_example_from_spec_works
    # ------------------------------------------------------------------
    def test_example_from_spec_works(self):
        """Пример из спеки (раздел «Пример использования») — дословно."""
        app = NanoApp()

        def make_user_repo():
            return {"users": {}, "next_id": 1}

        app.container.singleton("user_repo", make_user_repo)

        def create_user(ctx):
            schema = {"name": Field("str", min_len=2), "age": Field("int", ge=0, le=150)}
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


if __name__ == "__main__":
    unittest.main()
