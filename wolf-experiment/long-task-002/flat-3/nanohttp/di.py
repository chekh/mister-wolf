"""DI-контейнер: value / factory / singleton + scope (спека LONG-002, §4)."""
from __future__ import annotations

import inspect
from typing import Any, Callable

from .errors import HttpError


class ResolutionError(HttpError):
    """Имя не зарегистрировано в контейнере (500)."""

    def __init__(self, message: str = "resolution error") -> None:
        super().__init__(500, "resolution", message)


class CircularDependencyError(HttpError):
    """Цикл в графе зависимостей, например A -> B -> A (500)."""

    def __init__(self, message: str = "circular dependency") -> None:
        super().__init__(500, "circular_dependency", message)


class Container:
    """Контейнер зависимостей с внедрением по сигнатуре фабрики.

    Каждый параметр фабрики (кроме *args/**kwargs) резолвится из контейнера
    по имени параметра (inspect.signature). ``register`` — новый объект на
    каждый resolve; ``singleton`` — один объект на контейнер, лениво;
    ``register_value`` — готовое значение.
    """

    def __init__(self, parent: "Container | None" = None) -> None:
        self._parent = parent
        self._registrations: dict[str, tuple[str, Any]] = {}
        self._singleton_cache: dict[str, Any] = {}

    def register_value(self, name: str, value: Any) -> None:
        """Зарегистрировать готовое значение."""
        self._registrations[name] = ("value", value)

    def register(self, name: str, factory: Callable[..., Any]) -> None:
        """Зарегистрировать фабрику: вызов на каждый resolve."""
        self._registrations[name] = ("factory", factory)

    def singleton(self, name: str, factory: Callable[..., Any]) -> None:
        """Зарегистрировать фабрику-синглтон: лениво, один объект на контейнер."""
        self._registrations[name] = ("singleton", factory)

    def scope(self) -> "Container":
        """Дочерний контейнер: видит регистрации родителя, свои — затеняют."""
        return Container(parent=self)

    def resolve(self, name: str) -> Any:
        """Разрешить зависимость по имени."""
        return self._resolve(name, [])

    def _resolve(self, name: str, stack: list[str]) -> Any:
        if name in stack:  # цикл в графе зависимостей
            chain = " -> ".join([*stack, name])
            raise CircularDependencyError(f"circular dependency: {chain}")
        if name in self._registrations:
            kind, target = self._registrations[name]
            if kind == "value":
                return target
            if kind == "singleton" and name in self._singleton_cache:
                return self._singleton_cache[name]
            result = self._invoke_factory(target, [*stack, name])
            if kind == "singleton":
                self._singleton_cache[name] = result
            return result
        if self._parent is not None:
            return self._parent._resolve(name, stack)
        raise ResolutionError(f"nothing registered under name {name!r}")

    def _invoke_factory(self, factory: Callable[..., Any], stack: list[str]) -> Any:
        """Вызвать фабрику, внедрив параметры по именам из контейнера."""
        kwargs: dict[str, Any] = {}
        for param_name, param in inspect.signature(factory).parameters.items():
            if param.kind in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD):
                continue
            try:
                kwargs[param_name] = self._resolve(param_name, stack)
            except ResolutionError:
                if param.default is not inspect.Parameter.empty:
                    continue  # есть дефолт — оставляем его фабрике
                raise
        return factory(**kwargs)
