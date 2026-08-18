"""di — контейнер зависимостей (spec.md §4)."""

from __future__ import annotations

import inspect
from enum import Enum, auto
from typing import Any, Callable

from .errors import HttpError


class _RegistrationMode(Enum):
    VALUE = auto()
    FACTORY = auto()
    SINGLETON = auto()


class _Registration:
    __slots__ = ("mode", "factory", "value", "cached")

    def __init__(self, *, mode: _RegistrationMode, factory: Callable | None = None, value: Any = None) -> None:
        self.mode = mode
        self.factory = factory
        self.value = value
        self.cached: Any = _UNSET

    def resolve(self, container: Container, name: str, resolving: set[str]) -> Any:
        if self.mode is _RegistrationMode.VALUE:
            return self.value
        if self.mode is _RegistrationMode.FACTORY:
            return _call_with_deps(self.factory, container, resolving)
        # SINGLETON
        if self.cached is not _UNSET:
            return self.cached
        obj = _call_with_deps(self.factory, container, resolving)
        self.cached = obj
        return obj


class _UnsetSentinel:
    """Уникальный маркер отсутствующего значения."""
    def __repr__(self) -> str:
        return "<UNSET>"


_UNSET = _UnsetSentinel()


class ResolutionError(HttpError):
    """Имя не зарегистрировано в контейнере."""

    def __init__(self, message: str = "resolution") -> None:
        super().__init__(500, "resolution", message)


class CircularDependencyError(HttpError):
    """Циклическая зависимость при разрешении."""

    def __init__(self, message: str = "circular_dependency") -> None:
        super().__init__(500, "circular_dependency", message)


def _call_with_deps(factory: Callable, container: Container, resolving: set[str]) -> Any:
    """Вызвать factory, внедряя аргументы по именам параметров."""
    sig = inspect.signature(factory)
    kwargs: dict[str, Any] = {}
    for param_name, param in sig.parameters.items():
        kind = param.kind
        if kind in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD):
            continue
        if param_name in container._registrations or param_name in (container._parent._registrations if container._parent else ()):
            # Резолвим через внутренний метод, сохраняя стек resolving
            kwargs[param_name] = container._resolve_internal(param_name, resolving)
        elif param.default is not inspect.Parameter.empty:
            # Используем дефолт
            continue
        else:
            raise ResolutionError(f"Cannot resolve dependency '{param_name}'")
    return factory(**kwargs)


class Container:
    """Простой контейнер внедрения зависимостей."""

    def __init__(self, parent: Container | None = None) -> None:
        self._registrations: dict[str, _Registration] = {}
        self._parent: Container | None = parent

    def register_value(self, name: str, value: Any) -> None:
        """Зарегистрировать готовое значение."""
        self._registrations[name] = _Registration(mode=_RegistrationMode.VALUE, value=value)

    def register(self, name: str, factory: Callable) -> None:
        """Зарегистрировать фабрику (новый объект на каждый resolve)."""
        self._registrations[name] = _Registration(mode=_RegistrationMode.FACTORY, factory=factory)

    def singleton(self, name: str, factory: Callable) -> None:
        """Зарегистрировать фабрику в singleton-режиме (ленивый кэш)."""
        self._registrations[name] = _Registration(mode=_RegistrationMode.SINGLETON, factory=factory)

    def resolve(self, name: str) -> Any:
        """Разрешить зависимость по имени."""
        return self._resolve_internal(name, set())

    def _resolve_internal(self, name: str, resolving: set[str]) -> Any:
        # Поиск регистрации: сначала у себя, потом у родителя
        reg = self._registrations.get(name)
        if reg is None and self._parent is not None:
            reg = self._parent._registrations.get(name)
        if reg is None:
            raise ResolutionError(f"No registration for '{name}'")
        # Проверка цикла
        if name in resolving:
            raise CircularDependencyError(f"Circular dependency detected: {name}")
        resolving = resolving | {name}
        return reg.resolve(self, name, resolving)

    def scope(self) -> Container:
        """Создать дочерний контейнер (видит регистрации родителя)."""
        return Container(parent=self)
