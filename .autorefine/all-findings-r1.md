### Источник: check-placeholders
[
  {
    "severity": "info",
    "location": "Task 1, Step 2",
    "issue": "Шаг описывает 'Run test to verify it fails' без команды и ожидаемого вывода",
    "suggestion": "Добавить команду вида `npx vitest src/utils/csv-formatter.test.ts --reporter=verbose` и ожидаемый FAIL"
  },
  {
    "severity": "info",
    "location": "Task 1, Step 4",
    "issue": "Шаг 'Run test' не содержит ни команды, ни ожидаемого результата",
    "suggestion": "Добавить точную команду запуска тестов и ожидаемый PASS"
  },
  {
    "severity": "info",
    "location": "Task 1, Step 5",
    "issue": "Шаг 'Commit' без команды git-add/git-commit",
    "suggestion": "Добавить `git add src/utils/csv-formatter.ts src/utils/csv-formatter.test.ts && git commit -m \"feat: add CSV formatter utility\"`"
  },
  {
    "severity": "critical",
    "location": "Task 2, Step 1",
    "issue": "Placeholder 'Add appropriate button with click handler' — нет кода, только описание ЧТО, без КАК",
    "suggestion": "Добавить конкретный JSX/TSX-код кнопки с onClick-обработчиком и стилями"
  },
  {
    "severity": "critical",
    "location": "Task 2, Step 2",
    "issue": "Placeholder 'Add appropriate error handling for the export' — прямое нарушение правила 'Add appropriate error handling'",
    "suggestion": "Указать конкретные try/catch блоки, типы ошибок (FileWriteError, DataValidationError) и UX (toast/alert)"
  },
  {
    "severity": "info",
    "location": "Task 2, Step 3",
    "issue": "Шаг 'Commit' без команды",
    "suggestion": "Добавить команду git-commit с сообщением"
  },
  {
    "severity": "warning",
    "location": "Task 3, Step 1",
    "issue": "Импортируется `formatCsv`, но в Task 1 экспортируется `formatCSV` — несоответствие имён",
    "suggestion": "Привести к единому casing: либо `formatCsv` везде, либо `formatCSV` везде"
  },
  {
    "severity": "info",
    "location": "Task 3, Step 2",
    "issue": "Шаг 'Commit' без команды",
    "suggestion": "Добавить команду git-commit с сообщением"
  },
  {
    "severity": "warning",
    "location": "Task 3, Step 1",
    "issue": "Используется `reportData` и `downloadFile`, которые не определены ни в одной задаче",
    "suggestion": "Определить `downloadFile` (утилита или нативный API) и показать источник `reportData`"
  }
]

### Источник: check-types
[
  {
    "severity": "critical",
    "location": "Task 1 vs Task 3",
    "issue": "Task 1 экспортирует formatCSV (прописное CSV), но Task 3 импортирует formatCsv (camelCase). Имя не совпадает — runtime Error (undefined export).",
    "suggestion": "Привести к единому именованию: formatCSV везде (Task 3: { formatCSV }), либо formatCsv везде (Task 1: export function formatCsv)."
  },
  {
    "severity": "critical",
    "location": "Task 3",
    "issue": "Используется функция downloadFile(csv, 'report.csv'), которая не определена и не импортирована ни в одной задаче плана.",
    "suggestion": "Добавить задачу/шаг для реализации или импорта downloadFile (например, создание триггера скачивания через Blob + URL.createObjectURL)."
  },
  {
    "severity": "warning",
    "location": "Task 3",
    "issue": "В formatCsv(reportData) передаётся reportData без указания типа, но formatCSV из Task 1 ожидает string[][]. Если reportData — не string[][], будет несоответствие типов.",
    "suggestion": "Явно указать тип reportData либо добавить шаг трансформации данных перед вызовом formatCSV."
  }
]

