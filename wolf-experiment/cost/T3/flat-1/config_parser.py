# -*- coding: utf-8 -*-
"""Парсер конфигурационных файлов.

Формат:
    [СЕКЦИЯ]
    key = value

    [DEFAULT]            — секция, наследуемая всеми остальными секциями;
    # комментарий         — строки-комментарии игнорируются;
    (пустые строки)      — игнорируются.

Значения автотипизируются: int, float, bool (true/false), иначе str.

Ошибки:
    ConfigSyntaxError   — синтаксическая ошибка (с номером строки);
    ConfigUnknownSection — обращение к несуществующей секции;
    ConfigMissingKey    — отсутствующий ключ в существующей секции.

API:
    cfg = Config.load(path)
    cfg.get(section, key, default=None)
    cfg.require(section, key)
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Optional, Tuple

__all__ = [
    "Config",
    "ConfigError",
    "ConfigSyntaxError",
    "ConfigUnknownSection",
    "ConfigMissingKey",
]

DEFAULT_SECTION = "DEFAULT"
_TRUE = "true"
_FALSE = "false"


class ConfigError(Exception):
    """Базовый класс ошибок конфигурации."""


class ConfigSyntaxError(ConfigError):
    """Синтаксическая ошибка в конфигурационном файле.

    Attributes:
        line_no: номер строки (1-based), в которой обнаружена ошибка.
    """

    def __init__(self, message: str, line_no: int) -> None:
        super().__init__(f"строка {line_no}: {message}")
        self.line_no = line_no


class ConfigUnknownSection(ConfigError):
    """Обращение к несуществующей секции."""

    def __init__(self, section: str) -> None:
        super().__init__(f"неизвестная секция: [{section}]")
        self.section = section


class ConfigMissingKey(ConfigError):
    """Отсутствующий ключ в существующей секции.

    Attributes:
        section: секция, в которой искали ключ (не обязательно источник).
        key: искомый ключ.
        origin: (источник, строка) откуда взято значение, если ключ найден
            через наследование DEFAULT; иначе None.
    """

    def __init__(
        self,
        section: str,
        key: str,
        origin: Optional[Tuple[str, int]] = None,
    ) -> None:
        if origin is not None:
            src, line_no = origin
            msg = (
                f"в секции [{section}] нет ключа '{key}' "
                f"(унаследован из [{src}], строка {line_no})"
            )
        else:
            msg = f"в секции [{section}] нет ключа '{key}'"
        super().__init__(msg)
        self.section = section
        self.key = key
        self.origin = origin


def _autotype(raw: str) -> Any:
    """Автотипизация строкового значения.

    Порядок: bool (true/false, без учёта регистра) -> int -> float -> str.
    Отрицательные и положительные числа поддерживаются.
    Значение обрезается от пробелов по краям до типизации.
    """
    value = raw.strip()
    lowered = value.lower()
    if lowered == _TRUE:
        return True
    if lowered == _FALSE:
        return False
    try:
        return int(value)
    except ValueError:
        pass
    try:
        return float(value)
    except ValueError:
        pass
    return value


class Config:
    """Загруженная конфигурация с поддержкой наследования [DEFAULT]."""

    def __init__(
        self,
        sections: Dict[str, Dict[str, Any]],
        origins: Dict[Tuple[str, str], int],
    ) -> None:
        self._sections = sections
        self._origins = origins

    # ------------------------------------------------------------------ load

    @classmethod
    def load(cls, path: str) -> "Config":
        """Загрузить конфигурацию из файла.

        Args:
            path: путь к конфигурационному файлу.

        Returns:
            Config: разобранная конфигурация.

        Raises:
            ConfigSyntaxError: при синтаксической ошибке (с номером строки).
            OSError: если файл не читается.
        """
        sections: Dict[str, Dict[str, Any]] = {}
        origins: Dict[Tuple[str, str], int] = {}
        current: Optional[str] = None

        text = Path(path).read_text(encoding="utf-8")
        for line_no, raw_line in enumerate(text.splitlines(), start=1):
            line = raw_line.strip()

            if not line or line.startswith("#"):
                continue  # пустые строки и комментарии

            if line.startswith("["):
                if not line.endswith("]") or len(line) < 3:
                    raise ConfigSyntaxError(
                        f"некорректный заголовок секции: {line!r}", line_no
                    )
                current = line[1:-1].strip()
                if not current:
                    raise ConfigSyntaxError(
                        "пустое имя секции", line_no
                    )
                sections.setdefault(current, {})
                continue

            if current is None:
                raise ConfigSyntaxError(
                    f"ключ вне секции: {line!r}", line_no
                )

            if "=" not in line:
                raise ConfigSyntaxError(
                    f"ожидается 'key = value', получено: {line!r}", line_no
                )

            key, _, value = line.partition("=")
            key = key.strip()
            if not key:
                raise ConfigSyntaxError("пустое имя ключа", line_no)

            sections[current][key] = _autotype(value)
            origins[(current, key)] = line_no

        return cls(sections, origins)

    # ------------------------------------------------------------------ read

    def _resolve(
        self, section: str, key: str
    ) -> Tuple[str, Any, int]:
        """Найти ключ в секции, затем в DEFAULT.

        Returns:
            Кортеж (источник, значение, номер строки).

        Raises:
            ConfigUnknownSection: если секции нет (DEFAULT не обязан
                существовать, если не объявлен).
            ConfigMissingKey: если ключ не найден нигде.
        """
        if section in self._sections:
            if key in self._sections[section]:
                return section, self._sections[section][key], self._origins[
                    (section, key)
                ]
            if DEFAULT_SECTION in self._sections and key in self._sections[
                DEFAULT_SECTION
            ]:
                return (
                    DEFAULT_SECTION,
                    self._sections[DEFAULT_SECTION][key],
                    self._origins[(DEFAULT_SECTION, key)],
                )
            raise ConfigMissingKey(section, key)
        raise ConfigUnknownSection(section)

    def get(
        self, section: str, key: str, default: Any = None
    ) -> Any:
        """Получить значение ключа в секции (с наследованием DEFAULT).

        Args:
            section: имя секции.
            key: имя ключа.
            default: значение по умолчанию, если ключ или секция не найдены.

        Returns:
            Типизированное значение, либо default.
        """
        try:
            _, value, _ = self._resolve(section, key)
            return value
        except ConfigError:
            return default

    def require(self, section: str, key: str) -> Any:
        """Получить обязательное значение ключа в секции.

        Args:
            section: имя секции.
            key: имя ключа.

        Returns:
            Типизированное значение.

        Raises:
            ConfigUnknownSection: если секция не существует.
            ConfigMissingKey: если секция существует, но ключа нет
                (ни в секции, ни в DEFAULT).
        """
        _, value, _ = self._resolve(section, key)
        return value
