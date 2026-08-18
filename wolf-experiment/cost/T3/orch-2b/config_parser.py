"""Модуль парсера INI-подобных конфигурационных файлов.

Поддерживает:
- Секции [имя], пары key=value.
- Секция [DEFAULT] наследуется всеми остальными.
- Комментарии (#) и пустые строки.
- Автотипизация значений: int, float, bool (true/false, регистронезависимо), str.
"""

from __future__ import annotations


class ConfigError(Exception):
    """Базовое исключение для всех ошибок конфигурации."""


class ConfigSyntaxError(ConfigError):
    """Синтаксическая ошибка в конфигурационном файле."""

    def __init__(self, message: str, line: int) -> None:
        self.line = line
        super().__init__(f"Syntax error at line {line}: {message}")


class ConfigUnknownSection(ConfigError):
    """Обращение к несуществующей секции."""

    def __init__(self, section: str, key: str | None = None, line: int | None = None) -> None:
        self.section = section
        self.key = key
        self.line = line
        detail = f"section '{section}'"
        if key is not None:
            detail += f", key '{key}'"
        if line is not None:
            detail += f", line {line}"
        super().__init__(f"Unknown {detail}")


class ConfigMissingKey(ConfigError):
    """Отсутствующий обязательный ключ."""

    def __init__(self, section: str, key: str) -> None:
        self.section = section
        self.key = key
        super().__init__(f"Missing key '{key}' in section '{section}'")


def _auto_type(value: str) -> int | float | bool | str:
    """Автотипизация строкового значения."""
    # bool (регистронезависимо)
    if value.lower() == "true":
        return True
    if value.lower() == "false":
        return False
    # int (включая отрицательные)
    try:
        return int(value)
    except ValueError:
        pass
    # float (включая отрицательные)
    try:
        return float(value)
    except ValueError:
        pass
    # str
    return value


class Config:
    """Парсер INI-подобных конфигурационных файлов с наследованием DEFAULT."""

    def __init__(self) -> None:
        self._sections: dict[str, dict[str, int | float | bool | str]] = {}

    @classmethod
    def load(cls, path: str) -> Config:
        """Загружает конфигурацию из файла."""
        cfg = cls()
        current_section: str | None = None

        with open(path, "r", encoding="utf-8") as f:
            for line_num, raw_line in enumerate(f, start=1):
                line = raw_line.strip()

                # Пустая строка — пропускаем
                if not line:
                    continue

                # Комментарий — пропускаем
                if line.startswith("#"):
                    continue

                # Секция [name]
                if line.startswith("["):
                    if not line.endswith("]"):
                        raise ConfigSyntaxError(
                            f"Unclosed section header: '{line}'",
                            line=line_num,
                        )
                    section_name = line[1:-1].strip()
                    if not section_name:
                        raise ConfigSyntaxError(
                            "Empty section name",
                            line=line_num,
                        )
                    current_section = section_name
                    if current_section not in cfg._sections:
                        cfg._sections[current_section] = {}
                    continue

                # key=value
                if "=" in line:
                    key, _, value = line.partition("=")
                    key = key.strip()
                    value = value.strip()
                    if not key:
                        raise ConfigSyntaxError(
                            f"Empty key in assignment: '{line}'",
                            line=line_num,
                        )
                    if current_section is None:
                        raise ConfigSyntaxError(
                            f"Key-value pair outside any section: '{line}'",
                            line=line_num,
                        )
                    cfg._sections[current_section][key] = _auto_type(value)
                    continue

                # Ничего из вышеописанного — синтаксическая ошибка
                raise ConfigSyntaxError(
                    f"Unexpected content: '{line}'",
                    line=line_num,
                )

        return cfg

    def get(
        self,
        section: str,
        key: str,
        default: int | float | bool | str | None = None,
    ) -> int | float | bool | str | None:
        """Возвращает значение ключа секции с учётом наследования DEFAULT.

        Если секция или ключ (с учётом наследования) не найдены — возвращает default.
        """
        if section not in self._sections:
            return default

        sec_data = self._sections[section]

        # Ключ найден в самой секции
        if key in sec_data:
            return sec_data[key]

        # Наследование из DEFAULT
        if "DEFAULT" in self._sections and key in self._sections["DEFAULT"]:
            return self._sections["DEFAULT"][key]

        return default

    def require(self, section: str, key: str) -> int | float | bool | str:
        """Возвращает значение ключа секции, бросая исключение при отсутствии.

        Если секция не существует — ConfigUnknownSection.
        Если ключ не найден ни в секции, ни в DEFAULT — ConfigMissingKey.
        """
        if section not in self._sections:
            raise ConfigUnknownSection(section=section, key=key)

        # Ключ найден в самой секции
        if key in self._sections[section]:
            return self._sections[section][key]

        # Наследование из DEFAULT
        if "DEFAULT" in self._sections and key in self._sections["DEFAULT"]:
            return self._sections["DEFAULT"][key]

        # Ключ не найден
        raise ConfigMissingKey(section=section, key=key)
