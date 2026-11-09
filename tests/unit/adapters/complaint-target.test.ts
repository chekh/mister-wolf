import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  AgentDiscoveryError,
  resolveComplaintTarget,
  resolveGlobalConfigDir,
} from '../../../src/adapters/cli/commands/complaint-target.js';
import { FsFileSystem } from '../../../src/adapters/fs/fs-file-system.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { UserFacingError } from '../../../src/domain/errors.js';

// R-13a (релиз 3.0.0): резолвер цели жалобы — состав агентов из интеграции OpenCode.
// Источники (union): проектные .opencode/agents/*.md; глобальные <config>/opencode/agents/*.md;
// ключ "agent" в opencode.json(c) локаций корень/.opencode и в глобальном конфиге.
describe('complaint target resolver (R-13a)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-complaint-target-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeAgent(base: string, name: string): void {
    mkdirSync(join(base, '.opencode', 'agents'), { recursive: true });
    writeFileSync(join(base, '.opencode', 'agents', `${name}.md`), `---\nname: ${name}\n---\nBody.\n`);
  }

  function resolve(about: string, opts?: { globalConfigDir?: string }) {
    return resolveComplaintTarget(about, {
      fs: new FsFileSystem(),
      baseDir: dir,
      globalConfigDir: opts?.globalConfigDir,
      store: new MarkdownMemoryStore(dir),
    });
  }

  it('(i) проектные агенты: .opencode/agents/<имя>.md — имя файла = имя агента, known behavioral', async () => {
    writeAgent(dir, 'wolf-developer');
    writeAgent(dir, 'my-auditor');
    await expect(resolve('wolf-developer')).resolves.toEqual({ known: true, defaultKind: 'behavioral' });
    await expect(resolve('my-auditor')).resolves.toEqual({ known: true, defaultKind: 'behavioral' });
  });

  it('не-md файлы и каталоги в agents/ не считаются агентами', async () => {
    mkdirSync(join(dir, '.opencode', 'agents'), { recursive: true });
    writeFileSync(join(dir, '.opencode', 'agents', 'notes.txt'), 'not an agent');
    writeFileSync(join(dir, '.opencode', 'agents', 'README'), '');
    mkdirSync(join(dir, '.opencode', 'agents', 'subdir.md'), { recursive: true });
    await expect(resolve('notes')).resolves.toEqual({ known: false });
    await expect(resolve('subdir')).resolves.toEqual({ known: false });
  });

  it('(ii) глобальные агенты: <globalConfigDir>/opencode/agents/*.md → known (env-инъекция)', async () => {
    const xdg = join(dir, 'xdg-config');
    mkdirSync(join(xdg, 'opencode', 'agents'), { recursive: true });
    writeFileSync(join(xdg, 'opencode', 'agents', 'global-agent.md'), '---\nname: global-agent\n---\n');
    await expect(resolve('global-agent', { globalConfigDir: xdg })).resolves.toEqual({
      known: true,
      defaultKind: 'behavioral',
    });
  });

  it('(ii) глобальный каталог отсутствует — graceful: пустой источник, не ошибка', async () => {
    const xdg = join(dir, 'no-such-xdg');
    await expect(resolve('ghost-agent', { globalConfigDir: xdg })).resolves.toEqual({ known: false });
  });

  it('(iii) ключ "agent" в opencode.json корня — имена агентов = ключи объекта', async () => {
    writeFileSync(
      join(dir, 'opencode.json'),
      JSON.stringify({ model: 'm', agent: { 'cfg-agent': { model: 'x' }, planner: { model: 'y' } } })
    );
    await expect(resolve('cfg-agent')).resolves.toEqual({ known: true, defaultKind: 'behavioral' });
    await expect(resolve('planner')).resolves.toEqual({ known: true, defaultKind: 'behavioral' });
  });

  it('(iii) opencode.jsonc используется, когда json отсутствует', async () => {
    writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // комментарий\n  "agent": { "jsonc-agent": {} },\n}');
    await expect(resolve('jsonc-agent')).resolves.toEqual({ known: true, defaultKind: 'behavioral' });
  });

  it('(iii) json приоритетен: при обоих файлах ключи берутся из json, а не из jsonc', async () => {
    writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ agent: { 'from-json': {} } }));
    writeFileSync(join(dir, 'opencode.jsonc'), '{ "agent": { "from-jsonc": {} } }');
    await expect(resolve('from-json')).resolves.toEqual({ known: true, defaultKind: 'behavioral' });
    await expect(resolve('from-jsonc')).resolves.toEqual({ known: false });
  });

  it('(iii) конфиг локации .opencode — тоже источник', async () => {
    mkdirSync(join(dir, '.opencode'), { recursive: true });
    writeFileSync(join(dir, '.opencode', 'opencode.json'), JSON.stringify({ agent: { 'dot-agent': {} } }));
    await expect(resolve('dot-agent')).resolves.toEqual({ known: true, defaultKind: 'behavioral' });
  });

  it('(iii) глобальный конфиг: <globalConfigDir>/opencode/opencode.json — тоже источник', async () => {
    const xdg = join(dir, 'xdg-config');
    mkdirSync(join(xdg, 'opencode'), { recursive: true });
    writeFileSync(join(xdg, 'opencode', 'opencode.json'), JSON.stringify({ agent: { 'global-cfg': {} } }));
    await expect(resolve('global-cfg', { globalConfigDir: xdg })).resolves.toEqual({
      known: true,
      defaultKind: 'behavioral',
    });
  });

  it('без XDG/HOME глобальные источники недоступны (resolveGlobalConfigDir)', () => {
    expect(resolveGlobalConfigDir({})).toBeUndefined();
    expect(resolveGlobalConfigDir({ XDG_CONFIG_HOME: '/xdg', HOME: '/home' })).toBe('/xdg');
    expect(resolveGlobalConfigDir({ HOME: '/home' })).toBe(join('/home', '.config'));
  });

  it('skill:<имя> → known behavioral без discovery; несуществующий mem-id → not known', async () => {
    await expect(resolve('skill:any-skill')).resolves.toEqual({ known: true, defaultKind: 'behavioral' });
    await expect(resolve('mem_missing_object')).resolves.toEqual({ known: false });
  });

  it('дисcovery-ошибка: невалидный JSONC-конфиг → AgentDiscoveryError с путём, не «Unknown»', async () => {
    writeFileSync(join(dir, 'opencode.json'), '{ agent: break');
    await expect(resolve('any-agent')).rejects.toThrow(AgentDiscoveryError);
    await expect(resolve('any-agent')).rejects.toThrow(/Agent discovery failed: .*opencode\.json/);
    await expect(resolve('any-agent')).rejects.not.toThrow(/Unknown --about/);
    expect(new AgentDiscoveryError('x')).toBeInstanceOf(UserFacingError);
  });

  it('дисcovery-ошибка: конфиг не объект (массив) и ключ "agent" не объект', async () => {
    writeFileSync(join(dir, 'opencode.json'), '[1, 2]');
    await expect(resolve('a')).rejects.toThrow(/Agent discovery failed: .*opencode\.json: not a JSON object/);

    writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ agent: 'строка вместо объекта' }));
    await expect(resolve('a')).rejects.toThrow(/Agent discovery failed: .*opencode\.json: key "agent"/);
  });

  it('дисcovery-ошибка: существующий нечитаемый конфиг-файл (EACCES) — не молчаливый пропуск', async () => {
    const file = join(dir, 'opencode.json');
    writeFileSync(file, JSON.stringify({ agent: { x: {} } }));
    chmodSync(file, 0o000);
    try {
      await expect(resolve('x')).rejects.toThrow(/Agent discovery failed: .*opencode\.json: not readable/);
    } finally {
      chmodSync(file, 0o644);
    }
  });

  it('дисcovery-ошибка: существующий нечитаемый каталог агентов (EACCES)', async () => {
    const agentsDir = join(dir, '.opencode', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeAgent(dir, 'ok-agent');
    chmodSync(agentsDir, 0o000);
    try {
      // ok-agent существует как файл, но каталог нечитаем — это ошибка discovery, а не «неизвестная цель»
      await expect(resolve('ok-agent')).rejects.toThrow(/Agent discovery failed: .*agents: not readable/);
    } finally {
      chmodSync(agentsDir, 0o755);
    }
  });

  it('отсутствующий каталог агентов и конфигов — известная цель не находится без ошибок', async () => {
    await expect(resolve('never-existed')).resolves.toEqual({ known: false });
  });
});
