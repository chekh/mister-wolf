"""Интеграционные тесты приложения (спека, раздел 8)."""

import unittest

from nanohttp import (
    Field,
    NanoApp,
    Response,
    RouteConflictError,
    ValidationError,
    default_logger,
    validate,
)


class TestApp(unittest.TestCase):

    def test_full_lifecycle(self):
        app = NanoApp()
        seen = {}

        def stamp(ctx, next):
            ctx.state["mw"] = "yes"
            return next()

        def handler(ctx):
            seen["params"] = dict(ctx.params)
            seen["state"] = ctx.state.get("mw")
            seen["query"] = ctx.request.query
            return Response(200, {"ok": True})

        app.use(stamp)
        app.get("/users/:id", handler)
        response = app.handle("GET", "/users/42", query={"full": "1"})
        self.assertEqual(response.status, 200)
        self.assertEqual(response.body, {"ok": True})
        self.assertEqual(seen["params"], {"id": "42"})
        self.assertEqual(seen["state"], "yes")
        self.assertEqual(seen["query"], {"full": "1"})

    def test_404_unknown_path(self):
        app = NanoApp()
        app.get("/known", lambda ctx: Response(200, "ok"))
        response = app.handle("GET", "/unknown")
        self.assertEqual(response.status, 404)
        self.assertEqual(response.body["error"], "not_found")
        self.assertIn("message", response.body)

    def test_405_wrong_method(self):
        app = NanoApp()
        app.get("/only-get", lambda ctx: Response(200, "ok"))
        response = app.handle("POST", "/only-get")
        self.assertEqual(response.status, 405)
        self.assertEqual(response.body["error"], "method_not_allowed")

    def test_validation_error_400_details(self):
        app = NanoApp()

        def handler(ctx):
            schema = {"name": Field("str", min_len=2)}
            validate(ctx.request.body, schema)  # ValidationError уйдёт наружу
            return Response(200, "never")

        app.post("/users", handler)
        response = app.handle("POST", "/users", body={"name": "a"})
        self.assertEqual(response.status, 400)
        self.assertEqual(response.body["error"], "validation")
        self.assertEqual(
            response.body["details"],
            [{"field": "name", "message": "length must be >= 2"}],
        )

    def test_di_injected_handler(self):
        app = NanoApp()

        def make_repo():
            return {"users": {}, "next_id": 1}

        app.container.singleton("repo", make_repo)

        def handler(ctx):
            repo = app.container.resolve("repo")
            uid = repo["next_id"]
            repo["next_id"] += 1
            repo["users"][uid] = dict(ctx.request.body)
            return Response(201, {"id": uid})

        app.post("/items", handler)
        first = app.handle("POST", "/items", body={"title": "a"})
        second = app.handle("POST", "/items", body={"title": "b"})
        self.assertEqual(first.body["id"], 1)
        self.assertEqual(second.body["id"], 2)  # singleton: тот же repo

    def test_state_shared(self):
        app = NanoApp()
        seen = {}

        def put_state(ctx, next):
            ctx.state["request_id"] = "req-1"
            return next()

        def handler(ctx):
            seen["state"] = ctx.state
            return Response(200, "ok")

        app.use(put_state)
        app.get("/ping", handler)
        app.handle("GET", "/ping")
        self.assertEqual(seen["state"].get("request_id"), "req-1")

    def test_error_in_middleware_handled(self):
        def boom(ctx, next):
            raise ValueError("middleware boom")

        # без кастомного обработчика — 500 internal
        app = NanoApp()
        app.use(boom)
        app.get("/ok-mw", lambda ctx: Response(200, "ok"))
        response = app.handle("GET", "/ok-mw")
        self.assertEqual(response.status, 500)
        self.assertEqual(response.body, {"error": "internal", "message": "middleware boom"})

        # с кастомным on(ValueError, ...) — его ответ
        app2 = NanoApp()
        app2.use(boom)
        app2.get("/ok-mw2", lambda ctx: Response(200, "ok"))
        app2.on(ValueError, lambda ctx, exc: Response(418, {"error": "teapot"}))
        response2 = app2.handle("GET", "/ok-mw2")
        self.assertEqual(response2.status, 418)
        self.assertEqual(response2.body, {"error": "teapot"})

        # лог-запись о запросе появилась в обоих случаях
        messages = [r["msg"] for r in default_logger.records()]
        self.assertIn("GET /ok-mw", messages)
        self.assertIn("GET /ok-mw2", messages)

    def test_request_logged_always(self):
        app = NanoApp()
        app.get("/ping-always", lambda ctx: Response(200, "pong"))

        # успешный запрос логируется
        app.handle("GET", "/ping-always")
        records = [r for r in default_logger.records() if r["msg"] == "GET /ping-always"]
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["level"], "INFO")
        self.assertEqual(records[0]["status"], 200)
        self.assertIsInstance(records[0]["duration_ms"], int)

        # запрос с ошибкой в middleware — запись всё равно появляется
        def boom(ctx, next):
            raise RuntimeError("late boom")

        app2 = NanoApp()
        app2.use(boom)
        app2.get("/ping-always", lambda ctx: Response(200, "pong"))
        response = app2.handle("GET", "/ping-always")
        self.assertEqual(response.status, 500)
        records = [r for r in default_logger.records() if r["msg"] == "GET /ping-always"]
        self.assertEqual(len(records), 2)
        self.assertEqual(records[1]["status"], 500)

    def test_route_conflict_409_surfaced(self):
        app = NanoApp()
        app.get("/dup", lambda ctx: Response(200, "first"))
        with self.assertRaises(RouteConflictError):
            app.get("/dup", lambda ctx: Response(200, "second"))

        # конфликт как HttpError проходит через error-обработчик -> 409
        app.get("/clash", lambda ctx: (_ for _ in ()).throw(RouteConflictError()))
        response = app.handle("GET", "/clash")
        self.assertEqual(response.status, 409)
        self.assertEqual(response.body["error"], "route_conflict")

    def test_example_from_spec_works(self):
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
        self.assertEqual(resp.body, {"id": 1, "name": "Ann", "age": 33})


if __name__ == "__main__":
    unittest.main()
