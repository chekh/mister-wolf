"""Модуль внедрения зависимостей (DI) фреймворка nanohttp.

Предоставляет контейнер для регистрации и разрешения зависимостей
с поддержкой фабричного и синглтон-режимов, внедрением по сигнатуре
и иерархией скоупов (дочерних контейнеров).
"""

from __future__ import annotations

import inspect
from typing import Any, Callable

from .errors import HttpError


class ResolutionError(HttpError):
    """Ошибка разрешения зависимости: имя не зарегистрировано."""

    def __init__(self, name: str | None = None) -> None:
        message: str = f"Resolution failed: '{name}'" if name else "Resolution failed"
        super().__init__(status=500, code="resolution", message=message)


class CircularDependencyError(HttpError):
    """Ошибка циклической зависимости при resolve."""

    def __init__(self, name: str | None = None) -> None:
        message: str = (
            f"Circular dependency: '{name}'"
            if name
            else "Circular dependency"
        )
        super().__init__(status=500, code="circular_dependency", message=message)


# Режимы регистрации
_VALUE = "value"
_FACTORY = "factory"
_SINGLETON = "singleton"

# Элемент реестра: (режим, factory_or_value)
_RegistryEntry = tuple[str, Any]


class Container:
    """Контейнер внедрения зависимостей.

    Поддерживает три режима регистрации:
    - register_value: фиксированное значение;
    - register: фабрика, вызываемая на каждый resolve (новые объекты);
    - singleton: фабрика, вызываемая лениво при первом resolve,
      результат кэшируется.

    Разрешение по сигнатуре: параметры фабрики (кроме self/cls)
    автоматически резолвятся из контейнера по имени параметра.

    Иерархия: дочерний контейнер (scope) видит регистрации родителя,
    собственные регистрации затеняют родительские. Singleton-кэш
    дочернего отдельный от родительского.
    """

    def __init__(self, parent: Container | None = None) -> None:
        self._parent: Container | None = parent
        self._registry: dict[str, _RegistryEntry] = {}
        self._singleton_cache: dict[str, Any] = {}

    # ------------------------------------------------------------------
    # Регистрация
    # ------------------------------------------------------------------

    def register_value(self, name: str, value: Any) -> None:
        """Зарегистрировать фиксированное значение."""
        self._registry[name] = (_VALUE, value)

    def register(self, name: str, factory: Callable[..., Any]) -> None:
        """Зарегистрировать фабрику: новый объект на каждый resolve."""
        self._registry[name] = (_FACTORY, factory)

    def singleton(self, name: str, factory: Callable[..., Any]) -> None:
        """Зарегистрировать синглтон: фабрика вызывается лениво при первом resolve."""
        self._registry[name] = (_SINGLETON, factory)

    # ------------------------------------------------------------------
    # Скоуп
    # ------------------------------------------------------------------

    def scope(self) -> Container:
        """Создать дочерний контейнер, видящий регистрации этого."""
        return Container(parent=self)

    # ------------------------------------------------------------------
    # Разрешение
    # ------------------------------------------------------------------

    def _find_entry(self, name: str) -> _RegistryEntry | None:
        """Найти запись в реестре, включая цепочку родителей."""
        if name in self._registry:
            return self._registry[name]
        if self._parent is not None:
            return self._parent._find_entry(name)
        return None

    def resolve(self, name: str, _stack: list[str] | None = None) -> Any:
        """Разрешить зависимость по имени.

        Args:
            name: Имя зависимости.
            _stack: Внутренний стек имён для обнаружения циклов.

        Returns:
            Разрешённый объект.

        Raises:
            ResolutionError: имя не зарегистрировано.
            CircularDependencyError: обнаружен цикл в графе зависимостей.
        """
        if _stack is None:
            _stack = []

        # Проверка на цикл
        if name in _stack:
            raise CircularDependencyError(name)

        entry = self._find_entry(name)
        if entry is None:
            raise ResolutionError(name)

        mode, payload = entry

        if mode == _VALUE:
            return payload

        # Варианты с фабрикой
        factory: Callable[..., Any] = payload

        if mode == _SINGLETON:
            # Ленивый кэш: проверяем только собственный кэш
            if name in self._singleton_cache:
                return self._singleton_cache[name]
            instance = self._invoke(factory, _stack + [name])
            self._singleton_cache[name] = instance
            return instance

        # mode == _FACTORY
        return self._invoke(factory, _stack + [name])

    # ------------------------------------------------------------------
    # Внутренние утилиты
    # ------------------------------------------------------------------

    def _invoke(
        self, factory: Callable[..., Any], stack: list[str]
    ) -> Any:
        """Вызвать фабрику, подставив зависимости по сигнатуре."""
        sig = inspect.signature(factory)
        kwargs: dict[str, Any] = {}

        for param_name, param in sig.parameters.items():
            # Пропускаем self/cls
            if param_name in ("self", "cls"):
                continue

            # Пытаемся резолвить из контейнера
            try:
                kwargs[param_name] = self.resolve(param_name, stack)
            except ResolutionError:
                # Если есть default — используем его
                if param.default is not inspect.Parameter.empty:
                    kwargs[param_name] = param.default
                else:
                    raise

        return factory(**kwargs)
