"""Домен webhooks: эндпоинты на swiftframe (мигрирован с miniframe)."""
from __future__ import annotations

from frameworks import swiftframe as sf
from app.utils import access, ids
from app.utils.clock import now
from app.utils.errors import ConflictError
from app.utils.store import find_by, get_or_404, insert, update as store_update
from app.utils.validation import FIELDS_WEBHOOKS, validate

DOMAIN = "webhooks"


def create(req: sf.Request) -> sf.Reply:
    """Создаёт запись: RBAC -> валидация -> unique-проверка -> вставка (201)."""
    body = req.body
    access.require(DOMAIN, "create", body)
    data = validate(body, FIELDS_WEBHOOKS, partial=False)
    if find_by(DOMAIN, "url", data["url"]) is not None:
        raise ConflictError(DOMAIN, f"duplicate url={data['url']}")
    stamp = now()
    item = insert(DOMAIN, {**data, "revision": 1, "created_at": stamp, "updated_at": stamp})
    return sf.created(item)


def get_one(req: sf.Request) -> sf.Reply:
    """Возвращает запись по id (404 при отсутствии/невалидном id)."""
    access.require(DOMAIN, "read", req.body)
    item = get_or_404(DOMAIN, ids.to_id(DOMAIN, req.params["id"]))
    return sf.ok(item)


def patch_one(req: sf.Request) -> sf.Reply:
    """Частично обновляет запись: RBAC -> валидация -> 404 -> update (+revision)."""
    body = req.body
    access.require(DOMAIN, "update", body)
    changes = validate(body, FIELDS_WEBHOOKS, partial=True)
    item_id = ids.to_id(DOMAIN, req.params["id"])
    current = get_or_404(DOMAIN, item_id)
    item = store_update(DOMAIN, item_id, {**changes, "revision": current["revision"] + 1, "updated_at": now()})
    return sf.ok(item)


def register(app: sf.SwiftApp) -> None:
    """Регистрирует маршруты домена webhooks (явная регистрация swiftframe)."""
    app.add("POST", f"/{DOMAIN}", create)
    app.add("GET", f"/{DOMAIN}/{{id}}", get_one)
    app.add("PATCH", f"/{DOMAIN}/{{id}}", patch_one)
