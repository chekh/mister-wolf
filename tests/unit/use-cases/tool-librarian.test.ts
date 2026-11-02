import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync, renameSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'js-yaml';
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

  it('register stores a project reference without copying its source', async () => {
    const result = await registerTool(makeDeps(), {
      scriptPath: 'extract-todos.ts',
      name: 'extract-todos',
      language: 'typescript',
      contractIn: 'путь к файлу .ts',
      contractOut: 'список TODO строкой',
      createdBy: 'user:test',
    });

    expect(result.toolId).toMatch(/^mem_/);
    expect(result.scriptPath).toBe('extract-todos.ts');
    expect(result.similar).toHaveLength(0);

    const obj = await store.get(result.toolId);
    expect(obj?.type).toBe('tool');
    expect(obj?.status).toBe('candidate');
    expect(obj?.title).toBe('Tool: extract-todos');
    const tool = obj as { usage_count?: number; script_path?: string; language?: string };
    expect(tool.usage_count).toBe(0);
    expect(tool.script_path).toBe('extract-todos.ts');
    expect(tool.language).toBe('typescript');
    expect('last_used_at' in (tool as object)).toBe(false);

    expect(existsSync(join(dir, '.wolf', 'tools', 'extract-todos.ts'))).toBe(false);
    expect(readFileSync(join(dir, 'extract-todos.ts'), 'utf8')).toBe('export function run(){}\n');
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
    // 6.5: frontmatter — первым блоком файла; маркер генерации ниже, иначе платформа
    // не парсит name/description скилла.
    expect(content.startsWith('---\n')).toBe(true);
    const end = content.indexOf('\n---\n', 4);
    expect(end).toBeGreaterThan(0);
    const front = yaml.load(content.slice(4, end)) as Record<string, unknown>;
    expect(front.name).toBe('extract-todos');
    expect(String(front.description)).toContain('список TODO');
    expect(content.indexOf(`generated from tool:${toolId}`)).toBeGreaterThan(end);
    expect(content).toContain('Input: путь к файлу');
    expect(content).toContain('Output: список TODO');
    expect(content).toContain('Environment: node 22');
    expect(content).toContain('extract-todos.ts');

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

describe('reference tools lifecycle', () => {
  let root: string;
  let store: MarkdownMemoryStore;
  function deps() {
    return {
      store,
      log: new JsonlEventLog(eventsPath(root)),
      clock: new SystemClock(),
      idGen: new HashIdGenerator(),
      fs: new FsFileSystem(),
      baseDir: root,
    };
  }
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wolf-ref-tool-'));
    store = new MarkdownMemoryStore(root);
    mkdirSync(join(root, 'tools'), { recursive: true });
    writeFileSync(join(root, 'tools/check.py'), 'print(1)');
    writeFileSync(join(root, 'tools/data.json'), '{"value":1}');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  it('keeps a multi-file source in place and updates the same card', async () => {
    const d = deps();
    const a = await registerTool(d, {
      name: 'check',
      scriptPath: 'tools/check.py',
      language: 'python',
      resourcePaths: ['tools/data.json'],
      createdBy: 'user:test',
    });
    expect(a.scriptPath).toBe('tools/check.py');
    expect(existsSync(join(root, '.wolf/tools/check.py'))).toBe(false);
    const first = await store.get(a.toolId);
    expect(first?.related.files).toEqual(['tools/check.py', 'tools/data.json']);
    writeFileSync(join(root, 'tools/data.json'), '{"value":2}');
    await expect(useTool(d, { nameOrId: a.toolId, actor: 'user:test' })).rejects.toThrow(/changed/);
    const b = await registerTool(d, {
      name: 'check',
      scriptPath: 'tools/check.py',
      language: 'python',
      update: a.toolId,
      createdBy: 'user:test',
    });
    expect(b.toolId).toBe(a.toolId);
    expect(await store.list({ type: 'tool' })).toHaveLength(1);
    expect((await store.get(a.toolId))?.source_digest).not.toBe(first?.source_digest);
    await useTool(d, { nameOrId: a.toolId, actor: 'user:test' });
    expect((await store.get(a.toolId))?.usage_count).toBe(1);
  });
  it('rejects missing and external sources, including an escaping symlink', async () => {
    const d = deps();
    await expect(
      registerTool(d, { name: 'bad', scriptPath: '../outside.py', language: 'python', createdBy: 'user:test' })
    ).rejects.toThrow(/project/);
    symlinkSync(tmpdir(), join(root, 'tools/outside'));
    await expect(
      registerTool(d, { name: 'bad', scriptPath: 'tools/outside', language: 'python', createdBy: 'user:test' })
    ).rejects.toThrow(/project/);
    expect(await store.list({ type: 'tool' })).toHaveLength(0);
  });
  it('reports a missing source without counting a successful use', async () => {
    const d = deps();
    const a = await registerTool(d, {
      name: 'check',
      scriptPath: 'tools/check.py',
      language: 'python',
      createdBy: 'user:test',
    });
    renameSync(join(root, 'tools/check.py'), join(root, 'tools/moved.py'));
    await expect(useTool(d, { nameOrId: a.toolId, actor: 'user:test' })).rejects.toThrow(/not found/);
    expect((await store.get(a.toolId))?.usage_count).toBe(0);
    await registerTool(d, {
      name: 'check',
      scriptPath: 'tools/moved.py',
      language: 'python',
      update: a.toolId,
      createdBy: 'user:test',
    });
    expect((await store.get(a.toolId))?.script_path).toBe('tools/moved.py');
  });
  it('preserves semantic version fields and supports explicitly replacing the resource set', async () => {
    const d = deps();
    const a = await registerTool(d, {
      name: 'check',
      scriptPath: 'tools/check.py',
      language: 'python',
      resourcePaths: ['tools/data.json'],
      createdBy: 'user:test',
    });
    await store.update(a.toolId, { version: '1.2.0', source_url: 'https://example.invalid/source' } as never);
    await registerTool(d, {
      name: 'check',
      scriptPath: 'tools/check.py',
      language: 'python',
      resourcePaths: [],
      update: a.toolId,
      createdBy: 'user:test',
    });
    const card = await store.get(a.toolId);
    expect(card?.related.files).toEqual(['tools/check.py']);
    expect(card?.version).toBe('1.2.0');
    expect(card?.source_url).toBe('https://example.invalid/source');
    expect(await store.list({ type: 'tool' })).toHaveLength(1);
  });
  it('resolves the same multi-file card in another worktree root', async () => {
    const source =
      'import json\nfrom pathlib import Path\nprint(json.loads((Path(__file__).parent / "data.json").read_text())["value"])\n';
    writeFileSync(join(root, 'tools/check.py'), source);
    const d = deps();
    const a = await registerTool(d, {
      name: 'check',
      scriptPath: 'tools/check.py',
      language: 'python',
      resourcePaths: ['tools/data.json'],
      createdBy: 'user:test',
    });
    const other = mkdtempSync(join(tmpdir(), 'wolf-other-root-'));
    try {
      mkdirSync(join(other, 'tools'));
      writeFileSync(join(other, 'tools/check.py'), source);
      writeFileSync(join(other, 'tools/data.json'), '{"value":1}');
      await useTool({ ...d, baseDir: other }, { nameOrId: a.toolId, actor: 'user:test' });
      expect((await store.get(a.toolId))?.usage_count).toBe(1);
      expect(existsSync(join(other, '.wolf/tools/check.py'))).toBe(false);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });
  it('keeps an existing legacy .wolf/tools entrypoint available without migration', async () => {
    const d = deps();
    mkdirSync(join(root, '.wolf/tools'), { recursive: true });
    writeFileSync(join(root, '.wolf/tools/legacy.py'), 'print(1)');
    const a = await registerTool(d, {
      name: 'legacy',
      scriptPath: '.wolf/tools/legacy.py',
      language: 'python',
      createdBy: 'user:test',
    });
    const card = await store.get(a.toolId);
    const legacy = { ...card };
    delete legacy.source_digest;
    await store.save(legacy as never);
    await useTool(d, { nameOrId: a.toolId, actor: 'user:test' });
    expect(existsSync(join(root, '.wolf/tools/legacy.py'))).toBe(true);
    expect((await store.get(a.toolId))?.script_path).toBe('.wolf/tools/legacy.py');
  });
});
