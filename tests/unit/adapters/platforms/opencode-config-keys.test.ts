// 6.2 (аудит 2026-10-25 §6.2): единый реестр ключей opencode + инварианты путей.
// 6.2-2: grep-сканер по исходникам — литералов путей вне реестра нет (комментарии не считаются).
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import {
  CONFIG_KEYS,
  DEFAULT_AGENT,
  MCP_ROOT,
  MCP_SERVERS,
  MCP_SERVER_NAME,
  SUBAGENT_DEPTH,
  deletePath,
  getPath,
  getRecordAt,
  isWolfMcpEntry,
  mcpEntryNative,
  readWolfMcp,
  setPath,
} from '../../../../src/adapters/platforms/opencode-config-keys.js';

const cmd = { command: 'wolf', args: ['mcp'] };
const ROOT = process.cwd();
const REGISTRY = join(ROOT, 'src/adapters/platforms/opencode-config-keys.ts');

/** Эталон v2 из аудита §3 (строки 89-94). */
const V2_REFERENCE: Record<string, readonly string[]> = {
  mcp: ['mcp', 'servers', 'wolf'],
  default_agent: ['default_agent'],
  subagent_depth: ['experimental', 'subagent_depth'],
};

describe('6.2-1: реестр ключей — инвариант writePath == canonicalPath == эталон v2', () => {
  it.each(CONFIG_KEYS.map((k) => [k.id, k] as const))('%s: пути каноничны', (_id, key) => {
    expect(key.writePath).toEqual(key.canonicalPath);
    expect(key.canonicalPath).toEqual(V2_REFERENCE[key.id]);
  });

  it('реэкспорт-константы реестра совпадают с аудитом', () => {
    expect([MCP_ROOT, MCP_SERVERS, MCP_SERVER_NAME]).toEqual(['mcp', 'servers', 'wolf']);
    expect(DEFAULT_AGENT).toBe('mr-wolf');
    expect(SUBAGENT_DEPTH).toBe(2);
  });

  it('регресс-замок: легаси-пути, которые читаем/снимаем, объявлены', () => {
    const byId = new Map(CONFIG_KEYS.map((k) => [k.id, k]));
    expect(byId.get('mcp')?.legacyPaths).toContainEqual(['mcp', 'wolf']);
    expect(byId.get('subagent_depth')?.legacyPaths).toContainEqual(['subagent_depth']);
    expect(byId.get('default_agent')?.legacyPaths).toEqual([]);
  });

  it('формы и метки ключей', () => {
    const byId = new Map(CONFIG_KEYS.map((k) => [k.id, k]));
    expect(byId.get('mcp')?.forms).toBe('both');
    expect(byId.get('subagent_depth')?.forms).toBe('both');
    expect(byId.get('default_agent')?.forms).toBe('native');
    expect(byId.get('mcp')?.label).toBe('mcp.servers.wolf');
    expect(byId.get('default_agent')?.label).toBe('default_agent');
    expect(byId.get('subagent_depth')?.label).toBe('subagent_depth');
  });
});

/* ------------------------------------------------------------------ 6.2-2 */

const FORBIDDEN = ['subagent_depth', 'default_agent', 'mcp.servers', 'mcp.wolf'];

/**
 * Мини-сканер как scripts/check-english-surface.mjs: конечный автомат code/line/block/string/template.
 * Возвращает содержимое строковых литералов; комментарии в результат не попадают.
 */
function stringLiterals(source: string): string[] {
  const out: string[] = [];
  let state: 'code' | 'line' | 'block' | 'single' | 'double' | 'template' = 'code';
  let buf = '';
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    const next = source[i + 1];
    switch (state) {
      case 'code':
        if (c === '/' && next === '/') state = 'line';
        else if (c === '/' && next === '*') state = 'block';
        else if (c === "'") {
          state = 'single';
          buf = '';
        } else if (c === '"') {
          state = 'double';
          buf = '';
        } else if (c === '`') {
          state = 'template';
          buf = '';
        }
        break;
      case 'line':
        if (c === '\n') state = 'code';
        break;
      case 'block':
        if (c === '*' && next === '/') {
          state = 'code';
          i++;
        }
        break;
      case 'single':
      case 'double':
        if (c === '\\') buf += source[++i] ?? '';
        else if (c === (state === 'single' ? "'" : '"') || c === '\n') {
          out.push(buf);
          state = 'code';
        } else buf += c;
        break;
      case 'template':
        if (c === '\\') buf += source[++i] ?? '';
        else if (c === '`') {
          out.push(buf);
          state = 'code';
        } else buf += c;
        break;
    }
  }
  return out;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Литералы путей запрещены в адаптерах платформ и use-case'ах; канон — только реестр. */
function pathLiteralsOutsideRegistry(): string[] {
  const found: string[] = [];
  for (const dir of ['src/adapters/platforms', 'src/app/use-cases']) {
    for (const file of walk(join(ROOT, dir))) {
      if (file === REGISTRY) continue;
      for (const literal of stringLiterals(readFileSync(file, 'utf-8'))) {
        const hit = FORBIDDEN.filter((token) => literal.includes(token));
        if (hit.length > 0) found.push(`${file.slice(ROOT.length + 1)}: ${hit.join(',')}`);
      }
    }
  }
  return found;
}

