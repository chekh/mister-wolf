# Changelog

Все заметные изменения проекта документируются в этом файле.

Формат — [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/), версионирование — [SemVer](https://semver.org/lang/ru/).

## [Unreleased]

## [1.0.1] — 2026-08-31 (tag v1.0.1, ждёт публикации)

### Fixed

- `isNpxRun` принимает `npm_command='exec'` (реальный npx), а не только `'npx'` — `npx mister-wolf init` больше не пишет MCP-конфиг вопреки спеке try-out (4ac8168).

## [1.0.0] — 2026-08-31

Первая публичная версия в npm.

### Added

- npm-пакет `mister-wolf` с бинарем `wolf` (`npm install -g mister-wolf`).
- `wolf init` — идемпотентная неинтерактивная инициализация проекта: скелет `.wolf/` без перезаписи существующего, авто-детект платформ, MCP-конфиги через адаптеры opencode и Claude Code, флаг `--platform`.
- `npx mister-wolf init` — try-out без установки: создаёт память проекта, никогда не пишет MCP-конфиги.
- Ленивая миграция схемы: маркер `schema_version` в `.wolf/config.yaml`, guard при входе (CLI/MCP), миграция с бэкапом под лок-файлом.
- `wolf doctor` — здоровье зарегистрированных проектов: версии схемы, валидность конфигов, чистка мёртвых записей реестра.
- Publish-пайплайн: trusted publishing (OIDC) + provenance, `check`+`e2e` до публикации, sanity-проверка тег↔версия.
- README (agent-first: установка тремя командами, предупреждение тайпсквота) и SECURITY.md.

### Fixed

- Нормализация bin-пути в `package.json` — `npm publish` вырезал бинарник из пакета (2cb1d05).

[Unreleased]: https://github.com/chekh/mister-wolf/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/chekh/mister-wolf/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/chekh/mister-wolf/commits/v1.0.0
