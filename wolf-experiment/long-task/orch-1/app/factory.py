"""Фабрика приложения: собирает swiftframe-приложение из доменных модулей."""
from __future__ import annotations

from frameworks import swiftframe as sf
from app.utils import errors, logging_hook

_MODULES = [
    "app.api.users", "app.api.products", "app.api.orders", "app.api.sessions",
    "app.api.inventory", "app.api.notifications", "app.api.reports",
    "app.api.searches", "app.api.billings", "app.api.shipments",
    "app.api.coupons", "app.api.reviews", "app.api.tickets",
    "app.api.webhooks", "app.api.profiles",
]


def _register_error_hook(app: sf.SwiftApp) -> None:
    def hook(exc: Exception) -> sf.Reply:
        if isinstance(exc, errors.ApiError):
            return sf.fail(exc.status, exc.code, str(exc))
        return sf.fail(500, "internal", str(exc))

    app.on_error(hook)


def create_app() -> sf.SwiftApp:
    """Создаёт приложение со всеми доменами (с сеедом данных)."""
    import importlib

    from app.utils import seed
    seed.run_once()

    app = sf.SwiftApp("long-task-api")
    _register_error_hook(app)
    app.use(logging_hook.log_call)

    def health(req: sf.Request) -> sf.Reply:
        return sf.ok({"status": "ok", "version": "1.0.0"})

    app.add("GET", "/health", health)

    for module_name in _MODULES:
        module = importlib.import_module(module_name)
        module.register(app)
    return app
