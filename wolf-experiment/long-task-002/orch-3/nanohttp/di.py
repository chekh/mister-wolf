"""DI-контейнер (спека §4). Ошибки ResolutionError/CircularDependencyError —
из .errors (канонические определения там)."""

from __future__ import annotations

import inspect
from typing import Any

from .errors import CircularDependencyError, ResolutionError


class Container:
    """register_value / register / singleton / resolve / scope."""

    _VALID_KINDS = ("value", "factory", "singleton")

    def __init__(self, _parent: Container | None = None) -> None:
        self._parent = _parent
        self._values: dict[str, Any] = {}
        self._factories: dict[str, Any] = {}  # name -> callable
        self._singletons: dict[str, Any] = {}  # name -> (factory, cached_value | _UNSET)
        self._singleton_cache: dict[str, Any] = {}  # name -> cached instance
        self._resolving: set[str] = set()

    def register_value(self, name: str, value: Any) -> None:
        self._values[name] = value

    def register(self, name: str, factory: Any) -> None:
        self._factories[name] = factory

    def singleton(self, name: str, factory: Any) -> None:
        self._singletons[name] = factory

    def resolve(self, name: str) -> Any:
        if name in self._resolving:
            raise CircularDependencyError(
                f"circular dependency detected while resolving '{name}'"
            )

        # 1. Check local values
        if name in self._values:
            return self._values[name]

        # 2. Check local factories
        if name in self._factories:
            self._resolving.add(name)
            try:
                kwargs = self._build_kwargs(self._factories[name])
                return self._factories[name](**kwargs)
            finally:
                self._resolving.discard(name)

        # 3. Check local singletons (lazy)
        if name in self._singletons:
            if name in self._singleton_cache:
                return self._singleton_cache[name]
            self._resolving.add(name)
            try:
                kwargs = self._build_kwargs(self._singletons[name])
                instance = self._singletons[name](**kwargs)
                self._singleton_cache[name] = instance
                return instance
            finally:
                self._resolving.discard(name)

        # 4. Delegate to parent
        if self._parent is not None:
            return self._parent.resolve(name)

        raise ResolutionError(f"cannot resolve '{name}'")

    def scope(self) -> Container:
        return Container(_parent=self)

    def _build_kwargs(self, factory: Any) -> dict[str, Any]:
        """Inspect factory signature and resolve each parameter by name."""
        sig = inspect.signature(factory)
        kwargs: dict[str, Any] = {}
        for param_name, param in sig.parameters.items():
            if param_name in ("self", "cls"):
                continue
            try:
                kwargs[param_name] = self.resolve(param_name)
            except ResolutionError:
                if param.default is not inspect.Parameter.empty:
                    # Use default — skip this kwarg
                    pass
                else:
                    raise
        return kwargs
