"""tests/test_app — интеграционные тесты NanoApp (spec.md §8)."""

import unittest

from nanohttp import (
    NanoApp,
    NotFoundError,
    Response,
    RouteConflictError,
    ValidationError,
    Field,
    default_logger,
    validate,
)


class TestApp(unittest.TestCase):
    """Интеграционные тесты полного lifecycle NanoApp."""

    # --- helpers ---
    def _new_app(self) -> NanoApp:
        """Создать чистый NanoApp (без global state)."""
        return NanoApp()

    # 1. test_full_lifecycle
    def test_full_lifecycle(self) -> None:
        """request → router (params) → middleware → handler → response."""
        app = self._new_app()
        captured_mw: list[str] = []

        def my_mw(ctx, next_fn):
            captured_mw.append("before")
            resp = next_fn()
            captured_mw.append("after")
            return resp

        app.use(my_mw)

        def handler(ctx):
            return Response(200, {"id": ctx.params["id"], "mw": "ok"})

        app.get("/users/:id", handler)
        resp = app.handle("GET", "/users/42")
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.body["id"], "42")
        self.assertEqual(captured_mw, ["before", "after"])

    # 2. test_404_unknown_path
    def test_404_unknown_path(self) -> None:
        """handle("GET", "/nope") → 404 not_found."""
        app = self._new_app()
        resp = app.handle("GET", "/nope")
        self.assertEqual(resp.status, 404)
        self.assertEqual(resp.body["error"], "not_found")

    # 3. test_405_wrong_method
    def test_405_wrong_method(self) -> None:
        """GET /users зарегистрирован; POST → 405 method_not_allowed."""
        app = self._new_app()
        app.get("/users", lambda ctx: Response(200))
        resp = app.handle("POST", "/users")
        self.assertEqual(resp.status, 405)
        self.assertEqual(resp.body["error"], "method_not_allowed")

    # 4. test_validation_error_400_details
    def test_validation_error_400_details(self) -> None:
        """ValidationError из handler → 400 + details."""
        app = self._new_app()
        details = [{"field": "name", "message": "missing field"}]

        def handler(ctx):
            raise ValidationError(details)

        app.get("/test", handler)
        resp = app.handle("GET", "/test")
        self.assertEqual(resp.status, 400)
        self.assertEqual(resp.body["error"], "validation")
        self.assertEqual(resp.body["details"], details)

    # 5. test_di_injected_handler
    def test_di_injected_handler(self) -> None:
        """handler использует container.resolve() — singleton работает."""
        app = self._new_app()
        call_count = 0

        def make_repo():
            nonlocal call_count
            call_count += 1
            return {"data": "shared"}

        app.container.singleton("repo", make_repo)

        results: list[object] = []

        def handler(ctx):
            results.append(app.container.resolve("repo"))
            return Response(200, body="ok")

        app.get("/di", handler)

        # Два запроса — singleton: один и тот же объект
        app.handle("GET", "/di")
        app.handle("GET", "/di")
        self.assertEqual(call_count, 1)  # фабрика вызвана 1 раз
        self.assertIs(results[0], results[1])  # тот же объект

    # 6. test_state_shared
    def test_state_shared(self) -> None:
        """Middleware пишет state, handler читает."""
        app = self._new_app()

        def state_mw(ctx, next_fn):
            ctx.state["k"] = "v"
            return next_fn()

        app.use(state_mw)

        def handler(ctx):
            return Response(200, {"k": ctx.state["k"]})

        app.get("/state", handler)
        resp = app.handle("GET", "/state")
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.body["k"], "v")

    # 7. test_error_in_middleware_handled
    def test_error_in_middleware_handled(self) -> None:
        """Middleware бросает ValueError → 500 по умолчанию; затем on() → кастомный."""
        # --- под-случай 1: дефолт 500 ---
        app1 = self._new_app()

        def bad_mw(ctx, next_fn):
            raise ValueError("mw boom")

        app1.use(bad_mw)
        app1.get("/err", lambda ctx: Response(200))

        resp = app1.handle("GET", "/err")
        self.assertEqual(resp.status, 500)
        self.assertEqual(resp.body["error"], "internal")

        # --- под-случай 2: кастомный обработчик ---
        app2 = self._new_app()
        app2.use(bad_mw)
        app2.on(ValueError, lambda ctx, exc: Response(418, {"error": "teapot"}))
        app2.get("/err2", lambda ctx: Response(200))

        resp = app2.handle("GET", "/err2")
        self.assertEqual(resp.status, 418)
        self.assertEqual(resp.body["error"], "teapot")

    # 8. test_request_logged_always
    def test_request_logged_always(self) -> None:
        """Log_middleware внешний — логируется ВСЕГДА, даже при ошибке в middleware."""
        unique_ok = "/log_ok_unique_xyz"
        unique_err = "/log_err_unique_abc"

        def bad_mw(ctx, next_fn):
            raise ValueError("log test boom")

        # --- под-случай 1: успешный запрос ---
        app1 = self._new_app()
        app1.get(unique_ok, lambda ctx: Response(200))
        before_ok = default_logger.records()
        app1.handle("GET", unique_ok)
        after_ok = default_logger.records()

        ok_found = any(
            r["msg"] == f"GET {unique_ok}"
            for r in after_ok[len(before_ok) :]
        )
        self.assertTrue(ok_found, f"Успешный запрос {unique_ok!r} не залогирован")

        # --- под-случай 2: запрос с ошибкой в middleware ---
        app2 = self._new_app()
        app2.use(bad_mw)
        app2.get(unique_err, lambda ctx: Response(200))
        before_err = default_logger.records()
        app2.handle("GET", unique_err)
        after_err = default_logger.records()

        err_found = any(
            r["msg"] == f"GET {unique_err}"
            for r in after_err[len(before_err) :]
        )
        self.assertTrue(
            err_found, f"Запрос с ошибкой {unique_err!r} не залогирован"
        )

    # 9. test_route_conflict_409_surfaced
    def test_route_conflict_409_surfaced(self) -> None:
        """Повторный app.get("/x", h2) → RouteConflictError."""
        app = self._new_app()
        app.get("/x", lambda ctx: Response(200))
        with self.assertRaises(RouteConflictError):
            app.get("/x", lambda ctx: Response(201))

    # 10. test_example_from_spec_works
    def test_example_from_spec_works(self) -> None:
        """Дословный пример из спеки §8."""
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


if __name__ == "__main__":
    unittest.main()