describe('6.2-2: grep-инвариант — литералы путей только в реестре', () => {
  it('самопроверка сканера: литерал в комментарии не флагуется, в коде — флагуется', () => {
    expect(stringLiterals("// 'mcp.wolf'\n/* 'mcp.servers' */")).toEqual([]);
    expect(stringLiterals("const path = 'mcp.wolf';")).toEqual(['mcp.wolf']);
    expect(stringLiterals('msg = "see mcp.servers for details";')).toEqual(['see mcp.servers for details']);
    expect(stringLiterals('const p = `${prefix}subagent_depth`;')).toEqual(['${prefix}subagent_depth']);
  });

  it('в src/adapters/platforms/** и src/app/use-cases/** путей-литералов нет', () => {
    expect(pathLiteralsOutsideRegistry()).toEqual([]);
  });
});

/* ------------------------------------------------------------------ 6.2-3 */

describe('6.2-3: get/set/delete-хелперы и прунинг пустых контейнеров', () => {
  it('getPath читает вложенный путь, отсутствующий — undefined', () => {
    const cfg = { mcp: { servers: { wolf: { type: 'local' } } } };
    expect(getPath(cfg, ['mcp', 'servers', 'wolf'])).toEqual({ type: 'local' });
    expect(getPath(cfg, ['mcp', 'missing', 'wolf'])).toBeUndefined();
  });

  it('getRecordAt отдаёт только объекты (массив/строка — undefined)', () => {
    expect(getRecordAt({ a: { b: 1 } }, ['a'])).toEqual({ b: 1 });
    expect(getRecordAt({ a: [1] }, ['a'])).toBeUndefined();
    expect(getRecordAt({ a: 'x' }, ['a'])).toBeUndefined();
  });

  it('setPath создаёт промежуточные объекты', () => {
    const cfg: Record<string, unknown> = {};
    setPath(cfg, ['experimental', 'subagent_depth'], 2);
    expect(cfg).toEqual({ experimental: { subagent_depth: 2 } });
  });

  it('setPath не перетирает чужое не-объектное значение на промежуточном пути', () => {
    const cfg: Record<string, unknown> = { experimental: 'nope' };
    setPath(cfg, ['experimental', 'subagent_depth'], 2);
    expect(cfg).toEqual({ experimental: 'nope' });
  });

  it('deletePath удаляет ключ и пустые родительские объекты', () => {
    const cfg: Record<string, unknown> = { mcp: { servers: { wolf: {} } }, theme: 'system' };
    expect(deletePath(cfg, ['mcp', 'servers', 'wolf'])).toBe(true);
    expect(cfg).toEqual({ theme: 'system' }); // пустые mcp.servers и mcp удалены
  });

  it('deletePath не трогает непустые контейнеры и чужие ключи рядом', () => {
    const cfg: Record<string, unknown> = {
      mcp: { servers: { wolf: {}, other: {} }, note: 1 },
      experimental: { subagent_depth: 2, todo: true },
    };
    expect(deletePath(cfg, ['mcp', 'servers', 'wolf'])).toBe(true);
    expect(deletePath(cfg, ['experimental', 'subagent_depth'])).toBe(true);
    expect(cfg).toEqual({ mcp: { servers: { other: {} }, note: 1 }, experimental: { todo: true } });
  });

  it('deletePath отсутствующего пути → false, конфиг не меняется', () => {
    const cfg: Record<string, unknown> = { mcp: {} };
    expect(deletePath(cfg, ['mcp', 'servers', 'wolf'])).toBe(false);
    expect(cfg).toEqual({ mcp: {} });
  });
});

/* ------------------------------------------------------------------ 6.3-1/6.3-3 */

describe('6.3: формы wolf-записи в MCP', () => {
  it('mcpEntryNative: type local + command-массив + disabled:false, без codemode/enabled/timeout', () => {
    const entry = mcpEntryNative(cmd);
    expect(entry).toEqual({ type: 'local', command: ['wolf', 'mcp'], disabled: false });
    expect(entry).not.toHaveProperty('codemode');
    expect(entry).not.toHaveProperty('enabled');
    expect(entry).not.toHaveProperty('timeout');
  });

  it('isWolfMcpEntry: наша команда — наша, даже с лишними полями; другая команда — чужая', () => {
    expect(isWolfMcpEntry({ type: 'local', command: ['wolf', 'mcp'], disabled: false }, cmd)).toBe(true);
    expect(isWolfMcpEntry({ type: 'local', command: ['wolf', 'mcp'], enabled: true }, cmd)).toBe(true);
    expect(isWolfMcpEntry({ type: 'local', command: ['node', 'dist/mcp.js'] }, cmd)).toBe(false);
    expect(isWolfMcpEntry({ type: 'remote', command: ['wolf', 'mcp'] }, cmd)).toBe(false);
    expect(isWolfMcpEntry('wolf', cmd)).toBe(false);
  });

  it('readWolfMcp: none / native / legacy / both; нативная приоритетна', () => {
    const nativeEntry = { type: 'local', command: ['wolf', 'mcp'], disabled: false };
    const legacyEntry = { type: 'local', command: ['wolf', 'mcp'], enabled: true };

    expect(readWolfMcp({}, cmd)).toEqual({ form: 'none' });
    expect(readWolfMcp({ mcp: { servers: { wolf: nativeEntry } } }, cmd)).toEqual({
      form: 'native',
      entry: nativeEntry,
    });
    expect(readWolfMcp({ mcp: { wolf: legacyEntry } }, cmd)).toEqual({ form: 'legacy', entry: legacyEntry });
    expect(readWolfMcp({ mcp: { servers: { wolf: nativeEntry }, wolf: legacyEntry } }, cmd)).toEqual({
      form: 'both',
      entry: nativeEntry,
      legacyEntry,
    });
  });
});
