# Дистрибуция и инсталляция Mr.Wolf — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Публиковать Wolf как npm-пакет `mister-wolf` с установкой «три команды» (`npm install -g mister-wolf` → `wolf init` → `wolf bootstrap`), идемпотентным init с адаптерами платформ (opencode, Claude Code) и ленивой миграцией схемы.

**Architecture:** Три уровня инсталляции (машина/проект/время): глобальный бинарь `wolf` при установке ничего не пишет; `wolf init` идемпотентно создаёт скелет `.wolf/`, пишет MCP-конфиги через адаптеры платформ (детект по файлам-маркерам, каноническая команда `{command: 'wolf', args: ['mcp']}`) и регистрирует проект в XDG-реестре; рассинхрон версий решает ленивая миграция под эксклюзивным `.wolf/migrate.lock` с маркером `schema_version` в config.yaml. Публикация — trusted publishing (OIDC) с sanity тег↔версия и e2e публикуемого артефакта.

**Tech Stack:** TypeScript (ESM, tsc), Node ≥22, commander (CLI), js-yaml, better-sqlite3 ^13 (prebuilt), @modelcontextprotocol/server ^2.0.0 (stable), vitest (unit + e2e), GitHub Actions (OIDC trusted publishing).

---

## Верифицированные факты (проверены в коде 2026-08-30, HEAD dev a917de7)

| Факт                                                                                                                                                                                                                                                                              | Где                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `bootstrapProject` бросает `UserFacingError('Project is not initialized: сначала wolf init')` без `.wolf/config.yaml`                                                                                                                                                             | `src/app/use-cases/bootstrap-project.ts:55-58`   |
| `FsProjectInitializer.initialize` безусловно перезаписывает `config.yaml` — баг перезаписи                                                                                                                                                                                        | `src/adapters/fs/fs-project-initializer.ts:13`   |
| Точки входа: `src/bootstrap/cli.ts` (shebang, вызывает `runCli`) и `src/bootstrap/mcp.ts` (`serveStdio` из `@modelcontextprotocol/server/stdio`)                                                                                                                                  | оба файла                                        |
| `runCli` ловит `UserFacingError` → `Error: <msg>`, exit 1; команды регистрируются в `createCli()`                                                                                                                                                                                 | `src/adapters/cli/cli-entry.ts:96-106`           |
| `wolf init` уже существует как заглушка (initializer + одна строка вывода)                                                                                                                                                                                                        | `src/adapters/cli/commands/memory-init.ts`       |
| `wolf mcp` спавнит `dist/bootstrap/mcp.js` — канонический `McpCommand = { command: 'wolf', args: ['mcp'] }` корректен                                                                                                                                                             | `src/adapters/cli/commands/memory-mcp.ts`        |
| Паттерн команд: `new Command('name').option(...).action(async (options) => ...)` + `createCliContainer(process.cwd())`                                                                                                                                                            | `src/adapters/cli/commands/memory-scaffold.ts`   |
| `withMemoryLock(dir, fn, opts?)` — file-lock `<dir>/.lock` со stale-steal и retry (макс 5с)                                                                                                                                                                                       | `src/adapters/fs/memory-lock.ts:80-108`          |
| `writeFileAtomic(path, content): Promise<void>` — tmp+rename, реюз для атомарных записей                                                                                                                                                                                          | `src/adapters/fs/markdown-memory-store.ts:241`   |
| `scanProject` идемпотентен по document-ref'ам (id `doc_<path>`, existing-check)                                                                                                                                                                                                   | `src/app/use-cases/scan-project.ts:58-59, 91-93` |
| `planLayoutMigration`/`applyLayoutMigration` — миграция legacy-layout `objects/` → v2; есть команда `wolf migrate`                                                                                                                                                                | `src/adapters/fs/layout-migration.ts`            |
| Root vitest: `tests/**/*.test.ts`; e2e: `tests/e2e/vitest.config.ts` (singleFork, 120s/180s), helpers `runCli/tmpProject/ensureBuilt`                                                                                                                                             | `vitest.config.ts`, `tests/e2e/helpers.ts`       |
| `package.json`: name `mr-wolf`; нет `files`/`engines`/`license`/`repository`; bin `wolf` → `dist/bootstrap/cli.js`; `better-sqlite3 ^9.0.0`; `@modelcontextprotocol/server ^2.0.0-alpha.2`; `check = format:check && lint && test:run && build`                                   | `package.json`                                   |
| Актуальный мажор better-sqlite3 — **13.0.3** (engines `node >=22`, prebuilds Node 22/24); `@modelcontextprotocol/server` стабильная **2.0.0** (subpath `./stdio` жив, `McpServer`/`fromJsonSchema` в корне — проверено по exports-мапе); `@types/better-sqlite3` latest **9.6.0** | `npm view` 2026-08-30                            |
| ci.yml: node-version 20; Dockerfile base `node:20-bookworm-slim`                                                                                                                                                                                                                  | `.github/workflows/ci.yml`, `Dockerfile`         |
| `dist/` в `.gitignore` (без `files` tarball сломан); трекаются `wolf-experiment/`, `.external-research/` (утекут без `files`)                                                                                                                                                     | `.gitignore`                                     |
| Формат opencode MCP: `"mcp": { "wolf": { "type": "local", "command": ["wolf","mcp"], "enabled": true } }` в `opencode.json`/`.jsonc`                                                                                                                                              | docs.opencode.ai/docs/mcp-servers                |
| Формат Claude Code MCP: `"mcpServers": { "wolf": { "command": "wolf", "args": ["mcp"] } }` в `.mcp.json`                                                                                                                                                                          | стандарт project-scope MCP Claude Code           |

## File Structure

### Create

| Файл                                                     | Ответственность                                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/ports/platform-adapter.port.ts`                     | Типы `McpCommand`, `PlatformConfig`, интерфейс `PlatformAdapter`                                                   |
| `src/adapters/platforms/jsonc.ts`                        | `parseJsonc(text)` — JSONC → значение (комментарии, trailing commas)                                               |
| `src/adapters/platforms/opencode-adapter.ts`             | `OpencodeAdapter` — opencode.json/jsonc, секция `mcp.wolf`                                                         |
| `src/adapters/platforms/claude-adapter.ts`               | `ClaudeAdapter` — .mcp.json, секция `mcpServers.wolf`                                                              |
| `src/adapters/platforms/index.ts`                        | `CANONICAL_MCP_COMMAND`, `PLATFORM_ADAPTERS` (реестр адаптеров)                                                    |
| `src/adapters/fs/user-config.ts`                         | `wolfUserConfigDir()` — `$XDG_CONFIG_HOME/wolf` (fallback `~/.config/wolf`)                                        |
| `src/adapters/fs/projects-registry.ts`                   | `ProjectsRegistry` — CRUD реестра `projects.yaml`                                                                  |
| `src/adapters/fs/schema-version.ts`                      | `CURRENT_SCHEMA_VERSION`, `readSchemaVersion`, `writeSchemaVersionIfAbsent`                                        |
| `src/adapters/fs/schema-guard.ts`                        | `ensureCurrentSchema(baseDir)` — ленивая миграция: лок, бэкап, layout-миграция, маркер; отказ на схеме из будущего |
| `src/app/use-cases/init-project.ts`                      | `initProject` (оркестрация), `recreateConfig`, `looksLikeProjectRoot`                                              |
| `src/app/use-cases/doctor.ts`                            | `runDoctor` — ревизия реестра, чистка мёртвых записей                                                              |
| `src/domain/npx.ts`                                      | `isNpxRun(env)` — критерий npx-запуска (`npm_command === 'npx'`)                                                   |
| `src/adapters/cli/commands/memory-doctor.ts`             | Команда `wolf doctor`                                                                                              |
| `.github/workflows/publish.yml`                          | Trusted publishing (OIDC) + provenance, check+e2e, sanity тег↔версия                                               |
| `SECURITY.md`                                            | Куда репортить уязвимости                                                                                          |
| `tests/unit/package-hygiene.test.ts`                     | Гигиена package.json (нет lifecycle-скриптов, files, engines, name)                                                |
| `tests/unit/adapters/platforms/jsonc.test.ts`            | parseJsonc                                                                                                         |
| `tests/unit/adapters/platforms/opencode-adapter.test.ts` | Адаптер opencode                                                                                                   |
| `tests/unit/adapters/platforms/claude-adapter.test.ts`   | Адаптер claude + реестр адаптеров                                                                                  |
| `tests/unit/adapters/user-config.test.ts`                | XDG-резолв                                                                                                         |
| `tests/unit/adapters/projects-registry.test.ts`          | Реестр projects.yaml                                                                                               |
| `tests/unit/adapters/schema-version.test.ts`             | Маркер версии схемы                                                                                                |
| `tests/unit/adapters/schema-guard.test.ts`               | Ленивая миграция, схема из будущего, лок                                                                           |
| `tests/unit/adapters/fs-project-initializer.test.ts`     | Ensure-семантика инициализатора                                                                                    |
| `tests/unit/domain/npx.test.ts`                          | isNpxRun                                                                                                           |
| `tests/unit/use-cases/init-project.test.ts`              | Оркестрация init (кейсы §3)                                                                                        |
| `tests/unit/use-cases/doctor.test.ts`                    | runDoctor                                                                                                          |
| `tests/unit/use-cases/bootstrap-dedup.test.ts`           | Дедуп bootstrap при повторе                                                                                        |
| `tests/e2e/schema-guard.e2e.ts`                          | Guard в точках входа на легаси-проекте                                                                             |
| `tests/e2e/distribution.e2e.ts`                          | Tarball-assert + установка в tmp-HOME + init + npx-кейс                                                            |

### Modify

| Файл                                        | Изменение                                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                              | name→`mister-wolf`, `files: ["dist"]`, `engines`, `license`, `repository`; bump better-sqlite3 ^13.0.3, @modelcontextprotocol/server ^2.0.0, @types/better-sqlite3 ^9.6.0 |
| `src/adapters/fs/fs-project-initializer.ts` | ensure-семантика конфига (flag `wx`, без перезаписи)                                                                                                                      |
| `src/adapters/fs/memory-lock.ts`            | параметр `lockFileName` у `withMemoryLock` (для `.wolf/migrate.lock`)                                                                                                     |
| `src/domain/taxonomy.ts`                    | поле `schemaVersion?: number` в `WolfConfig`                                                                                                                              |
| `src/adapters/fs/config-file.ts`            | `schema_version` в ConfigFileSchema, обеих load-функциях и renderConfigYaml — маркер не теряется при `taxonomy sync`                                                      |
| `src/adapters/cli/commands/memory-init.ts`  | Полная init-команда: `--platform`, `--recreate`, вывод per-platform, exit-семантика                                                                                       |
| `src/adapters/cli/cli-entry.ts`             | Регистрация `doctorCommand` + guard `ensureCurrentSchema` в `runCli` (точка входа CLI; сам `src/bootstrap/cli.ts` не меняется — он лишь вызывает `runCli`)                |
| `src/app/use-cases/bootstrap-project.ts`    | Дедуп proposed rules + work-thread при повторе                                                                                                                            |
| `src/bootstrap/mcp.ts`                      | Guard `ensureCurrentSchema` до serveStdio                                                                                                                                 |
| `README.md`                                 | Installation-секция (тайпсквот первой строкой, 3 шага, рестарт/approval, статусы, npx, dev-путь)                                                                          |
| `.github/workflows/ci.yml`                  | Node 22/24 матрица + macOS (prebuild-пруф)                                                                                                                                |
| `Dockerfile`                                | base `node:20` → `node:22`                                                                                                                                                |

## Task Ordering

Порядок: пакетные основы → адаптеры (unit) → XDG-реестр → фиксы скелета/лока → маркер схемы → init (use-case + CLI) → миграции/guard → точки входа → doctor → дедуп bootstrap → README/SECURITY → CI/publish → финальный E2E.

Отклонение от порядка спеки: маркер `schema_version` (Task 8) идёт **до** init (Task 9), потому что init пишет маркер и регистрирует проект с версией схемы — так каждая функция определяется до первого использования и ни одна задача не правит файлы предыдущей.

---

### Task 1: Пакетные основы — rename, files/engines/license/repository, bump зависимостей

**Files:**

- Modify: `package.json`
- Test: `tests/unit/package-hygiene.test.ts`

- [ ] **Step 1: Write the failing test**

Создай `tests/unit/package-hygiene.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'));

