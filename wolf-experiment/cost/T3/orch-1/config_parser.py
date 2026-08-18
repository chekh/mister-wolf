"""Парсер INI-подобных конфигурационных файлов.

Поддерживает секции, пары key=value, комментарии (#), наследование DEFAULT,
автотипизацию значений (bool, int, float, str).

Формат:
  [section]
  key=value
  # comment

Поведение при дубликатах:
  - Повторная секция с тем же именем — объединяется.
  - Повторный ключ в той же секции — последнее значение побеждает.
"""

from __future__ import annotations

from pathlib import Path


# ---------------------------------------------------------------------------
# Исключения
# ---------------------------------------------------------------------------

class ConfigSyntaxError(ValueError):
    """Синтаксическая ошибка в конфиг-файле.

    Attributes:
        line: Номер строки (1-based), где обнаружена ошибка.
    """

    def __init__(self, message: str, line: int) -> None:
        super().__init__(message)
        self.line: int = line


class ConfigUnknownSection(ValueError):
    """Обращение к несуществующей секции.

    Attributes:
        section: Имя запрошенной секции.
    """

    def __init__(self, section: str) -> None:
        super().__init__(f"Неизвестная секция: {section}")
        self.section: str = section


class ConfigMissingKey(ValueError):
    """Отсутствующий ключ в секции (и в DEFAULT).

    Attributes:
        section: Имя секции, в которой искали ключ.
        key: Имя отсутствующего ключа.
        line: Номер строки объявления секции (1-based).
    """

    def __init__(self, section: str, key: str, line: int) -> None:
        super().__init__(f"Ключ '{key}' не найден в секции [{section}] (строка {line})")
        self.section: str = section
        self.key: str = key
        self.line: int = line


# ---------------------------------------------------------------------------
# Парсер
# ---------------------------------------------------------------------------

class Config:
    """INI-подобный парсер конфигурации с автотипизацией."""

    def __init__(self) -> None:
        # section_name -> {key: value}
        self._data: dict[str, dict[str, object]] = {}
        # section_name -> номер строки объявления секции (1-based)
        self._section_lines: dict[str, int] = {}
        # порядок секций (включая DEFAULT)
        self._sections_order: list[str] = []

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @classmethod
    def load(cls, path: str | Path) -> Config:
        """Загрузить конфиг из файла.

        Args:
            path: Путь к конфиг-файлу.

        Returns:
            Экземпляр Config с разобранными данными.

        Raises:
            ConfigSyntaxError: При синтаксической ошибке в файле.
        """
        config = cls()
        file_path = Path(path)
        text = file_path.read_text(encoding="utf-8")
        config._parse(text)
        return config

    def get(
        self, section: str, key: str, default: object = None
    ) -> object:
        """Получить значение с fallback на DEFAULT и default.

        Если секция неизвестна или ключ не найден — вернуть default.
        """
        if section not in self._data:
            return default

        # Ищем в самой секции
        if key in self._data[section]:
            return self._data[section][key]

        # Ищем в DEFAULT
        if "DEFAULT" in self._data and key in self._data["DEFAULT"]:
            return self._data["DEFAULT"][key]

        return default

    def require(self, section: str, key: str) -> object:
        """Получить обязательное значение.

        Raises:
            ConfigUnknownSection: Если секция не существует.
            ConfigMissingKey: Если ключ не найден ни в секции, ни в DEFAULT.
        """
        if section not in self._data:
            raise ConfigUnknownSection(section)

        # Ищем в самой секции
        if key in self._data[section]:
            return self._data[section][key]

        # Ищем в DEFAULT
        if "DEFAULT" in self._data and key in self._data["DEFAULT"]:
            return self._data["DEFAULT"][key]

        line = self._section_lines[section]
        raise ConfigMissingKey(section, key, line)

    # ------------------------------------------------------------------
    # Internal parsing
    # ------------------------------------------------------------------

    def _parse(self, text: str) -> None:
        """Разобрать текст конфига строка за строкой."""
        current_section: str | None = None

        for line_no, raw_line in enumerate(text.splitlines(), start=1):
            line = raw_line.strip()

            # Пустая строка
            if not line:
                continue

            # Комментарий
            if line.startswith("#"):
                continue

            # Секция
            if line.startswith("["):
                self._parse_section(line, line_no)
                current_section = self._sections_order[-1]
                continue

            # key=value
            if current_section is None:
                raise ConfigSyntaxError(
                    f"Пара key=value вне секции (строка {line_no})", line_no
                )

            self._parse_kv(current_section, line, line_no)

    def _parse_section(self, line: str, line_no: int) -> None:
        """Разобрать строку объявления секции [name]."""
        if not line.endswith("]"):
            raise ConfigSyntaxError(
                f"Незакрытая скобка секции (строка {line_no})", line_no
            )

        name = line[1:-1].strip()

        if not name:
            raise ConfigSyntaxError(
                f"Пустое имя секции (строка {line_no})", line_no
            )

        if name in self._data:
            # Повторная секция — объединяем (номер строки оставляем первый)
            pass
        else:
            self._data[name] = {}
            self._section_lines[name] = line_no
            self._sections_order.append(name)

    def _parse_kv(self, section: str, line: str, line_no: int) -> None:
        """Разобрать строку key=value."""
        # Не должно быть `=` — если нет, упадёт в else (общую ошибку)
        eq_pos = line.find("=")
        if eq_pos < 0:
            raise ConfigSyntaxError(
                f"Ожидалось key=value (строка {line_no})", line_no
            )

        key = line[:eq_pos].strip()
        value = line[eq_pos + 1 :].strip()

        if not key:
            raise ConfigSyntaxError(
                f"Пустой ключ (строка {line_no})", line_no
            )

        self._data[section][key] = _autotype(value)

    # ------------------------------------------------------------------
    # Introspection (для отладки / тестов)
    # ------------------------------------------------------------------

    def sections(self) -> list[str]:
        """Вернуть имена секций в порядке появления."""
        return list(self._sections_order)


# ---------------------------------------------------------------------------
# Автотипизация значений
# ---------------------------------------------------------------------------

def _autotype(value: str) -> bool | int | float | str:
    """Автоматически привести строку к подходящему типу.

    1. "true"/"false" (без учёта регистра) → bool
    2. int (включая отрицательные) → int
    3. float (включая отрицательные) → float
    4. иначе → str
    """
    # Bool
    if value.lower() == "true":
        return True
    if value.lower() == "false":
        return False

    # Int (пробуем до float, т.к. int тоже парсится как float)
    try:
        return int(value)
    except ValueError:
        pass

    # Float
    try:
        return float(value)
    except ValueError:
        pass

    # Строка как есть
    return value
