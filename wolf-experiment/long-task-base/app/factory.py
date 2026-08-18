"""Фабрика приложения: собирает miniframe-приложение из доменных модулей."""
from __future__ import annotations

from frameworks import miniframe as mf
from app.utils import errors

_MODULES = [
    "app.api.users", "app.api.products", "app.api.orders", "app.api.sessions",
    "app.api.inventory", "app.api.notifications", "app.api.reports",
    "app.api.searches", "app.api.billings", "app.api.shipments",
    "app.api.coupons", "app.api.reviews", "app.api.tickets",
    "app.api.webhooks", "app.api.profiles",
]


def _register_error_hook(app: mf.MiniApp) -> None:
    @app.error_handler
    def hook(exc: Exception) -> mf.Response:
        if isinstance(exc, errors.ApiError):
            return mf.Response(exc.status, {"error": exc.code, "message": str(exc)})
        return mf.Response(500, {"error": "internal", "message": str(exc)})


def create_app() -> mf.MiniApp:
    """Создаёт приложение со всеми доменами (с сеедом данных)."""
    import importlib

    from app.utils import seed
    seed.run_once()

    app = mf.MiniApp("long-task-api")
    _register_error_hook(app)

    @app.route("GET", "/health")
    def health(params: dict[str, str], body: dict) -> mf.Response:
        return mf.Response(200, {"status": "ok", "version": "1.0.0"})

    for module_name in _MODULES:
        module = importlib.import_module(module_name)
        module.register(app)
    return app
