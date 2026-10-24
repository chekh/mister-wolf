import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * T1 (волна 2.19.0, REQ-10/12, ADR-1): карта обновления update-map.json —
 * zod-схема + загрузчик из packageRoot (R10.1), инструкции категорий
 * (R10.4/R10.5), генератор diff prev→cur (R10.2) и guard согласованности
 * карты с templates/ (рассинхрон → провал). Прецедент guard-пары:
 * tests/unit/cli-reference-guard.test.ts.
 */

// Мини-карта фикстурного контура (test-plan TP-1: deprecated/removed цели
// присутствуют) — читается загрузчиком из tmp-каталога, без сети и git.
const MINI_MAP = {
  version: '2.19.0',
  prev: '2.18.5',
  files: [
    { path: 'base/agents/mr-wolf.md', kind: 'agent', category: 'changed' },
    { path: 'base/commands/complain.md', kind: 'command', category: 'deprecated' },
    { path: 'base/skills/using-skills/SKILL.md', kind: 'skill', category: 'unchanged' },
    { path: 'base/skills/gone-skill/SKILL.md', kind: 'skill', category: 'removed' },
  ],
  faces: [
    { template: 'base/playbooks/mr-wolf.md', owner_skill: 'mr-wolf', category: 'unchanged', seed: true },
    {
      template: 'base/playbooks/wolf-review-lenses.md',
      owner_skill: 'mr-wolf',
      category: 'deprecated',
      seed: false,
    },
  ],
  agents_md: { category: 'unchanged', mode: 'append-block' },
  schema_migrations: [],
  outside_v1: ['taxonomy (config.yaml memory_types)', 'tool-skills', 'local/foreign artifacts'],
};

interface Dir {
  root: string;
  templates: string;
}

