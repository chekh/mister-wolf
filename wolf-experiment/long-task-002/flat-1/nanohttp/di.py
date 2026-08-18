"""DI-контейнер nanohttp.

Режимы регистрации:
- ``register_value`` — готовое значение;
- ``register`` — factory, новый объект на каждый resolve;
- ``singleton`` — factory один раз на контейнер, лениво.

Внедрение зависимостей — по сигнатуре factory (inspect.signature):
каждый именованный параметр (кроме self/cls и *args/**kwargs)
резолвится из контейнера по имени параметра.
"""

import inspect

from .errors import HttpError


class ResolutionError(HttpError):
    """500 resolution — имя не зарегистрировано в контейнере."""

    def __init__(self, message="cannot resolve dependency"):
        super().__init__(500, "resolution", message)


class CircularDependencyError(HttpError):
    """500 circular_dependency — цикл в графе зависимостей."""

    def __init__(self, message="circular dependency detected"):
        super().__init__(500, "circular_dependency", message)


class Container:
    """Контейнер зависимостей с поддержкой дочерних scope."""

    def __init__(self, parent=None):
        self._parent = parent
        self._registrations = {}  # name -> (kind, target)
        self._singletons = {}  # кэш singleton'ов ЭТОГО контейнера
        self._resolving = []  # стек имён для детекции циклов

    def register_value(self, name, value):
        """Зарегистрировать готовое значение."""
        self._registrations[name] = ("value", value)

    def register(self, name, factory):
        """Зарегистрировать factory (новый объект на каждый resolve)."""
        self._registrations[name] = ("factory", factory)

    def singleton(self, name, factory):
        """Зарегистрировать factory как singleton (лениво, один на контейнер)."""
        self._registrations[name] = ("singleton", factory)

    def scope(self):
        """Дочерний контейнер: видит регистрации родителя, свои
        регистрации затеняют родительские, singleton-кэш отдельный."""
        return Container(parent=self)

    def resolve(self, name):
        """Разрешить зависимость по имени.

        Raises:
            CircularDependencyError: имя уже в стеке резолва (цикл).
            ResolutionError: имя нигде не зарегистрировано.
        """
        if name in self._resolving:
            chain = " -> ".join([*self._resolving, name])
            raise CircularDependencyError(f"circular dependency: {chain}")
        kind, target = self._find(name)
        if kind == "value":
            return target
        self._resolving.append(name)
        try:
            if kind == "factory":
                return self._invoke(target)
            if name not in self._singletons:
                self._singletons[name] = self._invoke(target)
            return self._singletons[name]
        finally:
            self._resolving.pop()

    def _find(self, name):
        container = self
        while container is not None:
            if name in container._registrations:
                kind, target = container._registrations[name]
                return kind, target
            container = container._parent
        raise ResolutionError(f"no registration for {name!r}")

    def _invoke(self, factory):
        """Вызвать factory, внедрив зависимости по именам параметров."""
        kwargs = {}
        first = True
        for param_name, param in inspect.signature(factory).parameters.items():
            if param.kind in (
                inspect.Parameter.VAR_POSITIONAL,
                inspect.Parameter.VAR_KEYWORD,
            ):
                continue
            if first and param_name in ("self", "cls"):
                first = False
                continue
            first = False
            kwargs[param_name] = self.resolve(param_name)
        return factory(**kwargs)
