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
        app.use(lambda ctx, next: ctx.state.update({"mw": "outer"}) or next())

        def handler(ctx):
            return Response(
                200,
                {
                    "id": ctx.params["id"],
                    "mw": ctx.state["mw"],
                    "q": ctx.request.query.get("verbose"),
                    "body": ctx.request.body.get("payload"),
                },
            )

        app.get("/users/:id", handler)
        resp = app.handle("GET", "/users/42", query={"verbose": "1"}, body={"payload": "p"})
        self.assertEqual(resp.status, 200)
        self.assertEqual(
            resp.body,
            {"id": "42", "mw": "outer", "q": "1", "body": "p"},
        )

    def test_404_unknown_path(self):
        app = NanoApp()
        app.get("/known", lambda ctx: Response(200, "ok"))
        resp = app.handle("GET", "/unknown")
        self.assertEqual(resp.status, 404)
        self.assertEqual(resp.body["error"], "not_found")
        self.assertIn("message", resp.body)

    def test_405_wrong_method(self):
        app = NanoApp()
        app.get("/res", lambda ctx: Response(200, "ok"))
        resp = app.handle("POST", "/res")
        self.assertEqual(resp.status, 405)
        self.assertEqual(resp.body["error"], "method_not_allowed")

    def test_validation_error_400_details(self):
        app = NanoApp()

        def handler(ctx):
            validate(ctx.request.body, {"name": Field("str", min_len=2)})
            return Response(200, "never")

        app.post("/users", handler)
        resp = app.handle("POST", "/users", body={"name": "a"})
        self.assertEqual(resp.status, 400)
        self.assertEqual(resp.body["error"], "validation")
        self.assertEqual(
            resp.body["details"],
            [{"field": "name", "message": "length must be >= 2"}],
        )

    def test_di_injected_handler(self):
        app = NanoApp()
        created = []

        def make_repo():
            created.append(1)
            return {"users": {}, "next_id": 1}

        app.container.singleton("repo", make_repo)

        def create(ctx):
            repo = app.container.resolve("repo")
            uid = repo["next_id"]
            repo["next_id"] += 1
            repo["users"][uid] = dict(ctx.request.body)
            return Response(201, {"id": uid})

        app.post("/users", create)
        r1 = app.handle("POST", "/users", body={"name": "Ann"})
        r2 = app.handle("POST", "/users", body={"name": "Bob"})
        self.assertEqual(r1.body, {"id": 1})
        self.assertEqual(r2.body, {"id": 2})  # тот же singleton-объект
        self.assertEqual(len(created), 1)

    def test_state_shared(self):
        app = NanoApp()
        seen = {}

        def mw(ctx, next):
            ctx.state["from_mw"] = "hello"
            response = next()
            seen["from_handler"] = ctx.state.get("from_handler")
            return response

        # схема: mw пишет -> handler читает; handler пишет -> mw читает после next()
        def handler(ctx):
            ctx.state["from_handler"] = "bye"
            return Response(200, ctx.state["from_mw"])

        app.use(mw)
        app.get("/state", handler)
        resp = app.handle("GET", "/state")
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.body, "hello")
        self.assertEqual(seen["from_handler"], "bye")

    def test_error_in_middleware_handled(self):
        # без кастомного обработчика -> 500 internal
        app = NanoApp()
        app.get("/boom", lambda ctx: Response(200, "ok"))

        def bad(ctx, next):
            raise ValueError("boom")

        app.use(bad)
        resp = app.handle("GET", "/boom")
        self.assertEqual(resp.status, 500)
        self.assertEqual(resp.body, {"error": "internal", "message": "boom"})

        # с кастомным on(ValueError, ...) -> кастомный ответ
        app2 = NanoApp()
        app2.get("/boom", lambda ctx: Response(200, "ok"))
        app2.use(bad)
        app2.on(ValueError, lambda ctx, exc: Response(422, {"error": "caught"}))
        resp2 = app2.handle("GET", "/boom")
        self.assertEqual(resp2.status, 422)
        self.assertEqual(resp2.body, {"error": "caught"})

    def test_request_logged_always(self):
        app = NanoApp()
        app.get("/ok", lambda ctx: Response(200, "ok"))

        def bad(ctx, next):
            raise ValueError("mw-fail")

        app.use(bad)
        before = len(default_logger.records())
        resp = app.handle("GET", "/ok")  # middleware падает -> 500
        self.assertEqual(resp.status, 500)
        after = default_logger.records()
        self.assertEqual(len(after), before + 1)  # запись появилась несмотря на ошибку
        rec = after[-1]
        self.assertEqual(rec["msg"], "GET /ok")
        self.assertEqual(rec["status"], 500)
        self.assertGreaterEqual(rec["duration_ms"], 0)
        # и успешный запрос логируется
        app2 = NanoApp()
        app2.get("/fine", lambda ctx: Response(200, "ok"))
        count = len(default_logger.records())
        app2.handle("GET", "/fine")
        rec = default_logger.records()[-1]
        self.assertEqual(rec["msg"], "GET /fine")
        self.assertEqual(rec["status"], 200)

    def test_route_conflict_409_surfaced(self):
        app = NanoApp()
        app.get("/dup", lambda ctx: Response(200, "one"))
        # дубликат регистрации — RouteConflictError сразу при add
        with self.assertRaises(RouteConflictError):
            app.add("GET", "/dup", lambda ctx: Response(200, "two"))
        # 409 сустейнится через error-обработчик, если ошибка поднята в lifecycle
        def raiser(ctx):
            raise RouteConflictError("duplicate route")

        app.get("/conflict", raiser)
        resp = app.handle("GET", "/conflict")
        self.assertEqual(resp.status, 409)
        self.assertEqual(resp.body["error"], "route_conflict")

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
        # второй запрос — тот же singleton-репозиторий
        resp2 = app.handle("POST", "/users", body={"name": "Bo", "age": 20})
        self.assertEqual(resp2.body, {"id": 2, "name": "Bo", "age": 20})


if __name__ == "__main__":
    unittest.main()
