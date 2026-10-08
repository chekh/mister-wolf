import { describe, it, expect } from 'vitest';
import { join } from 'path';
import {
  scaffoldArtifact,
  requirementsTemplate,
  designTemplate,
  planTemplate,
  testPlanTemplate,
} from '../../../src/app/use-cases/scaffold-artifact.js';
import { UserFacingError } from '../../../src/domain/errors.js';

const CREATED = '2026-10-08';

/** fs-двойник: Map путей → контент; exists по файлу или папке. */
function memFs(initial: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(initial));
  return {
    files,
    fs: {
      exists: async (p: string) => files.has(p) || [...files.keys()].some((k) => k.startsWith(p + '/')),
      writeFile: async (p: string, c: string) => {
        files.set(p, c);
      },
    },
  };
}

function deps(base = '/proj') {
  const m = memFs();
  return {
    ...m,
    deps: { clock: { now: () => new Date('2026-10-08T10:00:00Z') }, fs: m.fs, baseDir: base },
  };
}

describe('scaffoldArtifact', () => {
  it('full profile creates 4 templates with front-matter', async () => {
    const { deps: d, files } = deps();
    const res = await scaffoldArtifact(d, { slug: 'demo', fix: false });
    const dir = join('/proj', 'docs', 'dev', '2026-10-08-demo');
    expect(res.dir).toBe(dir);
    expect(res.files.map((f) => f.split('/').pop()).sort()).toEqual(
      ['design.md', 'plan.md', 'requirements.md', 'test-plan.md'].sort()
    );
    const req = files.get(join(dir, 'requirements.md')) ?? '';
    expect(req).toContain('slug: demo');
    expect(req).toContain('status: draft');
    expect(req).toContain('created: 2026-10-08');
    expect(req).toContain('## 4. Функциональные требования');
    expect(req).toContain('### REQ-01 —');
    expect(req).toContain('- AC:');
    expect(req).toContain('- Источник:');
    expect(req).toContain('## 7. Журнал изменений (CR)');
  });

  it('fix profile creates 2 files with CR journal as content', async () => {
    const { deps: d, files } = deps();
    const res = await scaffoldArtifact(d, { slug: 'hot-1', fix: true });
    expect(res.files.map((f) => f.split('/').pop()).sort()).toEqual(['plan.md', 'requirements.md'].sort());
    expect(files.get(res.files[0].replace('plan.md', 'requirements.md'))).toContain('Журнал изменений (CR)');
  });

  it('existing slug refuses without side effects', async () => {
    const { deps: d, files } = deps();
    await scaffoldArtifact(d, { slug: 'demo', fix: false });
    const count = files.size;
    await expect(scaffoldArtifact(d, { slug: 'demo', fix: false })).rejects.toBeInstanceOf(UserFacingError);
    expect(files.size).toBe(count);
  });

  it('invalid slug refuses', async () => {
    const { deps: d } = deps();
    await expect(scaffoldArtifact(d, { slug: 'Bad_Slug', fix: false })).rejects.toBeInstanceOf(UserFacingError);
  });

  it('templates carry the §4.1 anatomy verbatim', () => {
    const req = requirementsTemplate('x', 'X', CREATED, false);
    // 7 секций анатомии
    for (const s of [
      '## 1. Контекст и проблема',
      '## 2. Область',
      '## 3. Глоссарий',
      '## 4. Функциональные требования',
      '## 5. Нефункциональные требования (NFR)',
      '## 6. Ограничения и допущения',
      '## 7. Журнал изменений (CR)',
    ])
      expect(req).toContain(s);
    // анатомия записи
    for (const f of ['- История:', '- Требование:', '- Обоснование:', '- AC:', '- Приоритет:', '- Источник:'])
      expect(req).toContain(f);
    expect(designTemplate('x', 'X', CREATED)).toContain('≤ 10 строк');
    expect(planTemplate('x', 'X', CREATED)).toContain('- [ ] Задача 1:');
    expect(testPlanTemplate('x', 'X', CREATED)).toContain('Given');
  });
});
