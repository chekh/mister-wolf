"""Доменные ошибки API (общие для обоих фреймворков)."""
from __future__ import annotations


class ApiError(Exception):
    """Базовая ошибка: фреймворковый хук переводит её в HTTP-статус."""

    status = 500
    code = "api"

    def __init__(self, domain: str, detail: str = "") -> None:
        super().__init__(f"{self.code} in {domain}: {detail}")
        self.domain = domain
        self.detail = detail


class ValidationError(ApiError):
    status, code = 400, "validation"


class ConflictError(ApiError):
    status, code = 409, "conflict"


class NotFoundError(ApiError):
    status, code = 404, "not_found"


class ForbiddenError(ApiError):
    status, code = 403, "forbidden"
