"""DI-контейнер: внедрение зависимостей по сигнатуре factory (спека, раздел 4)."""

import inspect
from typing import Any, Callable, Optional

from .errors import HttpError


class ResolutionError(HttpError):
    """Имя не зарегистрировано в контейнере (500)."""

    def __init__(self, message: str = "dependency resolution failed") -> None:
        super().__init__(500, "resolution", message)


class CircularDependencyError(HttpError):
    """Цикл в графе зависимостей, например A -> B -> A (500)."""

    def __init__(self, message: str = "circular dependency detected") -> None:
        super().__init__(500, "circular_dependency", message)


class Container:
    """Регистрации: value / factory (новый объект на каждый resolve) /
    singleton (лениво, один объект на контейнер). Внедрение — по именам
    параметров factory (inspect.signature). scope() — дочерний контейнер
    с видимостью регистраций родителя и затенением своими."""

    def __init__(self, parent: Optional["Container"] = None) -> None:
        self._parent = parent
        # name -> ("value", v) | ("factory", f) | ("singleton", f)
        self._registrations: dict[str, tuple[str, Any]] = {}
        self._singletons: dict[str, Any] = {}
        self._resolving: list[str] = []

    def register_value(self, name: str, value: Any) -> None:
        """Зарегистрировать готовое значение (резолвится как есть)."""
        self._registrations[name] = ("value", value)

    def register(self, name: str, factory: Callable[..., Any]) -> None:
        """Factory-режим: новый объект на каждый resolve."""
        self._registrations[name] = ("factory", factory)

    def singleton(self, name: str, factory: Callable[..., Any]) -> None:
        """Singleton-режим: ленивый вызов при первом resolve, далее кэш."""
        self._registrations[name] = ("singleton", factory)

    def resolve(self, name: str) -> Any:
        """Разрешить зависимость: своя регистрация, иначе родитель."""
        if name in self._registrations:
            kind, target = self._registrations[name]
            if kind == "value":
                return target
            if name in self._resolving:
                chain = " -> ".join([*self._resolving, name])
                raise CircularDependencyError(f"resolution cycle: {chain}")
            self._resolving.append(name)
            try:
                if kind == "singleton":
                    if name not in self._singletons:
                        self._singletons[name] = self._instantiate(target)
                    return self._singletons[name]
                return self._instantiate(target)
            finally:
                self._resolving.pop()
        if self._parent is not None:
            return self._parent.resolve(name)
        raise ResolutionError(f"dependency '{name}' is not registered")

    def scope(self) -> "Container":
        """Дочерний контейнер: видит регистрации родителя, свои затеняют;
        singleton-кэш дочернего отдельный от родительского."""
        return Container(parent=self)

    def _contains(self, name: str) -> bool:
        """Зарегистрировано ли имя в этом контейнере или в цепочке родителей."""
        if name in self._registrations:
            return True
        return self._parent is not None and self._parent._contains(name)

    def _instantiate(self, factory: Callable[..., Any]) -> Any:
        """Вызвать factory, внедрив параметры из контейнера по имени
        (кроме self/cls); параметр с дефолтом без регистрации использует
        дефолт; параметр без дефолта без регистрации — ResolutionError."""
        signature = inspect.signature(factory)
        parameters = list(signature.parameters.values())
        kwargs: dict[str, Any] = {}
        for position, parameter in enumerate(parameters):
            if parameter.kind in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD):
                continue
            if position == 0 and parameter.name in ("self", "cls"):
                continue
            if self._contains(parameter.name):
                kwargs[parameter.name] = self.resolve(parameter.name)
            elif parameter.default is not inspect.Parameter.empty:
                continue
            else:
                raise ResolutionError(
                    f"parameter '{parameter.name}' of factory "
                    f"'{getattr(factory, '__name__', repr(factory))}' is not registered"
                )
        return factory(**kwargs)
