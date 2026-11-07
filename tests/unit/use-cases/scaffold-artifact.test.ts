import { describe, it, expect } from 'vitest';
import { join } from 'path';
import {
  scaffoldArtifact,
  requirementsTemplate,
  designTemplate,
  planTemplate,
  testPlanTemplate,
  preRequirementsTemplate,
  changeRequestTemplate,
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
    // 2.17.1 REQ-05: guard claim отключён — юнит тестирует шаблоны, guard — в claim-workflow
    deps: {
      clock: { now: () => new Date('2026-10-08T10:00:00Z') },
      fs: m.fs,
      baseDir: base,
      claims: { requireClaim: () => {} },
    },
  };
}

describe('scaffoldArtifact', () => {
  it('full profile creates 6 package templates with front-matter in canonical order', async () => {
    const { deps: d, files } = deps();
    const res = await scaffoldArtifact(d, { slug: 'demo', fix: false });
    const dir = join('/proj', 'docs', 'dev', '2026-10-08-demo');
    expect(res.dir).toBe(dir);
    // 2.32.0 (Q5): порядок документов пакета — pre-requirements → requirements →
    // change-request → design → test-plan → plan
    expect(res.files.map((f) => f.split('/').pop())).toEqual([
      'pre-requirements.md',
      'requirements.md',
      'change-request.md',
      'design.md',
      'test-plan.md',
      'plan.md',
    ]);
    expect(res.complete).toBe(false);
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

  it('S18: top-up на существующей папке добавляет только недостающие документы', async () => {
    // поток brainstorm → scaffold: папка уже есть, в ней только pre-requirements.md
    const dir = join('/proj', 'docs', 'dev', '2026-10-08-demo');
    const pre = '# Pre-requirements: итог обсуждения\n';
    const m = memFs({ [join(dir, 'pre-requirements.md')]: pre });
    const d = {
      clock: { now: () => new Date('2026-10-08T10:00:00Z') },
      fs: m.fs,
      baseDir: '/proj',
      claims: { requireClaim: () => {} },
    };
    const res = await scaffoldArtifact(d, { slug: 'demo', fix: false });
    expect(res.files.map((f) => f.split('/').pop())).toEqual([
      'requirements.md',
      'change-request.md',
      'design.md',
      'test-plan.md',
      'plan.md',
    ]);
    expect(res.existing).toEqual([join(dir, 'pre-requirements.md')]);
    expect(m.files.get(join(dir, 'pre-requirements.md'))).toBe(pre); // не перезаписан
  });

  it('S19: полный пакет — «добавлять нечего», ни одной записи', async () => {
    const { deps: d, files } = deps();
    await scaffoldArtifact(d, { slug: 'demo', fix: false });
    const count = files.size;
    const res = await scaffoldArtifact(d, { slug: 'demo', fix: false });
    expect(res.complete).toBe(true);
    expect(res.files).toEqual([]);
    expect(res.existing).toHaveLength(6);
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

  it('S16: pre-requirements и change-request несут объявленные разделы и номер CR', () => {
    const pre = preRequirementsTemplate('x', 'X', CREATED);
    for (const s of [
      '## 1. Намерение и польза',
      '## 2. Рамка и ключевые решения',
      '## 3. Открытые вопросы',
      '## 4. Что дальше',
    ])
      expect(pre).toContain(s);

    const cr = changeRequestTemplate('x', 'X', CREATED);
    expect(cr).toContain('change-request');
    expect(cr).toContain('Append-only');
    expect(cr).toContain(`### CR-${CREATED}-01`); // заголовочная форма с ID
    expect(cr).toContain('- downstream:');
    expect(cr).toContain('slug: x');
    expect(cr).toContain('status: draft');
  });

  it('M2: ADR в designTemplate — настоящий заголовок с ID, поля отдельными блоками', () => {
    const design = designTemplate('x', 'X', CREATED);
    const lines = design.split('\n');
    const adr = lines.findIndex((l) => l.startsWith('### ADR-'));
    expect(adr, 'заголовок ADR с ID и названием').toBeGreaterThanOrEqual(0);
    expect(design).toContain('владелец визирует отдельно'); // продуктовые выборы — комментарий сохранён
    const fields = ['- Контекст:', '- Решение:', '- Последствия:', '- Статус:'].map((f) =>
      lines.findIndex((l) => l.startsWith(f))
    );
    for (const [k, i] of fields.entries()) expect(i, `поле ${k} внутри ADR-карточки`).toBeGreaterThan(adr);
    for (let k = 0; k < fields.length - 1; k++) expect(lines[fields[k]! + 1], `пустая строка после поля ${k}`).toBe('');
  });

  it('M2: CR — заголовок с ID и служебные поля блоками во всех трёх местах', () => {
    const docs: Array<[string, string]> = [
      ['change-request', changeRequestTemplate('x', 'X', CREATED)],
      ['requirements full', requirementsTemplate('x', 'X', CREATED, false)],
      ['requirements fix', requirementsTemplate('x', 'X', CREATED, true)],
    ];
    for (const [where, doc] of docs) {
      const lines = doc.split('\n');
      const head = lines.findIndex((l) => l.startsWith(`### CR-${CREATED}-01`));
      expect(head, `${where}: заголовок CR с ID`).toBeGreaterThanOrEqual(0);
      expect(lines[head + 1], `${where}: пустая строка после заголовка`).toBe('');
      const approved = lines.findIndex((l) => l.startsWith('- утвердил:'));
      const downstream = lines.findIndex((l) => l.startsWith('- downstream:'));
      expect(approved, `${where}: поле «утвердил»`).toBeGreaterThan(head);
      expect(downstream, `${where}: поле «downstream» после «утвердил»`).toBeGreaterThan(approved);
      expect(lines[approved - 1], `${where}: «утвердил» отдельным блоком`).toBe('');
      expect(lines[downstream - 1], `${where}: «downstream» отдельным блоком`).toBe('');
      expect(doc, `${where}: не однострочник через «;»`).not.toContain('; downstream');
    }
    // различие документов: журнал требований (как и CR-документ) указывает затронутое требование
    expect(requirementsTemplate('x', 'X', CREATED, false)).toContain('- затронуто: <REQ/NFR>');
    expect(changeRequestTemplate('x', 'X', CREATED)).toContain('- затронуто: <REQ/NFR или "нет">');
  });

  it('M2: AC в requirementsTemplate — Given/When/Then отдельными пунктами под AC', () => {
    const req = requirementsTemplate('x', 'X', CREATED, false);
    const lines = req.split('\n');
    const ac = lines.findIndex((l) => l.startsWith('- AC:'));
    expect(ac).toBeGreaterThanOrEqual(0);
    const words = ['Given', 'When', 'Then'];
    words.forEach((w, k) => {
      const i = lines.findIndex((l) => l.startsWith(`  - ${w}`));
      expect(i, `${w} — вложенный пункт сразу под AC`).toBe(ac + 1 + k);
    });
  });

  it('M2: план — чекбокс-маркер задачи и шаги длинной задачи', () => {
    const plan = planTemplate('x', 'X', CREATED);
    const lines = plan.split('\n');
    const task = lines.findIndex((l) => l.startsWith('- [ ] Задача 1:'));
    expect(task, 'чекбокс распознаваем как маркер задачи').toBeGreaterThanOrEqual(0);
    expect(lines[task + 1], 'подпункты-шаги под пунктом с чекбоксом').toMatch(/^ {2}- Шаг:/);
    expect(plan).toContain('переворачивает чекбокс в [x]'); // контракт завершённости сохранён
    expect(plan).toContain('сделано → коммит');
  });
});
