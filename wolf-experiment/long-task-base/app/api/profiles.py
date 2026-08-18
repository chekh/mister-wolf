"""Домен profiles: эндпоинты на miniframe (миграция на swiftframe затронет файл)."""
from __future__ import annotations

from frameworks import miniframe as mf
from app.utils import access, ids
from app.utils.clock import now
from app.utils.errors import ConflictError
from app.utils.store import find_by, get_or_404, insert, update as store_update
from app.utils.validation import FIELDS_PROFILES, validate

DOMAIN = "profiles"


def register(app: mf.MiniApp) -> None:
    """Регистрирует маршруты домена profiles."""

    @app.route("POST", f"/{DOMAIN}")
    def create(params: dict[str, str], body: dict) -> mf.Response:
        """Создаёт запись: RBAC -> валидация -> unique-проверка -> вставка (201)."""
        access.require(DOMAIN, "create", body)
        data = validate(body, FIELDS_PROFILES, partial=False)
        if find_by(DOMAIN, "login", data["login"]) is not None:
            raise ConflictError(DOMAIN, f"duplicate login={data['login']}")
        stamp = now()
        item = insert(DOMAIN, {**data, "revision": 1, "created_at": stamp, "updated_at": stamp})
        return mf.Response(201, item)

    @app.route("GET", f"/{DOMAIN}/{{id}}")
    def get_one(params: dict[str, str], body: dict) -> mf.Response:
        """Возвращает запись по id (404 при отсутствии/невалидном id)."""
        access.require(DOMAIN, "read", body)
        item = get_or_404(DOMAIN, ids.to_id(DOMAIN, params["id"]))
        return mf.Response(200, item)

    @app.route("PATCH", f"/{DOMAIN}/{{id}}")
    def patch_one(params: dict[str, str], body: dict) -> mf.Response:
        """Частично обновляет запись: RBAC -> валидация -> 404 -> update (+revision)."""
        access.require(DOMAIN, "update", body)
        changes = validate(body, FIELDS_PROFILES, partial=True)
        item_id = ids.to_id(DOMAIN, params["id"])
        current = get_or_404(DOMAIN, item_id)
        item = store_update(DOMAIN, item_id, {**changes, "revision": current["revision"] + 1, "updated_at": now()})
        return mf.Response(200, item)