describe('package hygiene (спека §5, §7)', () => {
  it('published as mister-wolf (typo-squat guard: mr-wolf is a foreign package)', () => {
    expect(pkg.name).toBe('mister-wolf');
  });

  it('ships only dist (wolf-experiment/ and .external-research/ must not leak into tarball)', () => {
    expect(pkg.files).toEqual(['dist']);
  });

  it('declares engines.node >= 22 (prebuilt better-sqlite3 v13 line)', () => {
    expect(pkg.engines?.node).toBe('>=22');
  });

  it('declares license and repository (npm metadata)', () => {
    expect(pkg.license).toBe('MIT');
    expect(pkg.repository?.url).toContain('github.com/chekh/mister-wolf');
  });

  it('has NO install lifecycle scripts (native deps are not our postinstall)', () => {
    const scripts = pkg.scripts ?? {};
    for (const banned of ['preinstall', 'install', 'postinstall', 'prepublish']) {
      expect(scripts[banned], `scripts.${banned} must not exist`).toBeUndefined();
    }
  });

  it('depends on prebuilt better-sqlite3 >= 13 (Node 22/24 prebuilds)', () => {
    expect(pkg.dependencies['better-sqlite3']).toMatch(/^\^13\./);
  });

  it('depends on stable @modelcontextprotocol/server (no alpha/beta in runtime)', () => {
    const v = pkg.dependencies['@modelcontextprotocol/server'];
    expect(v).toMatch(/^\^\d+\.\d+\.\d+$/);
    expect(v).not.toMatch(/alpha|beta|rc/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/package-hygiene.test.ts`
Expected: FAIL — 5+ ошибок ассертаций (`expected 'mr-wolf' to be 'mister-wolf'`, `expected undefined to equal [ 'dist' ]` и т.д.).

- [ ] **Step 3: Rewrite package.json**

Замени содержимое `package.json` целиком (изменения: `name`, `license`, `repository`, `files`, `engines`, `better-sqlite3`, `@modelcontextprotocol/server`, `@types/better-sqlite3`; остальное без изменений):

```json
{
  "name": "mister-wolf",
  "version": "0.1.0",
  "description": "Mr. Wolf — local-first Project Semantic Memory layer for AI coding agents",
  "type": "module",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/chekh/mister-wolf.git"
  },
  "bin": {
    "wolf": "./dist/bootstrap/cli.js"
  },
  "engines": {
    "node": ">=22"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest",
    "test:run": "vitest run",
    "lint": "tsc --noEmit",
    "format": "prettier --write \"src/**/*.ts\" \"tests/**/*.ts\" \"docs/**/*.md\" \"README.md\" \"*.json\" \"*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\" \"tests/**/*.ts\" \"docs/**/*.md\" \"README.md\" \"*.json\" \"*.ts\"",
    "e2e": "npm run build && vitest run --config tests/e2e/vitest.config.ts",
    "pressure-test": "npm run build && node dist/bootstrap/cli.js learn gate",
    "bench:search": "npm run build && node scripts/bench-search.mjs",
    "bench:tokens": "node --disable-warning=ExperimentalWarning scripts/bench-tokens.mjs",
    "check": "npm run format:check && npm run lint && npm run test:run && npm run build"
  },
  "dependencies": {
    "@modelcontextprotocol/server": "^2.0.0",
    "better-sqlite3": "^13.0.3",
    "commander": "^12.0.0",
    "fast-glob": "^3.3.3",
    "js-yaml": "^4.1.0",
    "uuid": "^9.0.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@dietrichgebert/ponytail": "^4.8.4",
    "@types/better-sqlite3": "^9.6.0",
    "@types/glob": "^8.1.0",
    "@types/js-yaml": "^4.0.0",
    "@types/node": "^20.0.0",
    "@types/uuid": "^10.0.0",
    "prettier": "^3.8.3",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 4: Install bumped deps and verify prebuild (no node-gyp)**

Run: `npm install`
Expected: установка проходит; в выводе НЕТ строк `gyp`/`node-gyp`/`MSBuild` — better-sqlite3@13 скачал prebuild под текущий Node. Если пошла gyp-сборка — СТОП: prebuild под этот Node отсутствует, эскалируй (спека §9: «пребилды не покрывают заявленное»).

Run: `node -e "const db = new (require('better-sqlite3'))(':memory:'); db.exec('create table t(x)'); console.log('better-sqlite3 native OK, prebuild used')"`
Expected: `better-sqlite3 native OK, prebuild used`

- [ ] **Step 5: Verify SDK bump didn't break build and MCP tests**

Run: `npm run build && npx vitest run tests/unit/adapters/mcp-server.test.ts`
Expected: build без ошибок (импорты `serveStdio`, `McpServer`, `fromJsonSchema` живы в стабильной 2.0.0), тест PASS.

- [ ] **Step 6: Verify tarball composition**

Run: `npm pack --dry-run 2>&1 | tail -25`
Expected: `Tarball Contents` — только `dist/**`, `README.md`, `LICENSE`, `package.json`. Никаких `wolf-experiment/`, `.external-research/`, `src/`, `tests/`. (Автоматический assert — Task 17.)

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run tests/unit/package-hygiene.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tests/unit/package-hygiene.test.ts
git commit -m "feat: пакетные основы mister-wolf — rename, files/engines/license/repository, bump better-sqlite3@13 и MCP SDK@2.0.0"
```

---

### Task 2: Порт платформенного адаптера + parseJsonc

**Files:**

- Create: `src/ports/platform-adapter.port.ts`
- Create: `src/adapters/platforms/jsonc.ts`
- Test: `tests/unit/adapters/platforms/jsonc.test.ts`

- [ ] **Step 1: Write the failing test**

Создай `tests/unit/adapters/platforms/jsonc.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseJsonc } from '../../../../src/adapters/platforms/jsonc.js';

describe('parseJsonc', () => {
  it('parses plain JSON', () => {
    expect(parseJsonc('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips // line comments outside strings', () => {
    expect(parseJsonc('{\n  // comment\n  "a": 1 // trailing\n}\n')).toEqual({ a: 1 });
  });

  it('strips /* block comments */', () => {
    expect(parseJsonc('{ /* c */ "a": 1 }')).toEqual({ a: 1 });
  });

  it('keeps // inside string values intact', () => {
    expect(parseJsonc('{"url":"https://opencode.ai/config.json"}')).toEqual({
      url: 'https://opencode.ai/config.json',
    });
  });

  it('tolerates trailing commas', () => {
    expect(parseJsonc('{"a":1,}')).toEqual({ a: 1 });
    expect(parseJsonc('[1,2,]')).toEqual([1, 2]);
  });

  it('throws on genuinely broken input', () => {
    expect(() => parseJsonc('{nope')).toThrow(SyntaxError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/adapters/platforms/jsonc.test.ts`
Expected: FAIL — `Error: Cannot find module .../src/adapters/platforms/jsonc.js`

- [ ] **Step 3: Write port and implementation**

Создай `src/ports/platform-adapter.port.ts`:

```ts
/** Каноническая команда запуска MCP-сервера Wolf (спека §4). */
export interface McpCommand {
  command: string; // 'wolf' — глобальный бинарь на PATH
  args: string[]; // ['mcp']
}

/** Конфиг платформы как распарсенный JSON-объект; структуру знает адаптер. */
export type PlatformConfig = Record<string, unknown>;

/**
 * Адаптер платформы: новая платформа = один файл-адаптер, init не меняется (спека §4).
 */
export interface PlatformAdapter {
  id: string; // 'opencode' | 'claude'
  /** Детект платформы по файлам-маркерам в корне проекта. */
  detect(projectRoot: string): boolean;
  /** Текущий конфиг платформы; null — конфиг-файла нет. */
  readConfig(projectRoot: string): Promise<PlatformConfig | null>;
  /**
   * Идемпотентная запись wolf-сервера (ключ идемпотентности — имя MCP-сервера 'wolf'):
   * 'written' — создан, 'replaced' — существующая запись wolf перезаписана (в т.ч. ручная
   * dev-запись), 'unchanged' — уже канонический. Чужие серверы и секции не трогаются.
   */
  writeConfig(projectRoot: string, cmd: McpCommand): Promise<'written' | 'replaced' | 'unchanged'>;
  /** Удалить wolf-запись (для --platform replace-семантики); true если удалил. */
  removeWolf(projectRoot: string): Promise<boolean>;
}
```

Создай `src/adapters/platforms/jsonc.ts`:

```ts
/**
 * Минимальный JSONC-парсер: вырезает // и блок-комментарии вне строк,
 * прощает trailing commas. Для opencode.jsonc и ручных конфигов с комментариями.
 */
export function parseJsonc(text: string): unknown {
  const noComments = text.replace(
    /("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (match, str: string | undefined) => (str !== undefined ? str : '')
  );
  const noTrailingCommas = noComments.replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(noTrailingCommas);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/adapters/platforms/jsonc.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ports/platform-adapter.port.ts src/adapters/platforms/jsonc.ts tests/unit/adapters/platforms/jsonc.test.ts
git commit -m "feat: порт PlatformAdapter (McpCommand) + parseJsonc для конфигов платформ"
```

---

### Task 3: OpencodeAdapter

**Files:**

- Create: `src/adapters/platforms/opencode-adapter.ts`
- Test: `tests/unit/adapters/platforms/opencode-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

Создай `tests/unit/adapters/platforms/opencode-adapter.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { OpencodeAdapter } from '../../../../src/adapters/platforms/opencode-adapter.js';
import type { McpCommand } from '../../../../src/ports/platform-adapter.port.js';

const cmd: McpCommand = { command: 'wolf', args: ['mcp'] };
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wolf-oc-adapter-'));
});
afterEach(() => {
  chmodSync(dir, 0o755);
  rmSync(dir, { recursive: true, force: true });
});

const WOLF_ENTRY = { type: 'local', command: ['wolf', 'mcp'], enabled: true };

describe('OpencodeAdapter.detect (маркеры: opencode.json / opencode.jsonc / .opencode/)', () => {
  it('detects opencode.json', () => {
    writeFileSync(join(dir, 'opencode.json'), '{}');
    expect(new OpencodeAdapter().detect(dir)).toBe(true);
  });

  it('detects opencode.jsonc', () => {
    writeFileSync(join(dir, 'opencode.jsonc'), '{}');
    expect(new OpencodeAdapter().detect(dir)).toBe(true);
  });

  it('detects .opencode/ directory', () => {
    mkdirSync(join(dir, '.opencode'));
    expect(new OpencodeAdapter().detect(dir)).toBe(true);
  });

  it('no markers → not detected', () => {
    expect(new OpencodeAdapter().detect(dir)).toBe(false);
  });
});

describe('OpencodeAdapter.writeConfig', () => {
  it('creates opencode.json with canonical mcp.wolf entry', async () => {
    const result = await new OpencodeAdapter().writeConfig(dir, cmd);
    expect(result).toBe('written');
    const cfg = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'));
    expect(cfg.mcp.wolf).toEqual(WOLF_ENTRY);
  });

  it('idempotent: second call is unchanged and file content identical', async () => {
    const adapter = new OpencodeAdapter();
    await adapter.writeConfig(dir, cmd);
    const before = readFileSync(join(dir, 'opencode.json'), 'utf-8');
    expect(await adapter.writeConfig(dir, cmd)).toBe('unchanged');
    expect(readFileSync(join(dir, 'opencode.json'), 'utf-8')).toBe(before);
  });

  it('replaces a foreign wolf command (dogfooders: node dist/...) but keeps other servers', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify(
        {
          mcp: {
            wolf: { type: 'local', command: ['node', 'dist/bootstrap/mcp.js'] },
            other: { type: 'local', command: ['x'] },
          },
        },
        null,
        2
      )
    );
    expect(await new OpencodeAdapter().writeConfig(dir, cmd)).toBe('replaced');
    const cfg = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'));
    expect(cfg.mcp.wolf).toEqual(WOLF_ENTRY);
    expect(cfg.mcp.other).toEqual({ type: 'local', command: ['x'] });
  });

  it('reads opencode.jsonc with comments (comments are lost on rewrite — documented trade-off)', async () => {
    writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // my config\n  "plugin": ["p"],\n}');
    expect(await new OpencodeAdapter().writeConfig(dir, cmd)).toBe('written');
    const cfg = JSON.parse(readFileSync(join(dir, 'opencode.jsonc'), 'utf-8'));
    expect(cfg.mcp.wolf).toEqual(WOLF_ENTRY);
    expect(cfg.plugin).toEqual(['p']);
  });

  it('readConfig returns null when no config file', async () => {
    expect(await new OpencodeAdapter().readConfig(dir)).toBeNull();
  });

  it('refuses a non-object config before touching the file', async () => {
    const raw = '[1,2,3]';
    writeFileSync(join(dir, 'opencode.json'), raw);
    await expect(new OpencodeAdapter().writeConfig(dir, cmd)).rejects.toThrow(/opencode\.json/);
    expect(readFileSync(join(dir, 'opencode.json'), 'utf-8')).toBe(raw);
  });

  it('no write permission → fails without partial write (atomicity)', async () => {
    writeFileSync(join(dir, 'opencode.json'), '{}');
    chmodSync(dir, 0o555); // каталог read-only: tmp-файл для atomic rename не создать
    await expect(new OpencodeAdapter().writeConfig(dir, cmd)).rejects.toThrow();
    chmodSync(dir, 0o755);
    expect(JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'))).toEqual({});
  });
});

describe('OpencodeAdapter.removeWolf', () => {
  it('removes only the wolf entry, keeps other servers', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({ mcp: { wolf: WOLF_ENTRY, other: { type: 'local', command: ['x'] } } })
    );
    expect(await new OpencodeAdapter().removeWolf(dir)).toBe(true);
    const cfg = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'));
    expect(cfg.mcp).toEqual({ other: { type: 'local', command: ['x'] } });
  });

  it('returns false when there is nothing to remove', async () => {
    expect(await new OpencodeAdapter().removeWolf(dir)).toBe(false);
  });

  it('drops the mcp key entirely when it becomes empty', async () => {
    writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ mcp: { wolf: WOLF_ENTRY } }));
    expect(await new OpencodeAdapter().removeWolf(dir)).toBe(true);
    const cfg = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8'));
    expect(cfg.mcp).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/adapters/platforms/opencode-adapter.test.ts`
Expected: FAIL — `Cannot find module .../opencode-adapter.js`

- [ ] **Step 3: Write OpencodeAdapter**

Создай `src/adapters/platforms/opencode-adapter.ts`:

```ts
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { PlatformAdapter, McpCommand, PlatformConfig } from '../../ports/platform-adapter.port.js';
import { parseJsonc } from './jsonc.js';
import { writeFileAtomic } from '../fs/markdown-memory-store.js';
import { UserFacingError } from '../../domain/errors.js';

// ponytail: комментарии в opencode.jsonc теряются при rewrite (plain JSON валиден как JSONC);
// сохранение комментариев = AST-редактор, YAGNI до запроса.
export class OpencodeAdapter implements PlatformAdapter {
  readonly id = 'opencode';

  detect(projectRoot: string): boolean {
    return (
      existsSync(join(projectRoot, 'opencode.json')) ||
      existsSync(join(projectRoot, 'opencode.jsonc')) ||
      existsSync(join(projectRoot, '.opencode'))
    );
  }

  /** Существующий конфиг (jsonc — только если нет json); для новой установки — opencode.json. */
  private configFile(projectRoot: string): string {
    if (existsSync(join(projectRoot, 'opencode.jsonc')) && !existsSync(join(projectRoot, 'opencode.json'))) {
      return join(projectRoot, 'opencode.jsonc');
    }
    return join(projectRoot, 'opencode.json');
  }

  async readConfig(projectRoot: string): Promise<PlatformConfig | null> {
    const file = this.configFile(projectRoot);
    let raw: string | null = null;
    try {
      raw = await fs.readFile(file, 'utf-8');
    } catch {
      return null;
    }
    return asConfig(parseJsonc(raw), file);
  }

  async writeConfig(projectRoot: string, cmd: McpCommand): Promise<'written' | 'replaced' | 'unchanged'> {
    const file = this.configFile(projectRoot);
    const cfg = (await this.readConfig(projectRoot)) ?? {};
    const mcp = asRecord(cfg.mcp) ?? {};
    // каноническая проекция McpCommand в формат opencode: command — массив
    const desired = { type: 'local', command: [cmd.command, ...cmd.args], enabled: true };
    if (JSON.stringify(mcp.wolf) === JSON.stringify(desired)) return 'unchanged';
    const replaced = mcp.wolf !== undefined;
    mcp.wolf = desired;
    cfg.mcp = mcp;
    await writeFileAtomic(file, JSON.stringify(cfg, null, 2) + '\n');
    return replaced ? 'replaced' : 'written';
  }

  async removeWolf(projectRoot: string): Promise<boolean> {
    const file = this.configFile(projectRoot);
    const cfg = await this.readConfig(projectRoot);
    if (cfg === null) return false;
    const mcp = asRecord(cfg.mcp);
    if (mcp === undefined || mcp.wolf === undefined) return false;
    delete mcp.wolf;
    if (Object.keys(mcp).length === 0) delete cfg.mcp;
    else cfg.mcp = mcp;
    await writeFileAtomic(file, JSON.stringify(cfg, null, 2) + '\n');
    return true;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asConfig(value: unknown, file: string): PlatformConfig {
  const cfg = asRecord(value);
  if (cfg === undefined) {
    throw new UserFacingError(`${file} is not a JSON object — refusing to touch it`);
  }
  return cfg;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/adapters/platforms/opencode-adapter.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add src/adapters/platforms/opencode-adapter.ts tests/unit/adapters/platforms/opencode-adapter.test.ts
git commit -m "feat: OpencodeAdapter — идемпотентная запись mcp.wolf в opencode.json/jsonc"
```

---

### Task 4: ClaudeAdapter + реестр адаптеров

**Files:**

- Create: `src/adapters/platforms/claude-adapter.ts`
- Create: `src/adapters/platforms/index.ts`
- Test: `tests/unit/adapters/platforms/claude-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

Создай `tests/unit/adapters/platforms/claude-adapter.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ClaudeAdapter } from '../../../../src/adapters/platforms/claude-adapter.js';
import { CANONICAL_MCP_COMMAND, PLATFORM_ADAPTERS } from '../../../../src/adapters/platforms/index.js';
import type { McpCommand } from '../../../../src/ports/platform-adapter.port.js';

const cmd: McpCommand = { command: 'wolf', args: ['mcp'] };
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wolf-claude-adapter-'));
});
afterEach(() => {
  chmodSync(dir, 0o755);
  rmSync(dir, { recursive: true, force: true });
});

const WOLF_ENTRY = { command: 'wolf', args: ['mcp'] };

describe('ClaudeAdapter.detect (маркеры: .mcp.json / .claude/)', () => {
  it('detects .mcp.json', () => {
    writeFileSync(join(dir, '.mcp.json'), '{}');
    expect(new ClaudeAdapter().detect(dir)).toBe(true);
  });

  it('detects .claude/ directory', () => {
    mkdirSync(join(dir, '.claude'));
    expect(new ClaudeAdapter().detect(dir)).toBe(true);
  });

  it('no markers → not detected', () => {
    expect(new ClaudeAdapter().detect(dir)).toBe(false);
  });
});

describe('ClaudeAdapter.writeConfig', () => {
  it('creates .mcp.json with canonical mcpServers.wolf', async () => {
    expect(await new ClaudeAdapter().writeConfig(dir, cmd)).toBe('written');
    const cfg = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf-8'));
    expect(cfg.mcpServers.wolf).toEqual(WOLF_ENTRY);
  });

  it('idempotent: second call unchanged, content identical', async () => {
    const adapter = new ClaudeAdapter();
    await adapter.writeConfig(dir, cmd);
    const before = readFileSync(join(dir, '.mcp.json'), 'utf-8');
    expect(await adapter.writeConfig(dir, cmd)).toBe('unchanged');
    expect(readFileSync(join(dir, '.mcp.json'), 'utf-8')).toBe(before);
  });

  it('replaces a manual dev entry but keeps foreign servers', async () => {
    writeFileSync(
      join(dir, '.mcp.json'),
      JSON.stringify(
        {
          mcpServers: {
            wolf: { command: 'node', args: ['dist/bootstrap/mcp.js'] },
            sqlite: { command: 'sqlite' },
          },
        },
        null,
        2
      )
    );
    expect(await new ClaudeAdapter().writeConfig(dir, cmd)).toBe('replaced');
    const cfg = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf-8'));
    expect(cfg.mcpServers.wolf).toEqual(WOLF_ENTRY);
    expect(cfg.mcpServers.sqlite).toEqual({ command: 'sqlite' });
  });

  it('readConfig returns null when no .mcp.json', async () => {
    expect(await new ClaudeAdapter().readConfig(dir)).toBeNull();
  });

  it('no write permission → fails without partial write', async () => {
    writeFileSync(join(dir, '.mcp.json'), '{}');
    chmodSync(dir, 0o555);
    await expect(new ClaudeAdapter().writeConfig(dir, cmd)).rejects.toThrow();
    chmodSync(dir, 0o755);
    expect(JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf-8'))).toEqual({});
  });
});

describe('ClaudeAdapter.removeWolf', () => {
  it('removes only the wolf entry', async () => {
    const adapter = new ClaudeAdapter();
    await adapter.writeConfig(dir, cmd);
    expect(await adapter.removeWolf(dir)).toBe(true);
    const cfg = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf-8'));
    expect(cfg.mcpServers).toBeUndefined();
  });

  it('returns false when nothing to remove', async () => {
    expect(await new ClaudeAdapter().removeWolf(dir)).toBe(false);
  });
});

describe('adapter registry', () => {
  it('CANONICAL_MCP_COMMAND is { wolf, [mcp] } — never npx (спека §4)', () => {
    expect(CANONICAL_MCP_COMMAND).toEqual({ command: 'wolf', args: ['mcp'] });
  });

  it('PLATFORM_ADAPTERS covers opencode and claude', () => {
    expect(PLATFORM_ADAPTERS.map((a) => a.id).sort()).toEqual(['claude', 'opencode']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/adapters/platforms/claude-adapter.test.ts`
Expected: FAIL — `Cannot find module .../claude-adapter.js`

- [ ] **Step 3: Write ClaudeAdapter and registry**

Создай `src/adapters/platforms/claude-adapter.ts`:

```ts
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { PlatformAdapter, McpCommand, PlatformConfig } from '../../ports/platform-adapter.port.js';
import { writeFileAtomic } from '../fs/markdown-memory-store.js';
import { UserFacingError } from '../../domain/errors.js';

export class ClaudeAdapter implements PlatformAdapter {
  readonly id = 'claude';

  detect(projectRoot: string): boolean {
    return existsSync(join(projectRoot, '.mcp.json')) || existsSync(join(projectRoot, '.claude'));
  }

  private configFile(projectRoot: string): string {
    return join(projectRoot, '.mcp.json');
  }

  async readConfig(projectRoot: string): Promise<PlatformConfig | null> {
    const file = this.configFile(projectRoot);
    let raw: string | null = null;
    try {
      raw = await fs.readFile(file, 'utf-8');
    } catch {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new UserFacingError(`${file} is not valid JSON: ${err instanceof Error ? err.message : err}`);
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new UserFacingError(`${file} is not a JSON object — refusing to touch it`);
    }
    return parsed as PlatformConfig;
  }

  async writeConfig(projectRoot: string, cmd: McpCommand): Promise<'written' | 'replaced' | 'unchanged'> {
    const file = this.configFile(projectRoot);
    const cfg = (await this.readConfig(projectRoot)) ?? {};
    const mcpServers = asRecord(cfg.mcpServers) ?? {};
    // каноническая проекция McpCommand в формат Claude Code: command + args
    const desired = { command: cmd.command, args: [...cmd.args] };
    if (JSON.stringify(mcpServers.wolf) === JSON.stringify(desired)) return 'unchanged';
    const replaced = mcpServers.wolf !== undefined;
    mcpServers.wolf = desired;
    cfg.mcpServers = mcpServers;
    await writeFileAtomic(file, JSON.stringify(cfg, null, 2) + '\n');
    return replaced ? 'replaced' : 'written';
  }

  async removeWolf(projectRoot: string): Promise<boolean> {
    const file = this.configFile(projectRoot);
    const cfg = await this.readConfig(projectRoot);
    if (cfg === null) return false;
    const mcpServers = asRecord(cfg.mcpServers);
    if (mcpServers === undefined || mcpServers.wolf === undefined) return false;
    delete mcpServers.wolf;
    if (Object.keys(mcpServers).length === 0) delete cfg.mcpServers;
    else cfg.mcpServers = mcpServers;
    await writeFileAtomic(file, JSON.stringify(cfg, null, 2) + '\n');
    return true;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
```

Создай `src/adapters/platforms/index.ts`:

```ts
import { McpCommand, PlatformAdapter } from '../../ports/platform-adapter.port.js';
import { OpencodeAdapter } from './opencode-adapter.js';
import { ClaudeAdapter } from './claude-adapter.js';

/** Канонический способ запуска MCP-сервера Wolf: глобальный бинарь, никогда npx (спека §4). */
export const CANONICAL_MCP_COMMAND: McpCommand = { command: 'wolf', args: ['mcp'] };

/** Все платформы v1. Новая платформа = адаптер в этот список, init не меняется. */
export const PLATFORM_ADAPTERS: PlatformAdapter[] = [new OpencodeAdapter(), new ClaudeAdapter()];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/adapters/platforms/claude-adapter.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/adapters/platforms/claude-adapter.ts src/adapters/platforms/index.ts tests/unit/adapters/platforms/claude-adapter.test.ts
git commit -m "feat: ClaudeAdapter (.mcp.json) + реестр адаптеров с каноническим McpCommand"
```

---

### Task 5: XDG user-config + ProjectsRegistry

**Files:**

- Create: `src/adapters/fs/user-config.ts`
- Create: `src/adapters/fs/projects-registry.ts`
- Test: `tests/unit/adapters/user-config.test.ts`
- Test: `tests/unit/adapters/projects-registry.test.ts`

- [ ] **Step 1: Write the failing tests**

Создай `tests/unit/adapters/user-config.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { homedir } from 'os';
import { wolfUserConfigDir } from '../../../src/adapters/fs/user-config.js';

describe('wolfUserConfigDir (XDG, спека §3 уровень 0)', () => {
  it('honors XDG_CONFIG_HOME', () => {
    expect(wolfUserConfigDir({ XDG_CONFIG_HOME: '/custom/xdg' } as NodeJS.ProcessEnv)).toBe(
      join('/custom/xdg', 'wolf')
    );
  });

  it('falls back to ~/.config when XDG_CONFIG_HOME is unset', () => {
    expect(wolfUserConfigDir({} as NodeJS.ProcessEnv)).toBe(join(homedir(), '.config', 'wolf'));
  });

  it('falls back to ~/.config when XDG_CONFIG_HOME is empty/whitespace', () => {
    expect(wolfUserConfigDir({ XDG_CONFIG_HOME: '   ' } as NodeJS.ProcessEnv)).toBe(join(homedir(), '.config', 'wolf'));
  });
});
```

Создай `tests/unit/adapters/projects-registry.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'js-yaml';
import { ProjectsRegistry } from '../../../src/adapters/fs/projects-registry.js';

let configDir: string;

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), 'wolf-registry-'));
});
afterEach(() => {
  rmSync(configDir, { recursive: true, force: true });
});

interface RegistryRow {
  path: string;
  schema_version: number;
  initialized_at: string;
}

function readYaml(): { projects?: RegistryRow[] } {
  return yaml.load(readFileSync(join(configDir, 'projects.yaml'), 'utf-8')) as { projects?: RegistryRow[] };
}

describe('ProjectsRegistry', () => {
  it('register creates projects.yaml with the project', async () => {
    await new ProjectsRegistry(configDir).register('/projects/foo', 2);
    expect(readYaml().projects).toEqual([
      { path: '/projects/foo', schema_version: 2, initialized_at: expect.any(String) },
    ]);
  });

  it('register is an upsert by path (re-init updates schema_version, keeps initialized_at)', async () => {
    const registry = new ProjectsRegistry(configDir);
    await registry.register('/projects/foo', 1);
    const first = readYaml().projects![0];
    await registry.register('/projects/foo', 2);
    const second = readYaml().projects!;
    expect(second).toHaveLength(1);
    expect(second[0].schema_version).toBe(2);
    expect(second[0].initialized_at).toBe(first.initialized_at);
  });

  it('list returns registered projects', async () => {
    const registry = new ProjectsRegistry(configDir);
    await registry.register('/projects/foo', 2);
    await registry.register('/projects/bar', 2);
    expect((await registry.list()).map((p) => p.path).sort()).toEqual(['/projects/bar', '/projects/foo']);
  });

  it('remove deletes entry and reports whether it existed', async () => {
    const registry = new ProjectsRegistry(configDir);
    await registry.register('/projects/foo', 2);
    expect(await registry.remove('/projects/foo')).toBe(true);
    expect(await registry.remove('/projects/foo')).toBe(false);
    expect(readYaml().projects ?? []).toEqual([]);
  });

  it('prune removes entries whose paths do not exist and returns them', async () => {
    const registry = new ProjectsRegistry(configDir);
    await registry.register('/definitely/missing', 2);
    expect(await registry.prune()).toEqual(['/definitely/missing']);
    expect(readYaml().projects ?? []).toEqual([]);
  });

  it('works when config dir does not exist yet (creates it)', async () => {
    const nested = join(configDir, 'deep', 'wolf');
    await new ProjectsRegistry(nested).register('/projects/foo', 2);
    expect(existsSync(join(nested, 'projects.yaml'))).toBe(true);
  });

  it('corrupted yaml → registry treated as empty (resilient, not fatal)', async () => {
    writeFileSync(join(configDir, 'projects.yaml'), '{uncorrectable');
    const registry = new ProjectsRegistry(configDir);
    expect(await registry.list()).toEqual([]);
    await registry.register('/projects/foo', 2); // перезапишет битый файл
    expect((await registry.list()).map((p) => p.path)).toEqual(['/projects/foo']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/adapters/user-config.test.ts tests/unit/adapters/projects-registry.test.ts`
Expected: FAIL — `Cannot find module .../user-config.js`, `Cannot find module .../projects-registry.js`

- [ ] **Step 3: Write implementations**

Создай `src/adapters/fs/user-config.ts`:

```ts
import { join } from 'path';
import { homedir } from 'os';

/** Глобальный юзер-конфиг Wolf: `$XDG_CONFIG_HOME/wolf`, по умолчанию `~/.config/wolf` (спека §3). */
export function wolfUserConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  const xdg =
    env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.trim() !== '' ? env.XDG_CONFIG_HOME : join(homedir(), '.config');
  return join(xdg, 'wolf');
}
```

Создай `src/adapters/fs/projects-registry.ts`:

```ts
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { writeFileAtomic } from './markdown-memory-store.js';

export interface RegisteredProject {
  path: string;
  schema_version: number;
  initialized_at: string;
}

/**
 * Реестр инициализированных проектов: `<user-config>/projects.yaml`.
 * Пишет `wolf init`, читает `wolf doctor`, чистит мёртвые записи (спека §3).
 */
export class ProjectsRegistry {
  constructor(private readonly configDir: string) {}

  private get file(): string {
    return join(this.configDir, 'projects.yaml');
  }

  async list(): Promise<RegisteredProject[]> {
    let raw: string;
    try {
      raw = await fs.readFile(this.file, 'utf-8');
    } catch {
      return [];
    }
    let doc: unknown;
    try {
      doc = yaml.load(raw);
    } catch {
      return []; // битый реестр — трактуем как пустой; register перезапишет
    }
    const projects = (doc as { projects?: unknown } | null)?.projects;
    return Array.isArray(projects) ? (projects as RegisteredProject[]) : [];
  }

  async register(path: string, schemaVersion: number): Promise<void> {
    const projects = await this.list();
    const existing = projects.find((p) => p.path === path);
    if (existing) {
      existing.schema_version = schemaVersion; // upsert: версию обновляем, initialized_at храним
    } else {
      projects.push({ path, schema_version: schemaVersion, initialized_at: new Date().toISOString() });
    }
    await this.persist(projects);
  }

  async remove(path: string): Promise<boolean> {
    const projects = await this.list();
    const next = projects.filter((p) => p.path !== path);
    if (next.length === projects.length) return false;
    await this.persist(next);
    return true;
  }

  /** Удаляет записи с несуществующими путями; возвращает удалённые пути (для doctor). */
  async prune(): Promise<string[]> {
    const projects = await this.list();
    const alive: RegisteredProject[] = [];
    const dead: string[] = [];
    for (const p of projects) {
      if (existsSync(p.path)) alive.push(p);
      else dead.push(p.path);
    }
    if (dead.length > 0) await this.persist(alive);
    return dead;
  }

  private async persist(projects: RegisteredProject[]): Promise<void> {
    const body = yaml.dump({ projects }, { sortKeys: false, lineWidth: 120 });
    await fs.mkdir(this.configDir, { recursive: true });
    await writeFileAtomic(this.file, body);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/adapters/user-config.test.ts tests/unit/adapters/projects-registry.test.ts`
Expected: PASS (3 + 7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/adapters/fs/user-config.ts src/adapters/fs/projects-registry.ts tests/unit/adapters/user-config.test.ts tests/unit/adapters/projects-registry.test.ts
git commit -m "feat: XDG user-config dir + реестр проектов projects.yaml (register/remove/prune)"
```

---

### Task 6: Фикс FsProjectInitializer — ensure-без-перезаписи

**Files:**

- Modify: `src/adapters/fs/fs-project-initializer.ts`
- Test: `tests/unit/adapters/fs-project-initializer.test.ts`

- [ ] **Step 1: Write the failing test**

Создай `tests/unit/adapters/fs-project-initializer.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FsProjectInitializer } from '../../../src/adapters/fs/fs-project-initializer.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wolf-init-fix-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('FsProjectInitializer ensure-semantics (спека §8: фикс перезаписи config.yaml)', () => {
  it('creates the skeleton and config on first run', async () => {
    await new FsProjectInitializer().initialize(dir);
    expect(readFileSync(join(dir, '.wolf', 'config.yaml'), 'utf-8')).toContain('memory_types');
  });

  it('does NOT overwrite an existing config.yaml on re-init', async () => {
    await new FsProjectInitializer().initialize(dir);
    const custom = '# custom project config\nartifact_sources: [docs]\n';
    writeFileSync(join(dir, '.wolf', 'config.yaml'), custom);
    await new FsProjectInitializer().initialize(dir); // повторный init
    expect(readFileSync(join(dir, '.wolf', 'config.yaml'), 'utf-8')).toBe(custom);
  });

  it('re-init keeps memory content (mkdir recursive, memory untouched)', async () => {
    await new FsProjectInitializer().initialize(dir);
    mkdirSync(join(dir, '.wolf', 'memory', 'shared', 'decisions'), { recursive: true });
    const memoryFile = join(dir, '.wolf', 'memory', 'shared', 'decisions', 'mem_1.md');
    writeFileSync(memoryFile, '---\nid: mem_1\n---\nbody');
    await new FsProjectInitializer().initialize(dir);
    expect(readFileSync(memoryFile, 'utf-8')).toContain('mem_1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/adapters/fs-project-initializer.test.ts`
Expected: FAIL — тест 2: содержимое конфига не равно `custom` (инициализатор перезаписал его рендером).

- [ ] **Step 3: Fix the initializer**

Замени `src/adapters/fs/fs-project-initializer.ts` целиком:

```ts
import * as fs from 'fs/promises';
import { ProjectInitializer } from '../../ports/project-initializer.port.js';
import { renderConfigYaml } from './config-file.js';
import { briefsDir, cacheDir, configPath, memoryDir, threadsDir, sharedDir } from './project-paths.js';

export class FsProjectInitializer implements ProjectInitializer {
  async initialize(baseDir: string): Promise<void> {
    await fs.mkdir(memoryDir(baseDir), { recursive: true });
    await fs.mkdir(threadsDir(baseDir), { recursive: true });
    await fs.mkdir(sharedDir(baseDir), { recursive: true });
    await fs.mkdir(briefsDir(baseDir), { recursive: true });
    await fs.mkdir(cacheDir(baseDir), { recursive: true });
    // ensure-без-перезаписи (спека §3.1/§8): 'wx' = создать только если не существует.
    // Существующий config.yaml и память не трогаются — повторный init идемпотентен.
    try {
      await fs.writeFile(configPath(baseDir), renderConfigYaml(null), { encoding: 'utf-8', flag: 'wx' });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass (incl. existing init test)**

Run: `npx vitest run tests/unit/adapters/fs-project-initializer.test.ts tests/unit/use-cases/init-project-memory.test.ts`
Expected: PASS. Существующий тест use-case'а завязан на `initProjectMemory`, не на перезапись — остаётся зелёным.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/fs/fs-project-initializer.ts tests/unit/adapters/fs-project-initializer.test.ts
git commit -m "fix: FsProjectInitializer — ensure-семантика конфига (flag wx), повторный init не перезаписывает config.yaml"
```

---

### Task 7: Расширение withMemoryLock — произвольное имя лок-файла

**Files:**

- Modify: `src/adapters/fs/memory-lock.ts`
- Modify: `tests/unit/adapters/memory-lock.test.ts` (добавить кейс)

- [ ] **Step 1: Write the failing test**

Добавь в конец `tests/unit/adapters/memory-lock.test.ts` (файл существует — сохрани его импорты; при отсутствии добавь в шапку: `mkdtempSync, rmSync, existsSync` из `'fs'`, `tmpdir` из `'os'`, `join` из `'path'`, `withMemoryLock` из `'../../../src/adapters/fs/memory-lock.js'`):

```ts
describe('withMemoryLock custom lock file name (для .wolf/migrate.lock)', () => {
  it('creates the named lock file inside dir during fn and removes it after', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wolf-migratelock-'));
    try {
      let seenDuringFn = false;
      await withMemoryLock(
        dir,
        async () => {
          seenDuringFn = existsSync(join(dir, 'migrate.lock'));
        },
        undefined,
        'migrate.lock'
      );
      expect(seenDuringFn).toBe(true);
      expect(existsSync(join(dir, 'migrate.lock'))).toBe(false);
      expect(existsSync(join(dir, '.lock'))).toBe(false); // дефолтное имя не используется
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/adapters/memory-lock.test.ts`
Expected: FAIL — `withMemoryLock` не принимает 4-й аргумент / `seenDuringFn` false (файл `migrate.lock` не создаётся).

- [ ] **Step 3: Extend withMemoryLock**

В `src/adapters/fs/memory-lock.ts` замени `lockPathFor` и `withMemoryLock` (остальное без изменений):

```ts
function lockPathFor(dir: string, lockFileName: string): string {
  return join(dir, lockFileName);
}
```

```ts
export async function withMemoryLock<T>(
  dir: string,
  fn: () => Promise<T>,
  opts?: LockOpts,
  lockFileName: string = '.lock'
): Promise<T> {
  mkdirSync(dir, { recursive: true });
  const maxWaitMs = opts?.maxWaitMs ?? LOCK_TIMING.MAX_WAIT_MS;
  const staleMs = opts?.staleMs ?? LOCK_TIMING.STALE_MS;
  const retryMs = LOCK_TIMING.RETRY_MS;
  const path = lockPathFor(dir, lockFileName);

  const deadline = Date.now() + maxWaitMs;

  while (true) {
    if (tryAcquire(path)) {
      try {
        return await fn();
      } finally {
        try {
          unlinkSync(path);
        } catch {
          /* already gone */
        }
      }
    }

    const { stolen, holderPid } = stealIfStale(path, staleMs);
    if (!stolen) {
      if (Date.now() >= deadline) throw new LockHeldError(path, holderPid);
      await new Promise<void>((r) => setTimeout(r, retryMs));
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/adapters/memory-lock.test.ts`
Expected: PASS — все кейсы, включая новый (обратная совместимость `.lock` не сломана).

- [ ] **Step 5: Commit**

```bash
git add src/adapters/fs/memory-lock.ts tests/unit/adapters/memory-lock.test.ts
git commit -m "feat: withMemoryLock — параметр lockFileName (для эксклюзивного .wolf/migrate.lock)"
```

---

### Task 8: Маркер версии схемы — schema_version

**Files:**

- Create: `src/adapters/fs/schema-version.ts`
- Modify: `src/domain/taxonomy.ts` (поле `WolfConfig.schemaVersion`)
- Modify: `src/adapters/fs/config-file.ts` (schema в load/render)
- Test: `tests/unit/adapters/schema-version.test.ts`

- [ ] **Step 1: Write the failing test**

Создай `tests/unit/adapters/schema-version.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  CURRENT_SCHEMA_VERSION,
  LEGACY_SCHEMA_VERSION,
  readSchemaVersion,
  writeSchemaVersionIfAbsent,
} from '../../../src/adapters/fs/schema-version.js';
import { loadWolfConfigSync, renderConfigYaml } from '../../../src/adapters/fs/config-file.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wolf-schema-'));
  mkdirSync(join(dir, '.wolf'), { recursive: true });
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const cfg = (body: string) => writeFileSync(join(dir, '.wolf', 'config.yaml'), body);

describe('readSchemaVersion', () => {
  it('null when project is not initialized (no .wolf/config.yaml)', async () => {
    expect(await readSchemaVersion(dir)).toBeNull();
  });

  it('LEGACY (1) when marker absent — dogfooder projects (спека §3 уровень 2)', async () => {
    cfg('artifact_sources: []\n');
    expect(await readSchemaVersion(dir)).toBe(LEGACY_SCHEMA_VERSION);
  });

  it('reads explicit marker', async () => {
    cfg('artifact_sources: []\nschema_version: 2\n');
    expect(await readSchemaVersion(dir)).toBe(2);
  });

  it('corrupted yaml → UserFacingError with --recreate hint (спека §6)', async () => {
    cfg('{broken');
    await expect(readSchemaVersion(dir)).rejects.toThrow(/--recreate/);
  });
});

describe('writeSchemaVersionIfAbsent', () => {
  it('appends schema_version to an existing config, keeps other keys', async () => {
    cfg('artifact_sources: [docs]\n');
    await writeSchemaVersionIfAbsent(dir);
    const raw = readFileSync(join(dir, '.wolf', 'config.yaml'), 'utf-8');
    expect(raw).toContain('artifact_sources');
    expect(raw).toContain(`schema_version: ${CURRENT_SCHEMA_VERSION}`);
    expect(await readSchemaVersion(dir)).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('no-op when marker is current (file content identical)', async () => {
    const body = `artifact_sources: [docs]\nschema_version: ${CURRENT_SCHEMA_VERSION}\n`;
    cfg(body);
    await writeSchemaVersionIfAbsent(dir);
    expect(readFileSync(join(dir, '.wolf', 'config.yaml'), 'utf-8')).toBe(body);
  });

  it('no-op when config missing (init has not run yet)', async () => {
    await writeSchemaVersionIfAbsent(dir);
    expect(await readSchemaVersion(dir)).toBeNull();
  });
});

describe('marker survives taxonomy sync (load → renderConfigYaml)', () => {
  it('renderConfigYaml keeps schema_version from loaded config', async () => {
    cfg(`artifact_sources: []\nschema_version: ${CURRENT_SCHEMA_VERSION}\n`);
    const loaded = loadWolfConfigSync(dir);
    expect(loaded?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const rendered = renderConfigYaml(loaded);
    expect(rendered).toContain(`schema_version: ${CURRENT_SCHEMA_VERSION}`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/adapters/schema-version.test.ts`
Expected: FAIL — `Cannot find module .../schema-version.js`; кейс roundtrip тоже падает (`loaded.schemaVersion` undefined, в рендере нет `schema_version`).

- [ ] **Step 3: Implement**

Создай `src/adapters/fs/schema-version.ts`:

```ts
import * as fs from 'fs/promises';
import yaml from 'js-yaml';
import { configPath } from './project-paths.js';
import { writeFileAtomic } from './markdown-memory-store.js';
import { UserFacingError } from '../../domain/errors.js';

/** Версия схемы layout v2 (+ маркер в config.yaml). Легаси-проекты без маркера = 1. */
export const CURRENT_SCHEMA_VERSION = 2;
export const LEGACY_SCHEMA_VERSION = 1;

function parseConfig(raw: string): Record<string, unknown> {
  try {
    const doc = yaml.load(raw);
    return doc !== null && typeof doc === 'object' ? (doc as Record<string, unknown>) : {};
  } catch (err) {
    throw new UserFacingError(
      `.wolf/config.yaml is corrupted: ${err instanceof Error ? err.message : String(err)}. Fix it manually or run: wolf init --recreate`
    );
  }
}

/** Версия схемы проекта; null = проект не инициализирован (.wolf/config.yaml отсутствует). */
export async function readSchemaVersion(baseDir: string): Promise<number | null> {
  let raw: string;
  try {
    raw = await fs.readFile(configPath(baseDir), 'utf-8');
  } catch {
    return null;
  }
  const doc = parseConfig(raw);
  return typeof doc.schema_version === 'number' ? doc.schema_version : LEGACY_SCHEMA_VERSION;
}

/** Проставляет schema_version: CURRENT, если маркер отсутствует. Атомарно (tmp + rename). */
export async function writeSchemaVersionIfAbsent(baseDir: string): Promise<void> {
  let raw: string;
  try {
    raw = await fs.readFile(configPath(baseDir), 'utf-8');
  } catch {
    return; // нет конфига — init ещё не прошёл
  }
  const doc = parseConfig(raw);
  if (doc.schema_version === CURRENT_SCHEMA_VERSION) return;
  doc.schema_version = CURRENT_SCHEMA_VERSION;
  await writeFileAtomic(configPath(baseDir), yaml.dump(doc, { sortKeys: false, lineWidth: 120 }));
}
```

В `src/domain/taxonomy.ts` добавь поле в интерфейс `WolfConfig` (рядом с `artifact_sources`):

```ts
  /** Маркер версии схемы проекта (спека §3, уровень 2); отсутствует = легаси. */
  schemaVersion?: number;
```

В `src/adapters/fs/config-file.ts` — четыре правки:

1. Импорт в шапке: `import { CURRENT_SCHEMA_VERSION } from './schema-version.js';`
2. В `ConfigFileSchema` первой строкой внутри `z.object({...})`:

```ts
  schema_version: z.number().int().optional().catch(undefined),
```

3. В объекте возврата ОБЕИХ функций `loadWolfConfig` и `loadWolfConfigSync` (после `artifact_sources: ...`):

```ts
    schemaVersion: cfg.schema_version,
```

4. В `renderConfigYaml` в объект `doc` (сразу после ключа `'# comment'`, до `artifact_sources`):

```ts
    schema_version: existing?.schemaVersion ?? CURRENT_SCHEMA_VERSION,
```

- [ ] **Step 4: Run tests to verify they pass (incl. existing config-file tests)**

Run: `npx vitest run tests/unit/adapters/schema-version.test.ts tests/unit/adapters/config-file.test.ts`
Expected: PASS. Если существующий тест config-file сравнивает рендер буквально — добавь в его ожидание строку `schema_version: 2` (детерминированное изменение рендера).

- [ ] **Step 5: Commit**

```bash
git add src/adapters/fs/schema-version.ts src/domain/taxonomy.ts src/adapters/fs/config-file.ts tests/unit/adapters/schema-version.test.ts tests/unit/adapters/config-file.test.ts
git commit -m "feat: маркер schema_version в .wolf/config.yaml — read/write атомарно, переживает taxonomy sync"
```

---

### Task 9: isNpxRun + use-case initProject

**Files:**

- Create: `src/domain/npx.ts`
- Create: `src/app/use-cases/init-project.ts`
- Test: `tests/unit/domain/npx.test.ts`
- Test: `tests/unit/use-cases/init-project.test.ts`

- [ ] **Step 1: Write the failing tests**

Создай `tests/unit/domain/npx.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isNpxRun } from '../../../src/domain/npx.js';

describe('isNpxRun (спека §3: npx-путь никогда не пишет MCP-конфиг)', () => {
  it('true when npm_command === npx (set by the npx shim)', () => {
    expect(isNpxRun({ npm_command: 'npx' } as NodeJS.ProcessEnv)).toBe(true);
  });

  it('false for regular npm scripts', () => {
    expect(isNpxRun({ npm_command: 'run-script' } as NodeJS.ProcessEnv)).toBe(false);
  });

  it('false for plain node execution / global bin', () => {
    expect(isNpxRun({} as NodeJS.ProcessEnv)).toBe(false);
  });
});
```

Создай `tests/unit/use-cases/init-project.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initProject, looksLikeProjectRoot } from '../../../src/app/use-cases/init-project.js';
import { ProjectInitializer } from '../../../src/ports/project-initializer.port.js';
import { PlatformAdapter, PlatformConfig, McpCommand } from '../../../src/ports/platform-adapter.port.js';
import { CURRENT_SCHEMA_VERSION } from '../../../src/adapters/fs/schema-version.js';
import type { ProjectSnapshot } from '../../../src/domain/schemas/project-scan-schema.js';

/* ---------- fakes ---------- */

class FakeInitializer implements ProjectInitializer {
  calls = 0;
  async initialize(): Promise<void> {
    this.calls += 1;
  }
}

class FakeAdapter implements PlatformAdapter {
  writeCalls = 0;
  removeCalls = 0;
  constructor(
    readonly id: string,
    private readonly detected: boolean
  ) {}
  detect(): boolean {
    return this.detected;
  }
  async readConfig(): Promise<PlatformConfig | null> {
    return null;
  }
  async writeConfig(): Promise<'written' | 'replaced' | 'unchanged'> {
    this.writeCalls += 1;
    return 'written';
  }
  async removeWolf(): Promise<boolean> {
    this.removeCalls += 1;
    return true;
  }
}

class FakeRegistry {
  registered: { path: string; schemaVersion: number }[] = [];
  async register(path: string, schemaVersion: number): Promise<void> {
    this.registered.push({ path, schemaVersion });
  }
}

const emptySnapshot = {
  root: '/proj',
  projectName: 'proj',
  branch: null,
  commit: null,
  files: [],
  docs: [],
  summary: {
    languages: [],
    entryPoints: [],
    configFiles: [],
    dependencies: [],
    topLevelDirectories: [],
    fileCount: 0,
  },
} as unknown as ProjectSnapshot;

const markSpy = { calls: 0 };

function makeDeps(adapters: FakeAdapter[], opts: { npx?: boolean } = {}) {
  return {
    initializer: new FakeInitializer(),
    registry: new FakeRegistry(),
    adapters,
    mcpCommand: { command: 'wolf', args: ['mcp'] } as McpCommand,
    npx: opts.npx ?? false,
    scanDeps: {
      store: {
        get: async () => null,
        save: async () => {},
        list: async () => [],
        update: async (_id: string, patch: unknown) => patch,
      },
      log: { append: async () => {} },
      clock: { now: () => new Date('2026-08-30T00:00:00Z') },
      idGen: { generateEventId: () => 'evt_1', generateObjectId: () => 'obj_1' },
      scanner: { scan: async () => emptySnapshot },
    } as unknown as Parameters<typeof scanProject>[0],
    markSchemaCurrent: async () => {
      markSpy.calls += 1;
    },
  };
}

/* ---------- env ---------- */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wolf-init-uc-'));
  markSpy.calls = 0;
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/* ---------- tests ---------- */

describe('looksLikeProjectRoot (спека §6: init вне проекта → диагностика, ничего не создаётся)', () => {
  it('empty dir is not a project root', () => {
    expect(looksLikeProjectRoot(dir)).toBe(false);
  });

  it('package.json makes it a project root', () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    expect(looksLikeProjectRoot(dir)).toBe(true);
  });
});

describe('initProject', () => {
  it('outside a project: throws UserFacingError, nothing created', async () => {
    const deps = makeDeps([]);
    await expect(initProject(deps, dir)).rejects.toThrow(/Not a project root/);
    expect(deps.initializer.calls).toBe(0);
    expect(deps.registry.registered).toHaveLength(0);
  });

  it('auto-detect: writes only detected platforms, marks schema, registers project', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const oc = new FakeAdapter('opencode', true);
    const claude = new FakeAdapter('claude', false);
    const deps = makeDeps([oc, claude]);
    const result = await initProject(deps, dir);
    expect(result.platformOutcomes).toEqual([{ platform: 'opencode', action: 'written' }]);
    expect(oc.writeCalls).toBe(1);
    expect(claude.writeCalls).toBe(0);
    expect(markSpy.calls).toBe(1);
    expect(deps.registry.registered).toEqual([{ path: dir, schemaVersion: CURRENT_SCHEMA_VERSION }]);
    expect(result.documentCount).toBe(0);
  });

  it('no platform detected: warning+skip outcome, init still succeeds (память создана)', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const deps = makeDeps([new FakeAdapter('opencode', false), new FakeAdapter('claude', false)]);
    const result = await initProject(deps, dir);
    expect(result.platformOutcomes).toEqual([
      { platform: 'none', action: 'skipped', reason: 'no platform detected; use --platform opencode|claude' },
    ]);
    expect(deps.registry.registered).toHaveLength(1);
  });

  it('explicit --platform list REPLACES the set: non-listed detected platform loses its wolf entry', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const oc = new FakeAdapter('opencode', true);
    const claude = new FakeAdapter('claude', true);
    const deps = makeDeps([oc, claude]);
    const result = await initProject(deps, dir, { platformIds: ['opencode'] });
    expect(result.platformOutcomes).toEqual([
      { platform: 'opencode', action: 'written' },
      { platform: 'claude', action: 'removed', reason: 'wolf entry removed (--platform list)' },
    ]);
    expect(oc.removeCalls).toBe(0);
    expect(claude.removeCalls).toBe(1);
  });

  it('explicit --platform works even without markers (forced write)', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const oc = new FakeAdapter('opencode', false);
    const deps = makeDeps([oc]);
    const result = await initProject(deps, dir, { platformIds: ['opencode'] });
    expect(result.platformOutcomes).toEqual([{ platform: 'opencode', action: 'written' }]);
    expect(oc.writeCalls).toBe(1);
  });

  it('npx run: NEVER writes MCP configs, honest warning outcome', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const oc = new FakeAdapter('opencode', true);
    const deps = makeDeps([oc], { npx: true });
    const result = await initProject(deps, dir);
    expect(result.npx).toBe(true);
    expect(result.platformOutcomes).toEqual([
      { platform: 'npx', action: 'skipped', reason: 'npx try-out never writes MCP configs' },
    ]);
    expect(oc.writeCalls).toBe(0);
    expect(oc.removeCalls).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/domain/npx.test.ts tests/unit/use-cases/init-project.test.ts`
Expected: FAIL — `Cannot find module .../npx.js`, `Cannot find module .../init-project.js`

- [ ] **Step 3: Implement**

Создай `src/domain/npx.ts`:

```ts
/**
 * Критерий npx-запуска (спека §3): под npx проверка «wolf на PATH» всегда истинна
 * (шим из _npx-кэша), поэтому критерий — сам факт npx-запуска: npm ставит npm_command='npx'.
 */
export function isNpxRun(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.npm_command === 'npx';
}
```

Создай `src/app/use-cases/init-project.ts`:

```ts
import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import { join } from 'path';
import { ProjectInitializer } from '../../ports/project-initializer.port.js';
import { PlatformAdapter, McpCommand } from '../../ports/platform-adapter.port.js';
import { scanProject } from './scan-project.js';
import { writeSchemaVersionIfAbsent, CURRENT_SCHEMA_VERSION } from '../../adapters/fs/schema-version.js';
import { renderConfigYaml } from '../../adapters/fs/config-file.js';
import { configPath } from '../../adapters/fs/project-paths.js';
import { writeFileAtomic } from '../../adapters/fs/markdown-memory-store.js';
import { UserFacingError } from '../../domain/errors.js';

/** Минимальный контракт реестра для init (структурно совместим с ProjectsRegistry). */
export interface ProjectRegistry {
  register(path: string, schemaVersion: number): Promise<void>;
}

export interface InitProjectDeps {
  initializer: ProjectInitializer;
  registry: ProjectRegistry;
  adapters: PlatformAdapter[];
  mcpCommand: McpCommand;
  /** true, когда бинарник запущен через npx (try-out: MCP-конфиги не пишем никогда). */
  npx: boolean;
  scanDeps: Parameters<typeof scanProject>[0];
  /** Проставить маркер версии схемы (writeSchemaVersionIfAbsent). */
  markSchemaCurrent: (baseDir: string) => Promise<void>;
}

export interface PlatformInitOutcome {
  platform: string;
  action: 'written' | 'replaced' | 'unchanged' | 'skipped' | 'removed';
  reason?: string;
}

export interface InitProjectResult {
  npx: boolean;
  documentCount: number;
  platformOutcomes: PlatformInitOutcome[];
}

const PROJECT_ROOT_MARKERS = ['package.json', '.git', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'README.md'];

export function looksLikeProjectRoot(dir: string): boolean {
  return PROJECT_ROOT_MARKERS.some((marker) => existsSync(join(dir, marker)));
}

/**
 * `wolf init` (спека §3, уровень 1): идемпотентный, неинтерактивный.
 * Скелет (ensure) → маркер схемы → лёгкий scan (document-ref'ы идемпотентны; глубокое
 * наполнение — отдельная команда `wolf bootstrap`) → платформы → реестр.
 */
export async function initProject(
  deps: InitProjectDeps,
  baseDir: string,
  opts: { platformIds?: string[] } = {}
): Promise<InitProjectResult> {
  if (!looksLikeProjectRoot(baseDir)) {
    throw new UserFacingError(
      'Not a project root (no package.json/.git/pyproject.toml/go.mod/Cargo.toml/README.md found). cd into your project first.'
    );
  }

  await deps.initializer.initialize(baseDir);
  await deps.markSchemaCurrent(baseDir);
  const scan = await scanProject(deps.scanDeps, baseDir);

  const platformOutcomes: PlatformInitOutcome[] = [];
  if (deps.npx) {
    // try-out: память создаём, конфиги — никогда (спека §3, npx-путь)
    platformOutcomes.push({ platform: 'npx', action: 'skipped', reason: 'npx try-out never writes MCP configs' });
  } else if (opts.platformIds !== undefined) {
    // явный список ЗАМЕНЯЕТ набор: wolf-записи платформ вне списка удаляются (спека §3)
    const wanted = new Set(opts.platformIds);
    for (const adapter of deps.adapters) {
      if (wanted.has(adapter.id)) {
        platformOutcomes.push({ platform: adapter.id, action: await adapter.writeConfig(baseDir, deps.mcpCommand) });
      } else if (adapter.detect(baseDir)) {
        const removed = await adapter.removeWolf(baseDir);
        platformOutcomes.push({
          platform: adapter.id,
          action: 'removed',
          reason: removed ? 'wolf entry removed (--platform list)' : 'no wolf entry',
        });
      }
    }
  } else {
    // авто-детект: объединение найденных; «платформа не детектирована» — warning + skip
    const detected = deps.adapters.filter((a) => a.detect(baseDir));
    if (detected.length === 0) {
      platformOutcomes.push({
        platform: 'none',
        action: 'skipped',
        reason: 'no platform detected; use --platform opencode|claude',
      });
    } else {
      for (const adapter of detected) {
        platformOutcomes.push({ platform: adapter.id, action: await adapter.writeConfig(baseDir, deps.mcpCommand) });
      }
    }
  }

  await deps.registry.register(baseDir, CURRENT_SCHEMA_VERSION);

  return { npx: deps.npx, documentCount: scan.documents.length, platformOutcomes };
}

/**
 * §6: повреждённый .wolf → неинтерактивное восстановление:
 * бэкап конфига в .wolf/backup/<ts>/ + дефолтный рендер. Валидный конфиг не трогаем.
 */
export async function recreateConfig(baseDir: string): Promise<void> {
  const cfgPath = configPath(baseDir);
  let raw: string | null = null;
  try {
    raw = await fs.readFile(cfgPath, 'utf-8');
  } catch {
    return; // конфига нет — init создаст скелет
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(baseDir, '.wolf', 'backup', stamp);
  await fs.mkdir(backupDir, { recursive: true });
  await fs.copyFile(cfgPath, join(backupDir, 'config.yaml'));
  await writeFileAtomic(cfgPath, renderConfigYaml(null));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/domain/npx.test.ts tests/unit/use-cases/init-project.test.ts`
Expected: PASS (3 + 8 tests). Если tsc ругается на литерал `emptySnapshot` — сверь тип `ProjectSnapshot` в `src/domain/schemas/project-scan-schema.ts` и при нуллабельных `branch/commit` оставь `as unknown as ProjectSnapshot` (уже в тесте).

- [ ] **Step 5: Commit**

```bash
git add src/domain/npx.ts src/app/use-cases/init-project.ts tests/unit/domain/npx.test.ts tests/unit/use-cases/init-project.test.ts
git commit -m "feat: use-case initProject — ensure-скелет, маркер схемы, авто-детект платформ, npx-try-out, реестр"
```

---

### Task 10: CLI-команда init — --platform, --recreate, вывод, exit-семантика

**Files:**

- Modify: `src/adapters/cli/commands/memory-init.ts`

- [ ] **Step 1: Rewrite the command**

Замени `src/adapters/cli/commands/memory-init.ts` целиком:

```ts
import { Command } from 'commander';
import { join } from 'path';
import { createCliContainer } from '../../../bootstrap/container.js';
import { ProjectsRegistry } from '../../../adapters/fs/projects-registry.js';
import { wolfUserConfigDir } from '../../../adapters/fs/user-config.js';
import { PLATFORM_ADAPTERS, CANONICAL_MCP_COMMAND } from '../../../adapters/platforms/index.js';
import { writeSchemaVersionIfAbsent } from '../../../adapters/fs/schema-version.js';
import { initProject, recreateConfig } from '../../../app/use-cases/init-project.js';
import { isNpxRun } from '../../../domain/npx.js';
import { UserFacingError } from '../../../domain/errors.js';

export function memoryInitCommand(): Command {
  return new Command('init')
    .description('Initialize Mr. Wolf memory for this project (idempotent, non-interactive)')
    .option('--platform <ids>', 'explicit platform list (comma-separated: opencode,claude); replaces the current set')
    .option('--recreate', 'backup a corrupted .wolf/config.yaml and re-create it from defaults', false)
    .action(async (options: { platform?: string; recreate?: boolean }) => {
      const baseDir = process.cwd();
      if (options.recreate) await recreateConfig(baseDir);

      let platformIds: string[] | undefined;
      if (options.platform !== undefined) {
        platformIds = options.platform
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s !== '');
        const known = new Set(PLATFORM_ADAPTERS.map((a) => a.id));
        const unknown = platformIds.filter((id) => !known.has(id));
        if (unknown.length > 0) {
          throw new UserFacingError(`Unknown platform(s): ${unknown.join(', ')} (known: ${[...known].join(', ')})`);
        }
      }

      const { initializer, store, log, clock, idGen, scanner, index, lock } = createCliContainer(baseDir);
      const registry = new ProjectsRegistry(wolfUserConfigDir());
      const result = await initProject(
        {
          initializer,
          registry,
          adapters: PLATFORM_ADAPTERS,
          mcpCommand: CANONICAL_MCP_COMMAND,
          npx: isNpxRun(),
          scanDeps: { store, log, clock, idGen, scanner, index, lock },
          markSchemaCurrent: (dir) => writeSchemaVersionIfAbsent(dir),
        },
        baseDir,
        { platformIds }
      );

      console.log('# wolf init');
      console.log(`- memory skeleton: ensured (${join(baseDir, '.wolf')})`);
      console.log(`- scan: ${result.documentCount} document(s) registered`);
      for (const outcome of result.platformOutcomes) {
        const label =
          outcome.platform === 'none' || outcome.platform === 'npx'
            ? 'platform configs'
            : `platform ${outcome.platform}`;
        console.log(`- ${label}: ${outcome.action}${outcome.reason ? ` — ${outcome.reason}` : ''}`);
      }
      if (result.npx) {
        console.log(
          '  → this was an npx try-out; to connect your platform: npm install -g mister-wolf, then re-run: wolf init'
        );
      } else {
        console.log('Restart your agent platform to pick up the MCP server.');
        if (result.platformOutcomes.some((o) => o.platform === 'claude' && o.action !== 'removed')) {
          console.log('Claude Code: approve the project-scoped MCP server on first start.');
        }
      }
      console.log(`Project registered: ${join(wolfUserConfigDir(), 'projects.yaml')}`);

      // §3: ненулевой exit — только если при явном --platform не записано ни одного конфига
      const wroteSomething = result.platformOutcomes.some((o) =>
        ['written', 'replaced', 'unchanged'].includes(o.action)
      );
      if (platformIds !== undefined && !wroteSomething) process.exitCode = 1;
    });
}
```

- [ ] **Step 2: Build and smoke-run**

Run: `npm run build`
Expected: компиляция без ошибок.

Run (изолированный tmp-проект, реальный XDG не трогаем):

```bash
TMP=$(mktemp -d) && cd "$TMP" && echo '{}' > package.json && echo '{}' > opencode.json && \
XDG_CONFIG_HOME="$TMP/xdg" node "$(git rev-parse --show-toplevel)/dist/bootstrap/cli.js" init && \
cat "$TMP/opencode.json" && echo && cat "$TMP/xdg/wolf/projects.yaml" && \
XDG_CONFIG_HOME="$TMP/xdg" node "$(git rev-parse --show-toplevel)/dist/bootstrap/cli.js" init && \
cd "$(git rev-parse --show-toplevel)" && rm -rf "$TMP"
```

Expected: первый init — `- platform opencode: written` + `Restart your agent platform...`; `opencode.json` содержит `"mcp": { "wolf": { "type": "local", "command": ["wolf", "mcp"], "enabled": true } }`; `projects.yaml` содержит путь tmp-проекта; второй init — `- platform opencode: unchanged`, exit 0, содержимое `opencode.json` байт-в-байт то же.

- [ ] **Step 3: Run full unit suite**

Run: `npx vitest run`
Expected: PASS — весь юнит-набор зелёный (изменение команды не ломает существующие тесты).

- [ ] **Step 4: Commit**

```bash
git add src/adapters/cli/commands/memory-init.ts
git commit -m "feat: wolf init — --platform (replace-семантика), --recreate, per-platform вывод, exit-семантика, npx-предупреждение"
```

---

### Task 11: schema-guard — ленивая миграция с локом, бэкапом и отказом на схеме из будущего

**Files:**

- Create: `src/adapters/fs/schema-guard.ts`
- Test: `tests/unit/adapters/schema-guard.test.ts`

- [ ] **Step 1: Write the failing test**

Создай `tests/unit/adapters/schema-guard.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ensureCurrentSchema } from '../../../src/adapters/fs/schema-guard.js';
import { CURRENT_SCHEMA_VERSION } from '../../../src/adapters/fs/schema-version.js';
import { UserFacingError } from '../../../src/domain/errors.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wolf-guard-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Легаси-проект догфудера: .wolf/config.yaml без маркера + layout v1 (objects/). */
function initLegacyProject(): void {
  mkdirSync(join(dir, '.wolf', 'memory', 'objects', 'decision'), { recursive: true });
  writeFileSync(join(dir, '.wolf', 'config.yaml'), 'artifact_sources: []\n');
  writeFileSync(
    join(dir, '.wolf', 'memory', 'objects', 'decision', 'mem_legacy.md'),
    '---\nid: mem_legacy\ntype: decision\ntitle: Legacy decision\nstatus: active\nreview_state: accepted\nconfidence: medium\nimportance: 0.5\ncreated_at: 2026-06-29T14:00:00Z\nupdated_at: 2026-06-29T14:00:00Z\ncreated_by: user:test\nschema_version: 1\nsource:\n  kind: manual\nrelated:\n  files: []\n  docs: []\n  decisions: []\ntags: []\nsuperseded_by: null\n---\n\nBody text.\n'
  );
}

function backupStamps(): string[] {
  const backupRoot = join(dir, '.wolf', 'backup');
  return existsSync(backupRoot) ? readdirSync(backupRoot) : [];
}

describe('ensureCurrentSchema (спека §3 уровень 2)', () => {
  it('uninitialized project (no .wolf) → ok, no side effects', async () => {
    expect(await ensureCurrentSchema(dir)).toBe('ok');
    expect(existsSync(join(dir, '.wolf'))).toBe(false);
  });

  it('current project → ok, config untouched', async () => {
    mkdirSync(join(dir, '.wolf'), { recursive: true });
    const body = `artifact_sources: [docs]\nschema_version: ${CURRENT_SCHEMA_VERSION}\n`;
    writeFileSync(join(dir, '.wolf', 'config.yaml'), body);
    expect(await ensureCurrentSchema(dir)).toBe('ok');
    expect(readFileSync(join(dir, '.wolf', 'config.yaml'), 'utf-8')).toBe(body);
  });

  it('legacy project → migrated: layout v2 applied, marker set, backup created', async () => {
    initLegacyProject();
    const result = await ensureCurrentSchema(dir);
    expect(result).toBe('migrated');
    // маркер проставлен
    expect(readFileSync(join(dir, '.wolf', 'config.yaml'), 'utf-8')).toContain(
      `schema_version: ${CURRENT_SCHEMA_VERSION}`
    );
    // layout-миграция выполнена: объект переехал из objects/
    expect(existsSync(join(dir, '.wolf', 'memory', 'objects', 'decision', 'mem_legacy.md'))).toBe(false);
    expect(existsSync(join(dir, '.wolf', 'memory', 'shared', 'decisions', 'mem_legacy.md'))).toBe(true);
    // бэкап носителя схемы: config.yaml + легаси-objects (SQLite-кэш не бэкапим — спека §3)
    const stamps = backupStamps();
    expect(stamps).toHaveLength(1);
    expect(existsSync(join(dir, '.wolf', 'backup', stamps[0], 'config.yaml'))).toBe(true);
    expect(existsSync(join(dir, '.wolf', 'backup', stamps[0], 'objects', 'decision', 'mem_legacy.md'))).toBe(true);
  });

  it('schema from the future → honest error, no writes (спека §3/§6)', async () => {
    mkdirSync(join(dir, '.wolf'), { recursive: true });
    const body = 'artifact_sources: []\nschema_version: 99\n';
    writeFileSync(join(dir, '.wolf', 'config.yaml'), body);
    await expect(ensureCurrentSchema(dir)).rejects.toThrow(UserFacingError);
    await expect(ensureCurrentSchema(dir)).rejects.toThrow(/npm install -g mister-wolf/);
    expect(readFileSync(join(dir, '.wolf', 'config.yaml'), 'utf-8')).toBe(body);
    expect(backupStamps()).toEqual([]);
  });

  it('concurrent migration: second caller under the same lock sees the finished state', async () => {
    initLegacyProject();
    const [a, b] = await Promise.all([ensureCurrentSchema(dir), ensureCurrentSchema(dir)]);
    expect([a, b]).toContain('migrated');
    expect(readFileSync(join(dir, '.wolf', 'config.yaml'), 'utf-8')).toContain(
      `schema_version: ${CURRENT_SCHEMA_VERSION}`
    );
    // ровно один бэкап: двойная миграция не прошла
    expect(backupStamps()).toHaveLength(1);
  });

  it('lock file is removed after migration (.wolf/migrate.lock)', async () => {
    initLegacyProject();
    await ensureCurrentSchema(dir);
    expect(existsSync(join(dir, '.wolf', 'migrate.lock'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/adapters/schema-guard.test.ts`
Expected: FAIL — `Cannot find module .../schema-guard.js`

- [ ] **Step 3: Implement schema-guard**

Создай `src/adapters/fs/schema-guard.ts`:

```ts
import * as fs from 'fs/promises';
import { join } from 'path';
import { withMemoryLock } from './memory-lock.js';
import { readSchemaVersion, writeSchemaVersionIfAbsent, CURRENT_SCHEMA_VERSION } from './schema-version.js';
import { applyLayoutMigration } from './layout-migration.js';
import { objectsDir } from './project-paths.js';
import { UserFacingError } from '../../domain/errors.js';

/**
 * Ленивая миграция схемы (спека §3, уровень 2): guard в точках входа (cli/mcp).
 * - проекта нет → 'ok' (команды сами дадут диагностику);
 * - схема новее бинаря → честный отказ «обнови wolf», без записи;
 * - легаси → миграция под эксклюзивным .wolf/migrate.lock, с бэкапом носителя схемы
 *   (fs-layout + config.yaml; SQLite — лишь кэш, не бэкапится), маркер пишется атомарно.
 */
export async function ensureCurrentSchema(baseDir: string): Promise<'ok' | 'migrated'> {
  const version = await readSchemaVersion(baseDir);
  if (version === null) return 'ok';
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new UserFacingError(
      `Project schema v${version} is newer than this wolf (supports v${CURRENT_SCHEMA_VERSION}). Update wolf: npm install -g mister-wolf`
    );
  }
  if (version === CURRENT_SCHEMA_VERSION) return 'ok';
  return withMemoryLock(join(baseDir, '.wolf'), () => migrateLegacy(baseDir), undefined, 'migrate.lock');
}

async function migrateLegacy(baseDir: string): Promise<'migrated'> {
  // повторная проверка под локом: параллельный процесс мог уже мигрировать
  const again = await readSchemaVersion(baseDir);
  if (again === CURRENT_SCHEMA_VERSION) return 'migrated';
  if (again !== null && again > CURRENT_SCHEMA_VERSION) {
    throw new UserFacingError(
      `Project schema v${again} is newer than this wolf (supports v${CURRENT_SCHEMA_VERSION}). Update wolf: npm install -g mister-wolf`
    );
  }

  // бэкап носителя схемы до изменения: config.yaml + легаси objects/ (спека §3)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(baseDir, '.wolf', 'backup', stamp);
  await fs.mkdir(backupDir, { recursive: true });
  await fs.copyFile(join(baseDir, '.wolf', 'config.yaml'), join(backupDir, 'config.yaml')).catch(() => undefined);
  await fs.cp(objectsDir(baseDir), join(backupDir, 'objects'), { recursive: true }).catch(() => undefined);

  await applyLayoutMigration(baseDir); // идемпотентен: пустой objects/ → no-op
  await writeSchemaVersionIfAbsent(baseDir); // проставит CURRENT атомарно
  return 'migrated';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/adapters/schema-guard.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/adapters/fs/schema-guard.ts tests/unit/adapters/schema-guard.test.ts
git commit -m "feat: ensureCurrentSchema — ленивая миграция под migrate.lock с бэкапом, отказ на схеме из будущего"
```

---

### Task 12: Guard в точках входа (cli.ts, mcp.ts) + e2e на легаси-проекте

**Files:**

- Modify: `src/adapters/cli/cli-entry.ts` (в `runCli`)
- Modify: `src/bootstrap/mcp.ts`
- Test: `tests/e2e/schema-guard.e2e.ts`

- [ ] **Step 1: Write the failing e2e test**

Создай `tests/e2e/schema-guard.e2e.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { repoRoot, tmpProject, ensureBuilt } from './helpers.js';

ensureBuilt();

const cli = join(repoRoot, 'dist', 'bootstrap', 'cli.js');

const legacyMd =
  '---\nid: mem_legacy\ntype: decision\ntitle: Legacy decision\nstatus: active\nreview_state: accepted\nconfidence: medium\nimportance: 0.5\ncreated_at: 2026-06-29T14:00:00Z\nupdated_at: 2026-06-29T14:00:00Z\ncreated_by: user:test\nschema_version: 1\nsource:\n  kind: manual\nrelated:\n  files: []\n  docs: []\n  decisions: []\ntags: []\nsuperseded_by: null\n---\n\nBody.\n';

describe('schema guard at entry points (спека §3 уровень 2)', () => {
  it('any wolf command lazily migrates a legacy project (backup + marker + layout v2)', () => {
    const project = tmpProject();
    writeFileSync(join(project, 'package.json'), '{}');
    mkdirSync(join(project, '.wolf', 'memory', 'objects', 'decision'), { recursive: true });
    writeFileSync(join(project, '.wolf', 'config.yaml'), 'artifact_sources: []\n');
    writeFileSync(join(project, '.wolf', 'memory', 'objects', 'decision', 'mem_legacy.md'), legacyMd);

    // guard стоит в runCli ДО parseAsync, поэтому достаточно любой команды, даже --version
    const res = spawnSync('node', [cli, '--version'], { cwd: project, encoding: 'utf-8', timeout: 30_000 });
    expect(res.status).toBe(0);
    // маркер проставлен
    expect(readFileSync(join(project, '.wolf', 'config.yaml'), 'utf-8')).toContain('schema_version: 2');
    // layout v2 применён
    expect(existsSync(join(project, '.wolf', 'memory', 'shared', 'decisions', 'mem_legacy.md'))).toBe(true);
    // бэкап создан
    expect(existsSync(join(project, '.wolf', 'backup'))).toBe(true);
  });

  it('schema from the future → honest error, exit 1, nothing written', () => {
    const project = tmpProject();
    writeFileSync(join(project, 'package.json'), '{}');
    mkdirSync(join(project, '.wolf'), { recursive: true });
    writeFileSync(join(project, '.wolf', 'config.yaml'), 'artifact_sources: []\nschema_version: 99\n');

    const res = spawnSync('node', [cli, '--version'], { cwd: project, encoding: 'utf-8', timeout: 30_000 });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('npm install -g mister-wolf');
    expect(readFileSync(join(project, '.wolf', 'config.yaml'), 'utf-8')).toBe(
      'artifact_sources: []\nschema_version: 99\n'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run --config tests/e2e/vitest.config.ts tests/e2e/schema-guard.e2e.ts`
Expected: FAIL — легаси-конфиг остаётся без `schema_version` (guard ещё не подключён; `--version` выходит 0 без миграции).

- [ ] **Step 3: Wire the guard into both entry points**

В `src/adapters/cli/cli-entry.ts`:

1. Импорт в шапке: `import { ensureCurrentSchema } from '../../adapters/fs/schema-guard.js';`
2. В `runCli` перед `parseAsync`:

```ts
export async function runCli(argv: string[]): Promise<void> {
  try {
    await ensureCurrentSchema(process.cwd());
    await createCli().parseAsync(argv);
  } catch (err: unknown) {
    if (err instanceof UserFacingError) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    throw err; // неожиданное исключение — стек сохраняется (unhandled rejection)
  }
}
```

Замени `src/bootstrap/mcp.ts` целиком:

```ts
import { buildMcpServer } from '../adapters/mcp/mcp-server.js';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { ensureCurrentSchema } from '../adapters/fs/schema-guard.js';

async function main() {
  await ensureCurrentSchema(process.cwd());
  const server = buildMcpServer(process.cwd());
  await serveStdio(async () => server);
}

main().catch((error) => {
  console.error('Fatal error in MCP server:', error);
  process.exit(1);
});
```

Внимание: MCP-сервер пишет в stdout только протокол — guard мигрирует молча (без console.log).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run build && npx vitest run --config tests/e2e/vitest.config.ts tests/e2e/schema-guard.e2e.ts`
Expected: PASS (2 tests)

Run: `npx vitest run` и `npm run e2e`
Expected: PASS. Если существующий e2e/integration-тест упал из-за guard — проверь, в каком `cwd` он спавнит CLI: guard корректен для любых tmp-проектов; repoRoot-спавны на легаси `.wolf` самого репо — это и есть проверяемое поведение (репо-проект мигрирует как легаси-догфудер, это ожидаемо и безопасно: бэкап создаётся).

- [ ] **Step 5: Commit**

```bash
git add src/adapters/cli/cli-entry.ts src/bootstrap/mcp.ts tests/e2e/schema-guard.e2e.ts
git commit -m "feat: миграционный guard в cli.ts и mcp.ts — проверка схемы при любой команде"
```

---

### Task 13: wolf doctor

**Files:**

- Create: `src/app/use-cases/doctor.ts`
- Create: `src/adapters/cli/commands/memory-doctor.ts`
- Modify: `src/adapters/cli/cli-entry.ts` (регистрация команды)
- Test: `tests/unit/use-cases/doctor.test.ts`

- [ ] **Step 1: Write the failing test**

Создай `tests/unit/use-cases/doctor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runDoctor } from '../../../src/app/use-cases/doctor.js';
import { CURRENT_SCHEMA_VERSION } from '../../../src/adapters/fs/schema-version.js';
import type { PlatformAdapter } from '../../../src/ports/platform-adapter.port.js';

/** Fake-адаптер: detect по списку путей, конфиг с/без wolf-записи. */
function fakeAdapter(id: string, detectedPaths: string[], wolfInPaths: string[] = []): PlatformAdapter {
  return {
    id,
    detect: (root: string) => detectedPaths.includes(root),
    readConfig: async (root: string) =>
      detectedPaths.includes(root) ? { mcp: wolfInPaths.includes(root) ? { wolf: {} } : {} } : null,
    writeConfig: async () => 'written',
    removeWolf: async () => false,
  } as PlatformAdapter;
}

function makeDeps(
  rows: { path: string; schema_version: number }[],
  existing: string[],
  adapters: PlatformAdapter[] = []
) {
  return {
    registry: {
      list: async () => rows.map((r) => ({ ...r, initialized_at: '2026-08-30T00:00:00.000Z' })),
      remove: async (path: string) => {
        const before = rows.length;
        const idx = rows.findIndex((r) => r.path === path);
        if (idx >= 0) rows.splice(idx, 1);
        return before !== rows.length;
      },
    },
    readSchema: async (path: string) => rows.find((r) => r.path === path)?.schema_version ?? null,
    exists: async (path: string) => existing.includes(path),
    adapters,
  };
}

describe('runDoctor (спека §3: версия бинаря vs схема, валидность конфигов платформ, чистка)', () => {
  it('ok for a current project', async () => {
    const deps = makeDeps([{ path: '/a', schema_version: CURRENT_SCHEMA_VERSION }], ['/a']);
    const report = await runDoctor(deps);
    expect(report.binarySchemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(report.entries).toEqual([{ path: '/a', status: 'ok', schemaVersion: CURRENT_SCHEMA_VERSION, issues: [] }]);
    expect(report.pruned).toEqual([]);
  });

  it('outdated-binary when project schema is newer (обнови wolf)', async () => {
    const deps = makeDeps([{ path: '/a', schema_version: CURRENT_SCHEMA_VERSION + 1 }], ['/a']);
    const report = await runDoctor(deps);
    expect(report.entries[0].status).toBe('outdated-binary');
  });

  it('outdated-project when project schema is legacy (ленивая миграция при следующей команде)', async () => {
    const deps = makeDeps([{ path: '/a', schema_version: 1 }], ['/a']);
    const report = await runDoctor(deps);
    expect(report.entries[0].status).toBe('outdated-project');
  });

  it('missing path → pruned from registry', async () => {
    const deps = makeDeps([{ path: '/gone', schema_version: CURRENT_SCHEMA_VERSION }], []);
    const report = await runDoctor(deps);
    expect(report.entries[0].status).toBe('missing');
    expect(report.pruned).toEqual(['/gone']);
  });

  it('empty registry → empty report', async () => {
    const deps = makeDeps([], []);
    const report = await runDoctor(deps);
    expect(report.entries).toEqual([]);
    expect(report.pruned).toEqual([]);
  });

  it('detected platform without wolf entry → issue with re-init hint (валидность конфигов платформ)', async () => {
    const adapter = fakeAdapter('opencode', ['/a'], []); // платформа есть, wolf-записи нет
    const deps = makeDeps([{ path: '/a', schema_version: CURRENT_SCHEMA_VERSION }], ['/a'], [adapter]);
    const report = await runDoctor(deps);
    expect(report.entries[0].issues).toEqual(['opencode: wolf entry missing — run wolf init']);
  });

  it('detected platform with wolf entry → no issues', async () => {
    const adapter = fakeAdapter('opencode', ['/a'], ['/a']);
    const deps = makeDeps([{ path: '/a', schema_version: CURRENT_SCHEMA_VERSION }], ['/a'], [adapter]);
    const report = await runDoctor(deps);
    expect(report.entries[0].issues).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/use-cases/doctor.test.ts`
Expected: FAIL — `Cannot find module .../doctor.js`

- [ ] **Step 3: Implement use-case and CLI command**

Создай `src/app/use-cases/doctor.ts`:

```ts
import { ProjectsRegistry } from '../../adapters/fs/projects-registry.js';
import { readSchemaVersion, CURRENT_SCHEMA_VERSION, LEGACY_SCHEMA_VERSION } from '../../adapters/fs/schema-version.js';
import { PlatformAdapter } from '../../ports/platform-adapter.port.js';

export type DoctorStatus = 'ok' | 'outdated-binary' | 'outdated-project' | 'missing';

export interface DoctorEntry {
  path: string;
  status: DoctorStatus;
  schemaVersion: number | null;
  /** Проблемы конфигов платформ (спека §3: «валидность конфигов платформ»). */
  issues: string[];
}

export interface DoctorReport {
  binarySchemaVersion: number;
  entries: DoctorEntry[];
  pruned: string[];
}

export interface DoctorDeps {
  registry: Pick<ProjectsRegistry, 'list' | 'remove'>;
  readSchema: (baseDir: string) => Promise<number | null>;
  exists: (p: string) => Promise<boolean>;
  adapters: PlatformAdapter[];
}

/**
 * `wolf doctor` (спека §3): по реестру проектов — версия бинаря vs схема каждого проекта,
 * валидность конфигов платформ (wolf-запись на месте?); мёртвые записи чистятся.
 */
export async function runDoctor(deps: DoctorDeps): Promise<DoctorReport> {
  const entries: DoctorEntry[] = [];
  const pruned: string[] = [];
  for (const proj of await deps.registry.list()) {
    if (!(await deps.exists(proj.path))) {
      await deps.registry.remove(proj.path);
      pruned.push(proj.path);
      entries.push({ path: proj.path, status: 'missing', schemaVersion: null, issues: [] });
      continue;
    }
    const v = (await deps.readSchema(proj.path)) ?? LEGACY_SCHEMA_VERSION;
    const status: DoctorStatus =
      v > CURRENT_SCHEMA_VERSION ? 'outdated-binary' : v < CURRENT_SCHEMA_VERSION ? 'outdated-project' : 'ok';
    const issues: string[] = [];
    if (status === 'ok') {
      for (const adapter of deps.adapters) {
        if (!adapter.detect(proj.path)) continue;
        const cfg = await adapter.readConfig(proj.path).catch(() => null);
        const mcp = cfg && typeof cfg === 'object' ? ((cfg.mcp ?? cfg.mcpServers) as Record<string, unknown>) : null;
        if (!mcp || mcp.wolf === undefined) {
          issues.push(`${adapter.id}: wolf entry missing — run wolf init`);
        }
      }
    }
    entries.push({ path: proj.path, status, schemaVersion: v, issues });
  }
  return { binarySchemaVersion: CURRENT_SCHEMA_VERSION, entries, pruned };
}
```

Создай `src/adapters/cli/commands/memory-doctor.ts`:

```ts
import { Command } from 'commander';
import { join } from 'path';
import { existsSync } from 'fs';
import { runDoctor } from '../../../app/use-cases/doctor.js';
import { ProjectsRegistry } from '../../../adapters/fs/projects-registry.js';
import { wolfUserConfigDir } from '../../../adapters/fs/user-config.js';
import { readSchemaVersion } from '../../../adapters/fs/schema-version.js';
import { PLATFORM_ADAPTERS } from '../../../adapters/platforms/index.js';

export function memoryDoctorCommand(): Command {
  return new Command('doctor')
    .description('Check all registered projects: binary vs schema version, platform configs, prune dead entries')
    .action(async () => {
      const registry = new ProjectsRegistry(wolfUserConfigDir());
      const report = await runDoctor({
        registry,
        readSchema: (p) => readSchemaVersion(p),
        exists: async (p) => existsSync(p),
        adapters: PLATFORM_ADAPTERS,
      });

      console.log(`# wolf doctor — binary schema v${report.binarySchemaVersion}`);
      console.log(`registry: ${join(wolfUserConfigDir(), 'projects.yaml')}`);
      console.log();
      if (report.entries.length === 0) {
        console.log('No registered projects. Run `wolf init` inside a project.');
        return;
      }
      for (const e of report.entries) {
        const schema = e.schemaVersion === null ? '-' : `v${e.schemaVersion}`;
        let hint = '';
        if (e.status === 'outdated-binary') hint = ' — update wolf: npm install -g mister-wolf';
        if (e.status === 'outdated-project') hint = ' — run any wolf command inside the project (lazy migration)';
        if (e.status === 'missing') hint = ' — pruned (path no longer exists)';
        console.log(`- ${e.path}: ${e.status} (schema ${schema})${hint}`);
        for (const issue of e.issues) {
          console.log(`  ! ${issue}`);
        }
      }
      if (report.pruned.length > 0) {
        console.log();
        console.log(`Pruned ${report.pruned.length} dead entr${report.pruned.length === 1 ? 'y' : 'ies'}.`);
      }
    });
}
```

В `src/adapters/cli/cli-entry.ts` зарегистрируй команду (рядом с остальными):

1. Импорт: `import { memoryDoctorCommand as doctorCommand } from './commands/memory-doctor.js';`
2. В `createCli()` после `program.addCommand(bootstrapCommand());` добавь: `program.addCommand(doctorCommand());`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/use-cases/doctor.test.ts && npm run build`
Expected: PASS (7 tests), сборка чистая.

Run (smoke, изолированный XDG):

```bash
TMP=$(mktemp -d) && cd "$TMP" && echo '{}' > package.json && \
XDG_CONFIG_HOME="$TMP/xdg" node "$(git rev-parse --show-toplevel)/dist/bootstrap/cli.js" init >/dev/null && \
XDG_CONFIG_HOME="$TMP/xdg" node "$(git rev-parse --show-toplevel)/dist/bootstrap/cli.js" doctor && \
cd "$(git rev-parse --show-toplevel)" && rm -rf "$TMP"
```

Expected: `- <tmp-path>: ok (schema v2)`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/use-cases/doctor.ts src/adapters/cli/commands/memory-doctor.ts src/adapters/cli/cli-entry.ts tests/unit/use-cases/doctor.test.ts
git commit -m "feat: wolf doctor — ревизия реестра проектов, версия бинаря vs схема, чистка мёртвых записей"
```

---

### Task 14: Дедуп bootstrap при повторе

**Files:**

- Modify: `src/app/use-cases/bootstrap-project.ts`
- Test: `tests/unit/use-cases/bootstrap-dedup.test.ts`

- [ ] **Step 1: Write the failing test**

Создай `tests/unit/use-cases/bootstrap-dedup.test.ts` (реальные адаптеры на tmp — как `layout-migration.test.ts`):

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { FsFileSystem } from '../../../src/adapters/fs/fs-file-system.js';
import { HeuristicProjectScanner } from '../../../src/adapters/fs/heuristic-project-scanner.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';
import { bootstrapProject } from '../../../src/app/use-cases/bootstrap-project.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wolf-dedup-'));
  writeFileSync(join(dir, 'package.json'), '{ "name": "dedup-test", "scripts": { "test": "vitest" } }');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function deps() {
  const fs = new FsFileSystem();
  return {
    store: new MarkdownMemoryStore(dir),
    log: new JsonlEventLog(eventsPath(dir)),
    clock: { now: () => new Date('2026-08-30T00:00:00Z') },
    idGen: new HashIdGenerator(),
    scanner: new HeuristicProjectScanner(fs),
    fs,
  };
}

describe('bootstrapProject dedup (спека §8: дедупликация при повторе)', () => {
  it('second run does not duplicate rules or work-threads', async () => {
    const d = deps();
    const first = await bootstrapProject(d, { baseDir: dir, createdBy: 'user:test' });
    const rulesAfterFirst = await d.store.list({ type: 'rule', status: 'proposed' });
    const threadsAfterFirst = await d.store.list({ type: 'work-thread' });
    expect(rulesAfterFirst.length).toBeGreaterThan(0);
    expect(threadsAfterFirst).toHaveLength(1);

    const second = await bootstrapProject(d, { baseDir: dir, createdBy: 'user:test' });
    const rulesAfterSecond = await d.store.list({ type: 'rule', status: 'proposed' });
    const threadsAfterSecond = await d.store.list({ type: 'work-thread' });

    expect(rulesAfterSecond.length).toBe(rulesAfterFirst.length);
    expect(threadsAfterSecond).toHaveLength(1);
    expect(threadsAfterSecond[0].id).toBe(threadsAfterFirst[0].id);
    // brief второго прогона переиспользует существующий thread
    expect(second.workThreadId).toBe(first.workThreadId);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/use-cases/bootstrap-dedup.test.ts`
Expected: FAIL — после второго прогона правил и work-thread'ов вдвое больше (`expected 2 to be 1` и т.п.).

- [ ] **Step 3: Implement dedup in bootstrapProject**

В `src/app/use-cases/bootstrap-project.ts`:

1. В функции `bootstrapProject` замени блок создания черновиков и work-thread (строки с `const drafts = ...` по `const { object: thread } = ...` и `return {...}`) на:

```ts
const { snapshot, documents } = await scanProject(deps, input.baseDir);
const testCommand = await readTestCommand(deps.fs, input.baseDir);
const drafts = draftRulesFromSnapshot(snapshot, testCommand);

// дедуп при повторе (спека §8): черновик с тем же title уже есть → пропускаем
const existingProposed = await deps.store.list({ type: 'rule', status: 'proposed' });
const draftsToCreate = drafts.filter((d) => !existingProposed.some((r) => r.title === d.title));
const skippedCount = drafts.length - draftsToCreate.length;

const rules: MemoryObject[] = [];
for (const draft of draftsToCreate) {
  const { object } = await addMemoryObject(deps, {
    type: 'rule',
    title: draft.title,
    body: draft.body,
    createdBy: input.createdBy,
    status: 'proposed',
    reviewState: 'proposed',
    confidence: 'low',
    importance: 0.3,
    tags: ['bootstrap', 'convention'],
    source: { kind: 'scan', path: snapshot.root },
    extra: { scope: 'project' },
  });
  rules.push(object);
}

// дедуп work-thread: повторный bootstrap переиспользует существующий
const BOOTSTRAP_THREAD_TITLE = 'Bootstrap: наполнение стартовой памяти';
const existingThread = (await deps.store.list({ type: 'work-thread' })).find((t) => t.title === BOOTSTRAP_THREAD_TITLE);
let threadId: string;
if (existingThread) {
  threadId = existingThread.id;
} else {
  const { object: thread } = await createWorkThread(deps, {
    title: BOOTSTRAP_THREAD_TITLE,
    goal: 'Свёртка черновиков Стюардом в принятые правила',
    currentState: `Создано черновиков правил: ${rules.length}; document-ref'ов: ${documents.length}.`,
    nextSteps: rules.map((rule) => `${rule.id}: ${rule.title}`),
    createdBy: input.createdBy,
  });
  threadId = thread.id;
}

return {
  rules,
  workThreadId: threadId,
  documentCount: documents.length,
  brief: renderBrief(rules, documents, threadId, skippedCount),
};
```

2. Обнови сигнатуру `renderBrief` (последний параметр) и строку «Создано»:

```ts
function renderBrief(
  rules: MemoryObject[],
  documents: MemoryObject[],
  workThreadId: string,
  skippedCount: number
): string {
  const lines = ['# Bootstrap brief', '', '## Создано'];
  lines.push(`- Proposed rules: ${rules.length}${skippedCount > 0 ? ` (+${skippedCount} already present)` : ''}`);
  for (const rule of rules) {
    lines.push(`  - ${rule.id}: ${rule.title}`);
  }
  lines.push(`- Document-refs: ${documents.length}`);
  lines.push(`- Work-thread: ${workThreadId}`);
  lines.push('');
  lines.push('## Финальный шаг');
  lines.push(
    'Вызови Стюарда (рамка .opencode/agents/steward.md) для свёртки черновиков — протокол: docs/guide/steward-bootstrap.md'
  );
  return lines.join('\n');
}
```

Примечание: платформо-нейтральный текст bootstrap-brief — вне scope (follow-up в спеке §8).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/use-cases/bootstrap-dedup.test.ts tests/unit/use-cases/bootstrap-project.test.ts`
Expected: PASS — новый тест + существующий тест bootstrap (если он ассертит точный brief — обнови ожидание: строка `Proposed rules: N` без изменений при skippedCount=0).

- [ ] **Step 5: Commit**

```bash
git add src/app/use-cases/bootstrap-project.ts tests/unit/use-cases/bootstrap-dedup.test.ts
git commit -m "fix: дедуп wolf bootstrap при повторе — правила и work-thread не дублируются"
```

---

### Task 15: README Installation + SECURITY.md

**Files:**

- Modify: `README.md` (секция «Быстрый старт» → «Installation»)
- Create: `SECURITY.md`

- [ ] **Step 1: Replace README quick-start section**

В `README.md` замени секцию `## Быстрый старт` (от заголовка до конца её код-блока; абзац про scaffold ниже — сохрани) на секцию ниже. Заголовок: `## Installation`. Внешний фенс здесь — четыре бэктика, чтобы вложенный bash-блок не закрыл его; в README попадает содержимое без внешнего фенса:

````markdown
## Installation

> [!WARNING]
> Пакет называется **`mister-wolf`** — именно так. Пакет `mr-wolf` в npm **чужой** (work-queue
> библиотека): `npm install mr-wolf` поставит сторонний код и выполнит его install-скрипты.
> Проверяй имя буква-в-букву перед установкой.

Установка — три команды:

```bash
npm install -g mister-wolf   # 1) машина: бинарь wolf (уровень 0)
cd my-project && wolf init   # 2) проект: скелет .wolf/ + MCP-конфиги платформ
wolf bootstrap               # 3) память: стартовое наполнение из документов проекта
```

После `wolf init` **перезапусти агентскую платформу** — MCP-сервер Wolf подключается при старте.
Claude Code при первом старте попросит approve project-scope MCP-сервер — это штатно.

- **Попробовать без установки:** `npx mister-wolf init` — создаст память проекта, но никогда
  не пишет MCP-конфиги (try-out). Понравилось — `npm install -g mister-wolf` и повтори `wolf init`.
- **Платформы v1:** opencode, Claude Code. Детект автоматический; явно:
  `wolf init --platform opencode,claude` (список заменяет текущий набор). Нет маркеров платформы —
  init честно предупредит и подскажет `--platform`.
- **ОС/рантайм:** macOS и Linux (glibc) на Node 22/24. Alpine/musl не поддержан в v1;
  Windows — best-effort, не заявлена. Нативная зависимость better-sqlite3 ставится из пребилдов —
  это поведение зависимости, у mister-wolf нет своих install-скриптов.
- **Dev-путь (из клонированного репо):** `npm install && npm run build`, затем
  `alias wolf="node dist/bootstrap/cli.js"`. При одновременно установленном глобальном
  `mister-wolf` помни о PATH-shadowing: какой `wolf` запустится — определяется порядком каталогов
  в PATH. В npm есть и чужой пакет `wolf` (Wolfram CLI) — глобальная установка обоих конфликтует
  за имя бинаря, разрешается тем же порядком PATH.
````

- [ ] **Step 2: Create SECURITY.md**

Создай `SECURITY.md`:

```markdown
# Security Policy

## Supported versions

Только последняя публикация `mister-wolf` (ветка `dev` → `main`, semver-теги `v*`).

## Reporting a vulnerability

Репорть приватно через GitHub Security Advisories:

<https://github.com/chekh/mister-wolf/security/advisories/new>

Не открывай public issue с деталями уязвимости. Ответ — до 7 дней; координация патч-релиза — до 30 дней.

## Scope

Пакет `mister-wolf` и этот репозиторий. Уязвимости зависимостей репорть их апстриму
(напр. better-sqlite3), сюда — через advisory с указанием цепочки.
```

- [ ] **Step 3: Verify formatting and links**

Run: `npx prettier --check README.md SECURITY.md`
Expected: PASS (или сначала `npx prettier --write README.md SECURITY.md`).

- [ ] **Step 4: Commit**

```bash
git add README.md SECURITY.md
git commit -m "docs: README Installation (тайпсквот-предупреждение, 3 шага, npx/PATH-shadowing) + SECURITY.md"
```

---

### Task 16: CI на Node 22/24 + Dockerfile node:22

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `Dockerfile`

- [ ] **Step 1: Update ci.yml**

Замени job `node` в `.github/workflows/ci.yml` (job `docker` не трогаем):

```yaml
jobs:
  node:
    name: Node.js ${{ matrix.node-version }} (${{ matrix.os }}) checks
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        node-version: [22, 24]
        os: [ubuntu-latest, macos-latest]
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm

      - name: Install dependencies (proves better-sqlite3 prebuilds for this Node/OS)
        run: npm ci

      - name: Run checks
        run: npm run check
```

Матрица 22/24 × linux/macOS — это и есть CI-пруф пребилд better-sqlite3@13 на заявленных платформах (спека §6): `npm ci` без gyp-сборки + прогон тестов с нативным модулем.

- [ ] **Step 2: Bump Dockerfile bases**

В `Dockerfile` замени ОБЕ строки с `node:20-bookworm-slim` — строку 7 `FROM node:20-bookworm-slim AS base` и строку 31 `FROM node:20-bookworm-slim AS runtime` — на:

```dockerfile
FROM node:22-bookworm-slim AS base
```

и

```dockerfile
FROM node:22-bookworm-slim AS runtime
```

(стейджи `test`/`build` наследуются от `base` — их не трогаем).

- [ ] **Step 3: Validate YAML and docker build (if docker available locally)**

Run: `node -e "const yaml=require('js-yaml');const fs=require('fs');yaml.load(fs.readFileSync('.github/workflows/ci.yml','utf8'));console.log('ci.yml OK')"`
Expected: `ci.yml OK` (js-yaml в dev-зависимостях — это работает из репо-корня).

Run (опционально, если локально есть Docker): `docker build --target test -t mister-wolf:test .`
Expected: сборка проходит (Dockerfile уже содержит python3/make/g++ для нативной сборки).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml Dockerfile
git commit -m "ci: Node 22/24 матрица + macOS (prebuild-пруф better-sqlite3), Dockerfile на node:22"
```

---

### Task 17: publish.yml — trusted publishing (OIDC) + provenance

**Files:**

- Create: `.github/workflows/publish.yml`

- [ ] **Step 1: Create the workflow**

Создай `.github/workflows/publish.yml`:

```yaml
name: Publish

# Тег-триггер не срабатывает из форков: push тега требует write-доступа к репо.
on:
  push:
    tags: ['v*']

permissions:
  contents: read
  id-token: write # npm trusted publishing (OIDC) + provenance; долгоживущих токенов нет

jobs:
  publish:
    name: npm publish (trusted publishing)
    runs-on: ubuntu-latest
    # GitHub Environment с protection (required reviewers) — дополнительный контур;
    # настроить в репо-настройках один раз: Environment "npm" + linked publishing в npm.
    environment: npm
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          registry-url: https://registry.npmjs.org

      - name: Install dependencies
        run: npm ci

      - name: Sanity — tag matches package.json version
        run: test "v$(node -p "require('./package.json').version")" = "${GITHUB_REF_NAME}"

      - name: Checks
        run: npm run check

      - name: E2E (publishable artifact — правило проекта: E2E после каждого плана)
        run: npm run e2e

      - name: Pack dry-run (tarball audit log in CI output)
        run: npm pack --dry-run

      - name: Use npm with trusted publishing support
        run: npm install -g npm@^11

      - name: Publish (OIDC + provenance)
        run: npm publish --provenance
```

- [ ] **Step 2: Validate YAML**

Run: `node -e "const yaml=require('js-yaml');const fs=require('fs');yaml.load(fs.readFileSync('.github/workflows/publish.yml','utf8'));console.log('publish.yml OK')"`
Expected: `publish.yml OK`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/publish.yml
git commit -m "ci: publish.yml — trusted publishing (OIDC, id-token:write) + provenance, check+e2e, sanity тег↔версия, pack dry-run в лог"
```

---

### Task 18: E2E дистрибуции — tarball-assert, установка в tmp-HOME, npx-кейс + финальный прогон

**Files:**

- Test: `tests/e2e/distribution.e2e.ts`

- [ ] **Step 1: Write the test**

Создай `tests/e2e/distribution.e2e.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, spawnSync } from 'child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'js-yaml';
import { repoRoot, tmpProject, ensureBuilt } from './helpers.js';

let tarball = '';
let home = '';
let prefix = '';

beforeAll(() => {
  ensureBuilt();
  const out = execSync('npm pack --json', { cwd: repoRoot, encoding: 'utf-8' });
  tarball = join(repoRoot, JSON.parse(out)[0].filename);
  home = mkdtempSync(join(tmpdir(), 'wolf-dist-home-'));
  prefix = join(home, 'npm-prefix');
}, 180_000);

afterAll(() => {
  if (tarball !== '') rmSync(tarball, { force: true }); // tarball создаётся в repoRoot — не мусорим
  if (home !== '') rmSync(home, { recursive: true, force: true });
});

/** Изолированное окружение: tmp-HOME + XDG + PATH с bin установленного бинаря. */
function isolatedEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    PATH: `${join(prefix, 'bin')}:${process.env.PATH ?? ''}`,
  };
}

describe('tarball-assert (спека §5, §7)', () => {
  it('package contains ONLY dist/ + README + LICENSE + package.json', () => {
    const out = execSync('npm pack --dry-run --json', { cwd: repoRoot, encoding: 'utf-8' });
    const files = (JSON.parse(out)[0].files as { path: string }[]).map((f) => f.path);
    expect(files.some((f) => f === 'dist/bootstrap/cli.js')).toBe(true);
    const allowed = (p: string) =>
      p === 'package.json' || p === 'README.md' || p === 'LICENSE' || p.startsWith('dist/');
    for (const f of files) {
      expect(allowed(f), `unexpected tarball entry: ${f}`).toBe(true);
    }
  });
});

describe('global install from tarball into isolated HOME (спека §3, §7)', () => {
  it('npm install -g works without gyp (prebuild) — install itself proves it', () => {
    execSync(`npm install -g --prefix "${prefix}" "${tarball}"`, {
      encoding: 'utf-8',
      timeout: 120_000,
      env: isolatedEnv(),
    });
    // если бы пребилда не было — install упал бы или ушёл в node-gyp с ошибкой в CI
  });

  it('wolf init in a dual-platform project writes both configs + registry + brief answers', () => {
    const env = isolatedEnv();
    const project = tmpProject();
    writeFileSync(join(project, 'package.json'), '{ "name": "dist-e2e" }');
    writeFileSync(join(project, 'opencode.json'), '{ "$schema": "https://opencode.ai/config.json" }');
    mkdirSync(join(project, '.claude'), { recursive: true });

    const init = spawnSync(join(prefix, 'bin', 'wolf'), ['init'], {
      cwd: project,
      env,
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(init.status).toBe(0);
    expect(init.stdout).toContain('platform opencode: written');
    expect(init.stdout).toContain('platform claude: written');
    expect(init.stdout).toContain('Restart your agent platform');

    const oc = JSON.parse(readFileSync(join(project, 'opencode.json'), 'utf-8'));
    expect(oc.mcp.wolf).toEqual({ type: 'local', command: ['wolf', 'mcp'], enabled: true });
    const claude = JSON.parse(readFileSync(join(project, '.mcp.json'), 'utf-8'));
    expect(claude.mcpServers.wolf).toEqual({ command: 'wolf', args: ['mcp'] });

    const registry = yaml.load(readFileSync(join(home, '.config', 'wolf', 'projects.yaml'), 'utf-8')) as {
      projects: { path: string }[];
    };
    expect(registry.projects.some((p) => p.path === project)).toBe(true);

    const brief = spawnSync(join(prefix, 'bin', 'wolf'), ['brief'], {
      cwd: project,
      env,
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(brief.status).toBe(0);
  });

  it('re-init breaks nothing: configs byte-identical, exit 0', () => {
    const env = isolatedEnv();
    const project = tmpProject();
    writeFileSync(join(project, 'package.json'), '{ "name": "dist-e2e-2" }');
    writeFileSync(join(project, 'opencode.json'), '{}');
    const wolf = join(prefix, 'bin', 'wolf');
    const first = spawnSync(wolf, ['init'], { cwd: project, env, encoding: 'utf-8', timeout: 60_000 });
    expect(first.status).toBe(0);
    const before = readFileSync(join(project, 'opencode.json'), 'utf-8');
    const second = spawnSync(wolf, ['init'], { cwd: project, env, encoding: 'utf-8', timeout: 60_000 });
    expect(second.status).toBe(0);
    expect(readFileSync(join(project, 'opencode.json'), 'utf-8')).toBe(before);
  });

  it('npx try-out: init never writes MCP configs and warns honestly (спека §3)', () => {
    // Реальный npx-запуск дорог/хрупок в e2e — критерий npx детерминирован env
    // (npm_command='npx' ставит сам npx-шим), поэтому воспроизводим его напрямую.
    const project = tmpProject();
    writeFileSync(join(project, 'package.json'), '{ "name": "npx-e2e" }');
    writeFileSync(join(project, 'opencode.json'), '{}');
    const res = spawnSync('node', [join(repoRoot, 'dist', 'bootstrap', 'cli.js'), 'init'], {
      cwd: project,
      env: { ...process.env, npm_command: 'npx' },
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(res.status).toBe(0);
    expect(JSON.parse(readFileSync(join(project, 'opencode.json'), 'utf-8')).mcp).toBeUndefined();
    expect(res.stdout).toContain('npx try-out');
    expect(res.stdout).toContain('npm install -g mister-wolf');
  });
});
```

- [ ] **Step 2: Run the new e2e**

Run: `npm run e2e`
Expected: PASS — включая distribution-кейсы. Если `npm install -g` из tarball запускает gyp на этой машине — СТОП: prebuild-покрытие нарушено (спека §9), эскалируй.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/distribution.e2e.ts
git commit -m "test: e2e дистрибуции — tarball-assert, установка в tmp-HOME, dual-platform init, npx try-out"
```

---

## Финальная валидация (после Task 18)

- [ ] Полный прогон: `npm run check && npm run e2e` — оба зелёные.
- [ ] Ручной смоук публичного пути из clean-состояния: `npm pack`, установить tarball в изолированный prefix (шаги Task 18 делают это автоматически — при зелёном e2e смоук засчитан).
- [ ] Сверка состава пакета: `npm pack --dry-run` — только `dist/**`, README, LICENSE, package.json.
- [ ] Убедиться, что гит-история чистая: `git log --oneline` — 18 коммитов задач на ветке `dev`.

## Соответствие спеке (для ревью)

**Осознанные сокращения (не пропуск спеки, а явный cut):**

- Юзер-`config.yaml` (`$XDG_CONFIG_HOME/wolf/`, «LLM routing v2») в v1 не создаётся — писать туда
  пока нечего; реестр `projects.yaml` создаётся. Каталог юзер-конфига заводится Task 5.
- §4 «конфликт значений в чужих полях — warning»: адаптеры чужие поля сохраняют (ядро требования),
  но отдельного warning-сообщения нет — библиотечный слой не логирует в stdout (MCP-сервер).
  Follow-up при первом реальном конфликте.
- Платформо-нейтральный текст bootstrap-brief — follow-up вне scope (§8 спеки).

| Секция спеки                                                                                             | Задачи                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §2 решения (npm-имя, MIT, no lifecycle-скрипты, bump sqlite3)                                            | Task 1 (гигиена-тест), Task 15                                                                                                                             |
| §3 уровень 0 (XDG config/projects.yaml, установка ничего не пишет)                                       | Task 5, Task 1 (нет install-скриптов)                                                                                                                      |
| §3 уровень 1: init                                                                                       | Task 6 (ensure-скелет), Task 9 (use-case: детект/no-platform/npx/реестр/scan-примечание), Task 10 (CLI: --platform replace, вывод, exit)                   |
| §3 уровень 2: schema_version + ленивая миграция + doctor                                                 | Task 8 (маркер), Task 7 (migrate.lock), Task 11 (guard/миграция/бэкап/будущее), Task 12 (точки входа), Task 13 (doctor: версии + конфиги платформ + prune) |
| §4 адаптеры (интерфейс, McpCommand, идемпотентность 'wolf', атомарность, opencode/claude)                | Task 2, Task 3, Task 4                                                                                                                                     |
| §5 публикация (package.json, files, publish.yml OIDC/provenance/sanity/e2e, Node 22, SDK стабилизация)   | Task 1, Task 16, Task 17                                                                                                                                   |
| §6 ошибки (схема из будущего, права, --recreate, init вне проекта, musl/Windows сообщения в README)      | Task 11, Task 3/4 (права), Task 9 (вне проекта), Task 10 (--recreate), Task 15 (статусы)                                                                   |
| §7 тесты (unit адаптеров/миграций/гигиены, e2e tarball/tmp-HOME/npx/tarball-assert, README, SECURITY.md) | Task 1, 3, 4, 11, 18 (e2e), Task 15 (README+SECURITY)                                                                                                      |
| §8 scope (дедуп bootstrap, фикс перезаписи)                                                              | Task 6, Task 14                                                                                                                                            |
| §9 риски (тайпсквот, тарболл, тег↔версия, пребилды)                                                      | Task 1, 15, 16, 17, 18                                                                                                                                     |