/** Фикстурный парк: минимальное дерево templates/ + package.json. */
function makeFixture(mapJson: string, cliVersion = '2.19.0'): Dir {
  const root = mkdtempSync(join(tmpdir(), 'wolf-update-map-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: cliVersion }));
  writeFileSync(join(root, 'update-map.json'), mapJson);
  const t = join(root, 'templates');
  for (const rel of [
    'base/agents/mr-wolf.md',
    'base/commands/complain.md',
    'base/skills/using-skills/SKILL.md',
    'base/playbooks/mr-wolf.md',
    'base/AGENTS.md',
    'opencode/plugins/wolf-router.ts',
  ]) {
    const abs = join(t, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    // у playbook-шаблона обязан быть owner_skill в frontmatter
    writeFileSync(abs, rel.endsWith('playbooks/mr-wolf.md') ? '---\nowner_skill: mr-wolf\n---\nbody\n' : 'content\n');
  }
  return { root, templates: t };
}

const fixtures: Dir[] = [];
afterAll(() => {
  for (const f of fixtures) rmSync(f.root, { recursive: true, force: true });
});

describe('loadUpdateMap: R10.1 — чтение и валидация карты из packageRoot', () => {
  it('mini-map из фикстуры парсится целиком (включая deprecated/removed цели)', async () => {
    const { loadUpdateMap } = await import('../../../src/adapters/fs/update-map.js');
    const dir = makeFixture(JSON.stringify(MINI_MAP));
    fixtures.push(dir);
    const map = loadUpdateMap(dir.root);
    expect(map.version).toBe('2.19.0');
    expect(map.files.map((f) => [f.path, f.category])).toContainEqual(['base/skills/gone-skill/SKILL.md', 'removed']);
    expect(map.faces.find((f) => f.category === 'deprecated')?.seed).toBe(false);
    expect(map.agents_md.mode).toBe('append-block');
  });

  it('битый JSON → честная ошибка, не молчаливое отсутствие', async () => {
    const { loadUpdateMap } = await import('../../../src/adapters/fs/update-map.js');
    const dir = makeFixture('{ not json');
    fixtures.push(dir);
    expect(() => loadUpdateMap(dir.root)).toThrow(/corrupted/i);
  });

  it('невалидная схема (плохая категория, голый минор, нет outside_v1) → ошибка', async () => {
    const { loadUpdateMap } = await import('../../../src/adapters/fs/update-map.js');
    const cases: string[] = [
      JSON.stringify({ ...MINI_MAP, files: [{ path: 'x', kind: 'agent', category: 'fresh' }] }),
      JSON.stringify({ ...MINI_MAP, version: '2.19' }),
      JSON.stringify({ ...MINI_MAP, outside_v1: undefined }),
    ];
    for (const json of cases) {
      const dir = makeFixture(json);
      fixtures.push(dir);
      expect(() => loadUpdateMap(dir.root), json).toThrow(/invalid/i);
    }
  });

  it('карта из будущего (version > CLI) → честный error, не молчаливое использование', async () => {
    const { loadUpdateMap } = await import('../../../src/adapters/fs/update-map.js');
    const dir = makeFixture(JSON.stringify({ ...MINI_MAP, version: '2.20.0' }), '2.19.0');
    fixtures.push(dir);
    expect(() => loadUpdateMap(dir.root)).toThrow(/newer than CLI 2\.19\.0/);
  });
});

describe('схема: R10.4/R10.5 — инструкции категорий и вне-покрытия', () => {
  it('R10.4: deprecated-шаблон лица — seed:false (репортится, не мутируется), запись сохраняется дословно', async () => {
    const { loadUpdateMap } = await import('../../../src/adapters/fs/update-map.js');
    const dir = makeFixture(JSON.stringify(MINI_MAP));
    fixtures.push(dir);
    const map = loadUpdateMap(dir.root);
    const dep = map.faces.find((f) => f.template === 'base/playbooks/wolf-review-lenses.md');
    expect(dep).toEqual({
      template: 'base/playbooks/wolf-review-lenses.md',
      owner_skill: 'mr-wolf',
      category: 'deprecated',
      seed: false,
    });
  });

  it('R10.5: outside_v1 обязателен и перечисляет классы вне покрытия явно', async () => {
    const { UpdateMapSchema } = await import('../../../src/adapters/fs/update-map.js');
    expect(UpdateMapSchema.safeParse(MINI_MAP).success).toBe(true);
    const { outside_v1: _drop, ...withoutOutside } = MINI_MAP;
    expect(UpdateMapSchema.safeParse(withoutOutside).success).toBe(false);
  });
});

describe('генератор: R10.2 — категории по diff prev→cur + полный состав', () => {
  it('new/changed/unchanged/removed вычислимы; удалённый шаблон лица → deprecated seed:false; deprecated курируется', async () => {
    const { buildUpdateMap, syncTargets } = await import('../../../scripts/generate-update-map.mjs');
    const dir = makeFixture('{}');
    fixtures.push(dir);
    const cur = (rel: string) => readFileSync(join(dir.templates, rel), 'utf8');
    const prevIndex = new Map<string, string | null>([
      ['base/agents/mr-wolf.md', cur('base/agents/mr-wolf.md')], // unchanged
      ['base/commands/complain.md', 'old content'], // changed, но курируемый deprecated
      ['base/skills/gone-skill/SKILL.md', 'was here'], // removed (нет в текущих)
      ['base/playbooks/mr-wolf.md', cur('base/playbooks/mr-wolf.md')], // unchanged face
      ['base/playbooks/wolf-review-lenses.md', '---\nowner_skill: mr-wolf\n---\nold'], // deprecated face
      ['base/AGENTS.md', 'old onboarding'], // agents_md changed
    ]);
    const existing = {
      files: [{ path: 'base/commands/complain.md', kind: 'command', category: 'deprecated' }],
      faces: [],
    };
    const { map } = buildUpdateMap({
      version: '2.19.0',
      prev: '2.18.5',
      templatesRoot: dir.templates,
      prevIndex,
      existing,
      schemaMigrations: [],
    });
    const cat = (p: string) => map.files.find((f: { path: string }) => f.path === p)?.category;
    expect(cat('base/agents/mr-wolf.md')).toBe('unchanged');
    expect(cat('base/commands/complain.md')).toBe('deprecated'); // курирование сохранено, не 'changed'
    expect(cat('base/skills/gone-skill/SKILL.md')).toBe('removed');
    expect(cat('opencode/plugins/wolf-router.ts')).toBe('new');
    expect(map.agents_md).toEqual({ category: 'changed', mode: 'append-block' });
    const deadFace = map.faces.find((f: { template: string }) => f.template === 'base/playbooks/wolf-review-lenses.md');
    expect(deadFace).toMatchObject({ category: 'deprecated', seed: false, owner_skill: 'mr-wolf' });
    // полный состав: каждая цель синка получила категорию
    for (const t of syncTargets(dir.templates)) {
      expect(cat(t.path), t.path).toBeDefined();
    }
  });
});

describe('verify: инварианты карта ↔ templates/ (guard)', () => {
  it('рассинхрон → ok:false с конкретными проблемами', async () => {
    const { verifyMap } = await import('../../../scripts/generate-update-map.mjs');
    const dir = makeFixture('{}');
    fixtures.push(dir);
    const good = {
      version: '2.19.0',
      prev: '2.18.5',
      files: [
        { path: 'base/agents/mr-wolf.md', kind: 'agent', category: 'unchanged' },
        { path: 'base/commands/complain.md', kind: 'command', category: 'unchanged' },
        { path: 'base/skills/using-skills/SKILL.md', kind: 'skill', category: 'unchanged' },
        { path: 'opencode/plugins/wolf-router.ts', kind: 'plugin', category: 'new' },
      ],
      faces: [{ template: 'base/playbooks/mr-wolf.md', owner_skill: 'mr-wolf', category: 'unchanged', seed: true }],
      agents_md: { category: 'unchanged', mode: 'append-block' },
      schema_migrations: [],
      outside_v1: [],
    };
    expect(verifyMap(good, dir.templates).ok).toBe(true);

    const problems = [
      { ...good, files: good.files.filter((f) => f.path !== 'base/agents/mr-wolf.md') }, // цель не покрыта
      { ...good, files: [...good.files, { path: 'base/agents/ghost.md', kind: 'agent', category: 'new' }] }, // файла нет
      {
        ...good,
        files: good.files.map((f) => (f.path === 'base/commands/complain.md' ? { ...f, category: 'removed' } : f)),
      }, // removed, но файл есть
      {
        ...good,
        faces: [{ template: 'base/playbooks/mr-wolf.md', owner_skill: 'mr-wolf', category: 'deprecated', seed: true }],
      }, // deprecated сеет
    ].map((m) => verifyMap(m, dir.templates));
    for (const r of problems) expect(r.ok).toBe(false);
    expect(problems[0].problems.join('\n')).toMatch(/not covered/);
    expect(problems[1].problems.join('\n')).toMatch(/missing from templates/);
    expect(problems[2].problems.join('\n')).toMatch(/still present/);
    expect(problems[3].problems.join('\n')).toMatch(/must not seed/);
  });

  it('репо-guard: карта на диске валидна, в sync, и входит в package.json files (R10.1/R10.2)', async () => {
    const { loadUpdateMap } = await import('../../../src/adapters/fs/update-map.js');
    const { verifyMap } = await import('../../../scripts/generate-update-map.mjs');
    const cwd = process.cwd();
    const map = loadUpdateMap(cwd); // schema + не-из-будущего
    const r = verifyMap(map, join(cwd, 'templates'), cwd);
    expect(r.problems, r.problems.join('\n')).toEqual([]);
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as { files: string[] };
    expect(pkg.files).toContain('update-map.json');
  });
});
