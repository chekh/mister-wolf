import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  registerTool,
  listTools,
  useTool,
  exposeTool,
  deprecateTool,
  reviveTool,
} from '../../../src/app/use-cases/tool-librarian.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { FsFileSystem } from '../../../src/adapters/fs/fs-file-system.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';
import { UserFacingError } from '../../../src/domain/errors.js';

describe('tool librarian (C2)', () => {
  let dir: string;
  let store: MarkdownMemoryStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-tool-'));
    store = new MarkdownMemoryStore(dir);
    writeFileSync(join(dir, 'extract-todos.ts'), 'export function run(){}\n', 'utf-8');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function makeDeps() {
    return {
      store,
      log: new JsonlEventLog(eventsPath(dir)),
      clock: new SystemClock(),
      idGen: new HashIdGenerator(),
      fs: new FsFileSystem(),
      baseDir: dir,
    };
  }

  it('register: объект type tool, candidate, usage_count 0, скрипт скопирован', async () => {
    const result = await registerTool(makeDeps(), {
      scriptPath: 'extract-todos.ts',
      name: 'extract-todos',
      language: 'typescript',
      contractIn: 'путь к файлу .ts',
      contractOut: 'список TODO строкой',
      createdBy: 'user:test',
    });

    expect(result.toolId).toMatch(/^mem_/);
    expect(result.scriptPath).toBe(join('.wolf', 'tools', 'extract-todos.ts'));
    expect(result.similar).toHaveLength(0);

    const obj = await store.get(result.toolId);
    expect(obj?.type).toBe('tool');
    expect(obj?.status).toBe('candidate');
    expect(obj?.title).toBe('Tool: extract-todos');
    const tool = obj as { usage_count?: number; script_path?: string; language?: string };
    expect(tool.usage_count).toBe(0);
    expect(tool.script_path).toBe(join('.wolf', 'tools', 'extract-todos.ts'));
    expect(tool.language).toBe('typescript');
    expect('last_used_at' in (tool as object)).toBe(false);

    const copied = readFileSync(join(dir, '.wolf', 'tools', 'extract-todos.ts'), 'utf-8');
    expect(copied).toBe('export function run(){}\n');
  });

  it('register несуществующего скрипта → UserFacingError, объектов 0', async () => {
    await expect(
      registerTool(makeDeps(), {
        scriptPath: 'no-such-script.ts',
        name: 'ghost',
        language: 'typescript',
        createdBy: 'user:test',
      })
    ).rejects.toThrow(UserFacingError);
    await expect(
      registerTool(makeDeps(), {
        scriptPath: 'no-such-script.ts',
        name: 'ghost',
        language: 'typescript',
        createdBy: 'user:test',
      })
    ).rejects.toThrow(/Script not found/);
    expect(await store.list({ type: 'tool' })).toHaveLength(0);
  });

  it('коллизия имени: отказ всегда (даже --force); похожий контракт: отказ без --force', async () => {
    const deps = makeDeps();
    await registerTool(deps, {
      scriptPath: 'extract-todos.ts',
      name: 'extract-todos',
      language: 'typescript',
      contractOut: 'список todo из исходников',
      createdBy: 'user:test',
    });

    // то же имя — коллизия ключа, force не помогает
    await expect(
      registerTool(deps, {
        scriptPath: 'extract-todos.ts',
        name: 'extract-todos',
        language: 'typescript',
        createdBy: 'user:test',
      })
    ).rejects.toThrow(/is already taken/);
    await expect(
      registerTool(deps, {
        scriptPath: 'extract-todos.ts',
        name: 'extract-todos',
        language: 'typescript',
        force: true,
        createdBy: 'user:test',
      })
    ).rejects.toThrow(/is already taken/);
    expect(await store.list({ type: 'tool' })).toHaveLength(1);

    // другое имя, общий contract-токен — dedup-подсказка, force обходит
    await expect(
      registerTool(deps, {
        scriptPath: 'extract-todos.ts',
        name: 'todo-harvester',
        language: 'typescript',
        contractOut: 'список todo из исходников',
        createdBy: 'user:test',
      })
    ).rejects.toThrow(/Similar tools found/);
    expect(await store.list({ type: 'tool' })).toHaveLength(1);

    const forced = await registerTool(deps, {
      scriptPath: 'extract-todos.ts',
      name: 'todo-harvester',
      language: 'typescript',
      contractOut: 'список todo из исходников',
      force: true,
      createdBy: 'user:test',
    });
    expect(forced.toolId).toMatch(/^mem_/);
    expect(forced.similar.length).toBeGreaterThan(0);
    expect(await store.list({ type: 'tool' })).toHaveLength(2);
  });

  it('недопустимое имя (путь/точки/верхний регистр) → UserFacingError до всего', async () => {
    for (const bad of ['../escape', 'a/b', 'BadName', '.hidden', 'имя-кириллицей']) {
      await expect(
        registerTool(makeDeps(), { scriptPath: 'extract-todos.ts', name: bad, language: 'ts', createdBy: 'u:t' })
      ).rejects.toThrow(/Invalid tool name/);
    }
    expect(await store.list({ type: 'tool' })).toHaveLength(0);
    expect(existsSync(join(dir, '.wolf', 'tools'))).toBe(false);
  });

  it('use: инкремент 0→1→2, last_used_at ISO; несуществующее имя → UserFacingError', async () => {
    const deps = makeDeps();
    const { toolId } = await registerTool(deps, {
      scriptPath: 'extract-todos.ts',
      name: 'extract-todos',
      language: 'typescript',
      createdBy: 'user:test',
    });

    const once = await useTool(deps, { nameOrId: 'extract-todos', actor: 'agent:test' });
    expect(once.usage_count).toBe(1);
    expect(once.last_used_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    const twice = await useTool(deps, { nameOrId: 'extract-todos', actor: 'agent:test' });
    expect(twice.usage_count).toBe(2);

    const stored = (await store.get(toolId)) as { usage_count?: number; last_used_at?: string };
    expect(stored.usage_count).toBe(2);
    expect(stored.last_used_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    await expect(useTool(deps, { nameOrId: 'nope', actor: 'agent:test' })).rejects.toThrow(/Tool not found/);
  });

  it('use по id работает', async () => {
    const deps = makeDeps();
    const { toolId } = await registerTool(deps, {
      scriptPath: 'extract-todos.ts',
      name: 'extract-todos',
      language: 'typescript',
      createdBy: 'user:test',
    });
    const used = await useTool(deps, { nameOrId: toolId, actor: 'agent:test' });
    expect(used.id).toBe(toolId);
    expect(used.usage_count).toBe(1);
  });

  it('expose: SKILL.md с маркером, контрактом и script_path; повтор — идентичный контент', async () => {
    const deps = makeDeps();
    const { toolId } = await registerTool(deps, {
      scriptPath: 'extract-todos.ts',
      name: 'extract-todos',
      language: 'typescript',
      contractIn: 'путь к файлу',
      contractOut: 'список TODO',
      contractEnvironment: 'node 22',
      createdBy: 'user:test',
    });

    const first = await exposeTool(deps, { nameOrId: 'extract-todos' });
    expect(first.path).toBe(join('.opencode', 'skills', 'extract-todos', 'SKILL.md'));

    const content = readFileSync(join(dir, first.path), 'utf-8');
    expect(content).toContain(`generated from tool:${toolId}`);
    expect(content).toContain('Input: путь к файлу');
    expect(content).toContain('Output: список TODO');
    expect(content).toContain('Environment: node 22');
    expect(content).toContain(join('.wolf', 'tools', 'extract-todos.ts'));

    const second = await exposeTool(deps, { nameOrId: toolId });
    expect(second.content).toBe(first.content);
    expect(readFileSync(join(dir, second.path), 'utf-8')).toBe(content);
  });

  it('deprecate из candidate → deprecated с reason; revive → active', async () => {
    const deps = makeDeps();
    const { toolId } = await registerTool(deps, {
      scriptPath: 'extract-todos.ts',
      name: 'extract-todos',
      language: 'typescript',
      createdBy: 'user:test',
    });

    const deprecated = await deprecateTool(deps, {
      nameOrId: 'extract-todos',
      reason: 'заменён другим инструментом',
      actor: 'user:test',
    });
    expect(deprecated.status).toBe('deprecated');
    expect(deprecated.deprecation_reason).toBe('заменён другим инструментом');

    const revived = await reviveTool(deps, { nameOrId: toolId, actor: 'user:test' });
    expect(revived.status).toBe('active');

    expect(await listTools({ store }, { status: 'deprecated' })).toHaveLength(0);
    expect((await listTools({ store }, { status: 'active' }))[0]?.id).toBe(toolId);
  });

  it('deprecate несуществующего → UserFacingError', async () => {
    await expect(deprecateTool(makeDeps(), { nameOrId: 'ghost', reason: 'x', actor: 'user:test' })).rejects.toThrow(
      /Tool not found/
    );
  });
});
