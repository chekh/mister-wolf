"""RBAC: роли и права по доменам (общие для обоих фреймворков)."""
from __future__ import annotations

from app.utils.errors import ForbiddenError

ALLOWED: dict[tuple[str, str], set[str]] = {
    ("*", "read"): {"admin", "editor", "viewer"},
    ("*", "create"): {"admin", "editor"},
    ("*", "update"): {"admin", "editor"},
}


def require(domain: str, action: str, body: dict) -> str:
    """Проверяет роль из body['_actor_role'] (по умолчанию admin)."""
    role = str(body.get("_actor_role", "admin"))
    allowed = ALLOWED.get((domain, action), ALLOWED.get(("*", action), set()))
    if role not in allowed:
        raise ForbiddenError(domain, f"role={role} cannot {action}")
    return role
