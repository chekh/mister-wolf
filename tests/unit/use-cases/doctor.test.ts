import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runDoctor } from '../../../src/app/use-cases/doctor.js';
import { CURRENT_SCHEMA_VERSION } from '../../../src/adapters/fs/schema-version.js';
import { OpencodeAdapter } from '../../../src/adapters/platforms/opencode-adapter.js';
import type { PlatformAdapter } from '../../../src/ports/platform-adapter.port.js';

/** Fake-адаптер: detect по списку путей, конфиг с/без wolf-записи. */
function fakeAdapter(id: string, detectedPaths: string[], wolfInPaths: string[] = []): PlatformAdapter {
  return {
    id,
    detect: (root: string) => detectedPaths.includes(root),
    readConfig: async (root: string) =>
      detectedPaths.includes(root) ? { mcp: wolfInPaths.includes(root) ? { wolf: {} } : {} } : null,
    writeConfig: async () => ({ action: 'written' as const }),
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

  it('no schema/config at all (readSchema → null) → not-initialized, same semantics as guard (init, не миграция)', async () => {
    const deps = { ...makeDeps([{ path: '/a', schema_version: 1 }], ['/a']), readSchema: async () => null };
    const report = await runDoctor(deps);
    expect(report.entries[0].status).toBe('not-initialized');
    expect(report.entries[0].schemaVersion).toBeNull();
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

  it('D-7: detectMismatch добавляет issue-строки в entry', async () => {
    const deps = {
      ...makeDeps([{ path: '/a', schema_version: CURRENT_SCHEMA_VERSION }], ['/a']),
      detectMismatch: async () => [
        'opencode: installed under v1 (set 2.14.0 < 2.14.1), runtime v2 — run wolf doctor --repair',
      ],
    };
    const report = await runDoctor(deps);
    expect(report.entries[0].issues).toContainEqual(expect.stringContaining('--repair'));
  });

  it('D-8: без detectMismatch поведение прежнее (обратная совместимость фейков)', async () => {
    const deps = makeDeps([{ path: '/a', schema_version: CURRENT_SCHEMA_VERSION }], ['/a']);
    const report = await runDoctor(deps);
    expect(report.entries[0].issues).toEqual([]);
  });

  it('R04-3 (§4.14): после починки mcp.servers.wolf (writeConfig — тот же вызов, что в init) совет исчезает', async () => {
    const proj = mkdtempSync(join(tmpdir(), 'wolf-doctor-repair-'));
    try {
      writeFileSync(join(proj, 'opencode.json'), '{"theme":"system"}\n');
      const adapter = new OpencodeAdapter();
      const deps = makeDeps([{ path: proj, schema_version: CURRENT_SCHEMA_VERSION }], [proj], [adapter]);

      const before = await runDoctor(deps);
      // до починки: missing + отсутствующие default_agent/subagent_depth (6.1)
      expect(before.entries[0]!.issues).toHaveLength(3);
      expect(before.entries[0]!.issues[0]).toBe('opencode: wolf entry missing — run wolf init');

      // §4.14: init без --platform чинит запись этим же вызовом (см. init-project.test.ts R04-1)
      const written = await adapter.writeConfig(proj, { command: 'wolf', args: ['mcp'] });
      expect(written.action).toBe('written');

      const after = await runDoctor(deps);
      expect(after.entries[0]!.issues).toEqual([]);
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });
});

describe('6.3-4/6.3-5/6.1: doctor и ключи opencode (реальный OpencodeAdapter, configIssues)', () => {
  const NATIVE = { type: 'local', command: ['wolf', 'mcp'], disabled: false };
  const LEGACY = { type: 'local', command: ['wolf', 'mcp'], enabled: true };
  const MISSING = 'opencode: wolf entry missing — run wolf init';
  /** Канонический конфиг: все ключи, которые пишет Wolf. */
  const CANONICAL = {
    mcp: { servers: { wolf: NATIVE } },
    default_agent: 'mr-wolf',
    experimental: { subagent_depth: 2 },
  };

  async function issuesFor(config: Record<string, unknown>): Promise<string[]> {
    const proj = mkdtempSync(join(tmpdir(), 'wolf-doctor-forms-'));
    try {
      writeFileSync(join(proj, 'opencode.json'), JSON.stringify(config, null, 2) + '\n');
      const deps = makeDeps([{ path: proj, schema_version: CURRENT_SCHEMA_VERSION }], [proj], [new OpencodeAdapter()]);
      const report = await runDoctor(deps);
      return report.entries[0]!.issues;
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  }

  /* ---------- 6.3: обе формы MCP ---------- */

  it('6.1-1: всё корректно → issues пусто', async () => {
    expect(await issuesFor(CANONICAL)).toEqual([]);
  });

  it('6.3-4: нативная mcp.servers.wolf (пользователь сам мигрировал) → missing нет', async () => {
    expect(await issuesFor(CANONICAL)).toEqual([]);
  });

  it('6.3: легаси mcp.wolf нашего образца → не missing, а «migrate»', async () => {
    const issues = await issuesFor({ ...CANONICAL, mcp: { wolf: LEGACY } });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('deprecated top-level mcp.wolf');
    expect(issues[0]).toContain('wolf init');
  });

  it('6.3: обе формы сразу → миграция легаси помечена', async () => {
    const issues = await issuesFor({ ...CANONICAL, mcp: { servers: { wolf: NATIVE }, wolf: LEGACY } });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('deprecated top-level mcp.wolf');
  });

  it('6.3: чужой легаси mcp.wolf → помечен как чужой (не мигрируем)', async () => {
    const issues = await issuesFor({
      ...CANONICAL,
      mcp: { servers: { wolf: NATIVE }, wolf: { type: 'local', command: ['node', 'dist/mcp.js'] } },
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('foreign');
  });

  it('6.3: ни одной формы → issue остаётся', async () => {
    expect(await issuesFor({ ...CANONICAL, mcp: { other: { type: 'local', command: ['x'] } } })).toEqual([MISSING]);
  });

  /* ---------- 6.1: остальные ключи ---------- */

  it('6.1-2: нет default_agent → issue с подсказкой', async () => {
    const { default_agent: _drop, ...rest } = CANONICAL;
    const issues = await issuesFor(rest);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('default_agent is not set');
    expect(issues[0]).toContain('wolf init');
  });

  it('6.1-2b: чужой default_agent → issue без обещания перезаписи', async () => {
    const issues = await issuesFor({ ...CANONICAL, default_agent: 'other' });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('default_agent=other is taken');
    expect(issues[0]).toContain('never overwritten');
  });

  it('6.1-3: глубина 1 → issue «нужно >=2»', async () => {
    const issues = await issuesFor({ ...CANONICAL, experimental: { subagent_depth: 1 } });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('experimental.subagent_depth=1');
    expect(issues[0]).toContain('needs >=2');
  });

  it('6.1-3b: глубины нет → issue «not set»', async () => {
    const issues = await issuesFor({ ...CANONICAL, experimental: {} });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('experimental.subagent_depth is not set');
  });

  it('6.1-4: deprecated верхнеуровневый subagent_depth без experimental → оба issue', async () => {
    const issues = await issuesFor({
      mcp: { servers: { wolf: NATIVE } },
      default_agent: 'mr-wolf',
      subagent_depth: 2,
    });
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain('experimental.subagent_depth is not set');
    expect(issues[1]).toContain('top-level subagent_depth=2 is deprecated and ignored by opencode v2');
    expect(issues[1]).toContain('migrate');
  });

  it('6.1-5: наш легаси 2 сверху + правильный experimental → только deprecated-issue', async () => {
    const issues = await issuesFor({ ...CANONICAL, subagent_depth: 2 });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('top-level subagent_depth=2 is deprecated');
  });

  /* ---------- 6.4: смешанный frontmatter managed-агента ---------- */

  function projectWithAgent(file: string, body: string): string {
    const proj = mkdtempSync(join(tmpdir(), 'wolf-doctor-fm-'));
    writeFileSync(join(proj, 'opencode.json'), JSON.stringify(CANONICAL, null, 2) + '\n');
    mkdirSync(join(proj, '.opencode', 'agents'), { recursive: true });
    writeFileSync(join(proj, '.opencode', 'agents', file), body);
    return proj;
  }

  it('6.4-2: v2-поле рядом с v1 → предупреждение о смешении форматов', async () => {
    const proj = projectWithAgent(
      'mixed.md',
      [
        '---',
        'description: mixed',
        'mode: all',
        'permission:',
        '  task: deny',
        'permissions:',
        '  - action: subagent',
        '---',
        '<!-- wolf:rendered base=x set=2.20.0 -->',
        'body',
        '',
      ].join('\n')
    );
    try {
      const deps = makeDeps([{ path: proj, schema_version: CURRENT_SCHEMA_VERSION }], [proj], [new OpencodeAdapter()]);
      const report = await runDoctor(deps);
      const issues = report.entries[0]!.issues;
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain('mixes v2');
      expect(issues[0]).toContain('do not mix formats');
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });

  it('6.4-1/6.4-3: чисто v1-файл и чужой (без штампа) файл → молчание', async () => {
    const proj = projectWithAgent(
      'v1.md',
      [
        '---',
        'description: v1',
        'mode: all',
        'permission:',
        '  task: deny',
        '---',
        '<!-- wolf:rendered base=x set=2.20.0 -->',
        'body',
        '',
      ].join('\n')
    );
    writeFileSync(
      join(proj, '.opencode', 'agents', 'foreign.md'),
      ['---', 'description: foreign', 'permissions: []', 'mode: all', '---', 'body', ''].join('\n')
    );
    try {
      const deps = makeDeps([{ path: proj, schema_version: CURRENT_SCHEMA_VERSION }], [proj], [new OpencodeAdapter()]);
      const report = await runDoctor(deps);
      expect(report.entries[0]!.issues).toEqual([]);
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });
});
