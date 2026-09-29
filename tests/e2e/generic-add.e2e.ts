import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'fs';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';
import { MEMORY_TYPES } from '../../src/domain/memory-types.js';

// Таксономия 2.13: 7 core-типов; таблица не хардкодит список — покрытие
// сверяется с MEMORY_TYPES (как в tests/unit/domain/taxonomy.test.ts).
// expectedStatus = defaultStatus декларации (голова lifecycle, если не задана).
const TYPES: Record<string, { args: string[]; expectedStatus: string }> = {
  rule: { args: ['--set', 'scope=project'], expectedStatus: 'active' },
  lesson: { args: [], expectedStatus: 'active' },
  decision: { args: [], expectedStatus: 'active' },
  thread: { args: ['--set', 'goal=G'], expectedStatus: 'active' },
  complaint: {
    args: ['--set', 'about=a,rule=r,evidence=e,proposal=p'],
    expectedStatus: 'open',
  },
  tool: { args: ['--set', 'name=x,script_path=s,language=ts'], expectedStatus: 'candidate' },
  note: { args: ['--facet', 'howto'], expectedStatus: 'active' },
};

// Старые типы 2.12 — commander choices даёт exit 1 с invalid-подсказкой.
const OLD_TYPES = ['observation', 'article', 'open-question', 'work-thread'];

describe('all creatable types default to declaration lifecycle head via generic add', () => {
  let cwd: string;
  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it('TYPES table covers every MEMORY_TYPES entry exactly once', () => {
    expect(Object.keys(TYPES).sort()).toEqual([...MEMORY_TYPES].sort());
  });

  for (const type of MEMORY_TYPES) {
    const spec = TYPES[type];
    it(`${type} → ${spec.expectedStatus}`, () => {
      const r = runCli(['add', '--type', type, '--title', `${type} test`, ...spec.args], cwd);
      expect(r.status).toBe(0);
      const id = r.stdout.match(/Created memory object: (\S+)/)?.[1]!;
      expect(id).toBeDefined();

      const g = runCli(['get', id], cwd);
      expect(g.status).toBe(0);
      expect(g.stdout).toContain(spec.expectedStatus);
    });
  }

  for (const oldType of OLD_TYPES) {
    it(`${oldType} rejected (removed in 2.13, commander choices)`, () => {
      const r = runCli(['add', '--type', oldType, '--title', 'old'], cwd);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('is invalid');
      expect(r.stderr).toContain(MEMORY_TYPES.join(', '));
    });
  }
});
