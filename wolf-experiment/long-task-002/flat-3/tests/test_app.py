"""Интеграционные тесты приложения (спека §8, прил. B: test_app)."""
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


class NanoAppTests(unittest.TestCase):
    def test_full_lifecycle(self):
        app = NanoApp()

        def tag(ctx, next):
            ctx.state["via_mw"] = True
            return next()

        app.use(tag)

        def get_user(ctx):
            return Response(200, {"id": ctx.params["id"], "via_mw": ctx.state["via_mw"]})

        app.get("/users/:id", get_user)
        resp = app.handle("GET", "/users/%3942")  # %39 == '9' -> params decoded
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.body, {"id": "942", "via_mw": True})

    def test_404_unknown_path(self):
        app = NanoApp()
        app.get("/known", lambda ctx: Response(200, "ok"))
        resp = app.handle("GET", "/unknown")
        self.assertEqual(resp.status, 404)
        self.assertEqual(resp.body["error"], "not_found")

    def test_405_wrong_method(self):
        app = NanoApp()
        app.get("/x", lambda ctx: Response(200, "ok"))
        resp = app.handle("POST", "/x")
        self.assertEqual(resp.status, 405)
        self.assertEqual(resp.body["error"], "method_not_allowed")

    def test_validation_error_400_details(self):
        app = NanoApp()

        def create(ctx):
            schema = {"name": Field("str", min_len=2)}
            return Response(201, validate(ctx.request.body, schema))

        app.post("/users", create)
        resp = app.handle("POST", "/users", body={"name": "A"})
        self.assertEqual(resp.status, 400)
        self.assertEqual(resp.body["error"], "validation")
        self.assertEqual(resp.body["details"][0]["field"], "name")

    def test_di_injected_handler(self):
        app = NanoApp()

        def make_repo():
            return {"items": [], "next_id": 1}

        app.container.singleton("repo", make_repo)

        def add_item(ctx):
            repo = app.container.resolve("repo")
            item_id = repo["next_id"]
            repo["items"].append(item_id)
            repo["next_id"] += 1
            return Response(201, {"id": item_id, "total": len(repo["items"])})

        app.post("/items", add_item)
        first = app.handle("POST", "/items")
        second = app.handle("POST", "/items")
        # один и тот же singleton: идентификаторы растут
        self.assertEqual(first.body["id"], 1)
        self.assertEqual(second.body["id"], 2)

    def test_state_shared(self):
        app = NanoApp()

        def auth(ctx, next):
            ctx.state["user"] = "ann"
            return next()

        app.use(auth)

        def whoami(ctx):
            return Response(200, ctx.state["user"])

        app.get("/whoami", whoami)
        resp = app.handle("GET", "/whoami")
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.body, "ann")

    def test_error_in_middleware_handled(self):
        app = NanoApp()

        def boom(ctx, next):
            raise ValueError("mw failed")

        app.use(boom)
        app.get("/x", lambda ctx: Response(200, "ok"))

        def on_value_error(ctx, exc):
            return Response(400, {"error": "custom", "message": str(exc)})

        app.on(ValueError, on_value_error)
        before = len(default_logger.records())
        resp = app.handle("GET", "/x")
        self.assertEqual(resp.status, 400)
        self.assertEqual(resp.body["error"], "custom")
        # лог-запись о запросе всё равно появилась
        records = default_logger.records()
        self.assertGreater(len(records), before)
        self.assertEqual(records[-1]["msg"], "GET /x")

    def test_request_logged_always(self):
        app = NanoApp()
        app.get("/ok", lambda ctx: Response(200, "ok"))

        def bad(ctx):
            raise ValueError("nope")

        app.get("/bad", bad)
        before = len(default_logger.records())
        resp_ok = app.handle("GET", "/ok")
        self.assertEqual(resp_ok.status, 200)
        middle = len(default_logger.records())
        self.assertEqual(middle, before + 1)  # успешный запрос залогирован
        resp_bad = app.handle("GET", "/bad")
        self.assertEqual(resp_bad.status, 500)
        records = default_logger.records()
        self.assertEqual(len(records), middle + 1)  # упавший — тоже
        self.assertEqual(records[-1]["msg"], "GET /bad")
        self.assertEqual(records[-1]["status"], 500)

    def test_route_conflict_409_surfaced(self):
        app = NanoApp()
        app.get("/x", lambda ctx: Response(200, "one"))
        with self.assertRaises(RouteConflictError) as cm:
            app.get("/x", lambda ctx: Response(200, "two"))
        self.assertEqual(cm.exception.status, 409)
        self.assertEqual(cm.exception.code, "route_conflict")

    def test_example_from_spec_works(self):
        # Пример из раздела 'Пример использования' спеки (дословно по смыслу)
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
        # бонус-проверка: невалидное тело -> 400 через error handler
        bad = app.handle("POST", "/users", body={"name": "A", "age": 33})
        self.assertEqual(bad.status, 400)


if __name__ == "__main__":
    unittest.main()
