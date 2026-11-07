import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { runArtifactLint } from '../../../src/app/use-cases/lint-artifacts.js';
import { changeRequestTemplate, requirementsTemplate } from '../../../src/app/use-cases/scaffold-artifact.js';

/** Собирает deps с фикстурой файлов; folders — записи docs/dev (папки), extra — .opencode/skills. */
function fixture(files: Record<string, string>, devFolders: string[] = [], skills: string[] = []) {
  const map = new Map<string, string>(Object.entries(files).map(([k, v]) => [join('/p', k), v]));
  const fs = {
    exists: async (p: string) =>
      map.has(p) ||
      devFolders.some((f) => p === join('/p', 'docs/dev', f) || p.startsWith(join('/p', 'docs/dev', f) + '/')) ||
      p === join('/p', 'docs/dev') ||
      p === join('/p', 'docs/dev/roadmap'),
    readFile: async (p: string) => map.get(p) ?? null,
    writeFile: async () => {},
    listDir: async (p: string) => {
      if (p === join('/p', 'docs/dev')) return [...devFolders, ...mapKeyNames(files, 'docs/dev/wave')];
      if (p === join('/p', 'docs/dev/roadmap')) return mapKeyNames(files, 'docs/dev/roadmap/');
      if (p === join('/p', '.opencode/skills')) return skills;
      return [];
    },
    listFiles: async (p: string) =>
      [...map.keys()].filter((f) => f.startsWith(p + '/')).map((f) => f.slice((p + '/').length)),
  };
  return {
    fs,
    deps: {
      fs: fs as never,
      baseDir: '/p',
      toolOwners: new Set<string>(['registered-skill']),
      baseSkillNames: new Set<string>(['wolf-plan']),
    },
  };
}

function mapKeyNames(files: Record<string, string>, prefix: string): string[] {
  return [
    ...new Set(
      Object.keys(files)
        .filter((f) => f.startsWith(prefix))
        .map((f) => f.split('/').pop() ?? '')
    ),
  ].filter(Boolean);
}

// 2.32.0 (Q5): change-request.md — first-class документ пакета
it('S21: change-request.md без front-matter и с неполной CR-записью', async () => {
  const { deps } = fixture(
    {
      'docs/dev/2026-10-08-x/requirements.md':
        '---\nslug: x\nstatus: draft\n---\n\n### REQ-01 — a\n- AC: z\n- Источник: d\n',
      'docs/dev/2026-10-08-x/change-request.md': '# CR\n\n- CR-2026-10-08-01: без полей\n- не CR строка\n',
    },
    ['2026-10-08-x']
  );
  const findings = await runArtifactLint(deps);
  expect(findings.some((f) => f.message.includes('change-request.md без front-matter'))).toBe(true);
  expect(findings.some((f) => f.message.includes('CR-2026-10-08-01 без downstream-отметки'))).toBe(true);
  expect(findings.some((f) => f.message.includes('CR-2026-10-08-01 без отметки «утвердил»'))).toBe(true);
});

it('S21: CR с неверным номером, дублем и битой ссылкой на REQ', async () => {
  const { deps } = fixture(
    {
      'docs/dev/2026-10-08-x/requirements.md':
        '---\nslug: x\nstatus: draft\n---\n\n### REQ-01 — a\n- AC: z\n- Источник: d\n',
      'docs/dev/2026-10-08-x/change-request.md':
        '---\nslug: x\ntitle: X — запросы на изменение\nstatus: draft\ncreated: 2026-10-08\n---\n\n' +
        '- CR-01: короткий номер — утвердил owner; downstream: нет\n' +
        '- CR-2026-10-08-01: правка REQ-01 — утвердил owner; downstream: design\n' +
        '- CR-2026-10-08-01: правка REQ-09 — утвердил owner; downstream: нет\n',
    },
    ['2026-10-08-x']
  );
  const findings = await runArtifactLint(deps);
  expect(findings.some((f) => f.message.includes('CR без номера CR-<YYYY-MM-DD>-NN'))).toBe(true);
  expect(findings.some((f) => f.message.includes('CR-2026-10-08-01 дублируется'))).toBe(true);
  expect(findings.some((f) => f.message.includes('REQ-09 не найден в requirements.md'))).toBe(true);
});

it('S21: корректный change-request.md новых findings по себе не даёт', async () => {
  const { deps } = fixture(
    {
      'docs/dev/2026-10-08-x/requirements.md':
        '---\nslug: x\nstatus: draft\n---\n\n### REQ-01 — a\n- AC: z\n- Источник: d\n',
      'docs/dev/2026-10-08-x/change-request.md':
        '---\nslug: x\ntitle: X — запросы на изменение\nstatus: draft\ncreated: 2026-10-08\n---\n\n' +
        '- CR-2026-10-08-01: уточнили REQ-01 — утвердил owner; downstream: design, test-plan\n',
    },
    ['2026-10-08-x']
  );
  const findings = await runArtifactLint(deps);
  expect(findings.filter((f) => f.file.includes('change-request.md'))).toEqual([]);
});

// F1: блочная форма CR из changeRequestTemplate (заголовок ### CR-… + поля на отдельных строках).
it('S21/F1: блочный CR без downstream и без утвердил — оба finding (негативная самопроверка)', async () => {
  const { deps } = fixture(
    {
      'docs/dev/2026-10-08-x/requirements.md':
        '---\nslug: x\nstatus: draft\n---\n\n### REQ-01 — a\n- AC: z\n- Источник: d\n',
      'docs/dev/2026-10-08-x/change-request.md':
        '---\nslug: x\ntitle: X — запросы на изменение\nstatus: draft\ncreated: 2026-10-08\n---\n\n## Запросы\n\n' +
        '### CR-2026-10-08-01 — правка REQ-01\n\n<что и почему>\n',
    },
    ['2026-10-08-x']
  );
  const findings = await runArtifactLint(deps);
  expect(findings.some((f) => f.message.includes('CR-2026-10-08-01 без downstream-отметки'))).toBe(true);
  expect(findings.some((f) => f.message.includes('CR-2026-10-08-01 без отметки «утвердил»'))).toBe(true);
});

it('S21/F1: блочный CR (форма changeRequestTemplate) проходит без CR-findings; битая ссылка из «затронуто» ловится', async () => {
  const req = '---\nslug: x\nstatus: draft\n---\n\n### REQ-01 — a\n- AC: z\n- Источник: d\n';
  const crBody =
    '### CR-2026-10-08-01 — уточнили REQ-01\n\n<что и почему>\n\n- затронуто: REQ-01\n\n- утвердил: owner\n\n- downstream: design, test-plan\n';
  const { deps } = fixture(
    {
      'docs/dev/2026-10-08-x/requirements.md': req,
      'docs/dev/2026-10-08-x/change-request.md':
        '---\nslug: x\ntitle: X — запросы на изменение\nstatus: draft\ncreated: 2026-10-08\n---\n\n## Запросы\n\n' +
        crBody,
    },
    ['2026-10-08-x']
  );
  const ok = await runArtifactLint(deps);
  expect(ok.filter((f) => f.file.includes('change-request.md'))).toEqual([]);

  const { deps: deps2 } = fixture(
    {
      'docs/dev/2026-10-08-x/requirements.md': req,
      'docs/dev/2026-10-08-x/change-request.md':
        '---\nslug: x\ntitle: X — запросы на изменение\nstatus: draft\ncreated: 2026-10-08\n---\n\n## Запросы\n\n' +
        crBody.replace('- затронуто: REQ-01', '- затронуто: REQ-09'),
    },
    ['2026-10-08-x']
  );
  const bad = await runArtifactLint(deps2);
  expect(bad.some((f) => f.message.includes('REQ-09 не найден в requirements.md'))).toBe(true);
});

it('S21/F1: блочные CR — дубликат номера и блочный заголовок без валидного номера', async () => {
  const { deps } = fixture(
    {
      'docs/dev/2026-10-08-x/requirements.md':
        '---\nslug: x\nstatus: draft\n---\n\n### REQ-01 — a\n- AC: z\n- Источник: d\n',
      'docs/dev/2026-10-08-x/change-request.md':
        '---\nslug: x\ntitle: X — запросы на изменение\nstatus: draft\ncreated: 2026-10-08\n---\n\n## Запросы\n\n' +
        '### CR-2026-10-08-01 — a\n\n- утвердил: o\n\n- downstream: нет\n\n' +
        '### CR-2026-10-08-01 — b\n\n- утвердил: o\n\n- downstream: нет\n\n' +
        '### CR-02 — c\n\n- утвердил: o\n\n- downstream: нет\n',
    },
    ['2026-10-08-x']
  );
  const findings = await runArtifactLint(deps);
  expect(findings.some((f) => f.message.includes('CR-2026-10-08-01 дублируется'))).toBe(true);
  expect(findings.some((f) => f.message.includes('CR без номера CR-<YYYY-MM-DD>-NN'))).toBe(true);
});

it('F1: scaffold→lint — changeRequestTemplate и requirementsTemplate (full и fix) проходят lint чисто', async () => {
  const created = '2026-11-07';
  const files = (fix: boolean) => ({
    'docs/dev/2026-11-07-x/requirements.md': requirementsTemplate('x', 'X', created, fix),
    'docs/dev/2026-11-07-x/change-request.md': changeRequestTemplate('x', 'X', created),
    'docs/dev/wave-x.md': '---\nslug: wave-x\nstatus: draft\n---\n\n- x\n',
  });
  const run1 = fixture(files(false), ['2026-11-07-x']);
  expect(await runArtifactLint(run1.deps)).toEqual([]);
  const run2 = fixture(files(true), ['2026-11-07-x']);
  expect(await runArtifactLint(run2.deps)).toEqual([]);
});

describe('runArtifactLint (спека §4-A3)', () => {
  it('duplicate REQ id in one folder', async () => {
    const { deps } = fixture(
      {
        'docs/dev/2026-10-08-x/requirements.md':
          '---\nslug: x\nstatus: draft\ncreated: 2026-10-08\n---\n\n### REQ-01 — a\n- AC: z\n- Источник: d\n\n### REQ-01 — b\n- AC: z\n- Источник: d\n',
      },
      ['2026-10-08-x']
    );
    const findings = await runArtifactLint(deps);
    expect(findings.some((f) => f.message.includes('REQ-01 дублируется'))).toBe(true);
  });

  it('broken REQ reference in design.md', async () => {
    const { deps } = fixture(
      {
        'docs/dev/2026-10-08-x/requirements.md':
          '---\nslug: x\nstatus: draft\n---\n\n### REQ-01 — a\n- AC: z\n- Источник: d\n',
        'docs/dev/2026-10-08-x/design.md': '---\nslug: x\nstatus: draft\n---\n\nсм. REQ-09\n',
      },
      ['2026-10-08-x']
    );
    const findings = await runArtifactLint(deps);
    expect(findings.some((f) => f.message.includes('REQ-09 не найден в requirements.md'))).toBe(true);
  });

  it('REQ without AC and without Источник', async () => {
    const { deps } = fixture(
      {
        'docs/dev/2026-10-08-x/requirements.md':
          '---\nslug: x\nstatus: draft\n---\n\n### REQ-02 — b\n- История: как-то\n',
      },
      ['2026-10-08-x']
    );
    const findings = await runArtifactLint(deps);
    expect(findings.some((f) => f.message.includes('REQ-02: нет строки "AC:"'))).toBe(true);
    expect(findings.some((f) => f.message.includes('REQ-02: нет строки "Источник:"'))).toBe(true);
  });

  it('НЕОПРЕДЕЛЕНО in approved document', async () => {
    const { deps } = fixture(
      {
        'docs/dev/2026-10-08-x/requirements.md':
          '---\nslug: x\nstatus: approved\n---\n\n[НЕОПРЕДЕЛЕНО: вопрос владельцу]\n',
      },
      ['2026-10-08-x']
    );
    const findings = await runArtifactLint(deps);
    expect(findings.some((f) => f.message.includes('[НЕОПРЕДЕЛЕНО') && f.message.includes('approved'))).toBe(true);
  });

  it('CR record without downstream mark', async () => {
    const { deps } = fixture(
      {
        'docs/dev/2026-10-08-x/requirements.md':
          '---\nslug: x\nstatus: approved\n---\n\n- CR-2026-10-08-01: поменяли REQ-01 — владелец\n',
      },
      ['2026-10-08-x']
    );
    const findings = await runArtifactLint(deps);
    expect(
      findings.some((f) => f.message.includes('CR-2026-10-08-01') && f.message.includes('без downstream-отметки'))
    ).toBe(true);
  });

  it('CR demands downstream reset but design/plan still approved (§6.7)', async () => {
    const { deps } = fixture(
      {
        'docs/dev/2026-10-08-x/requirements.md':
          '---\nslug: x\nstatus: approved\n---\n\n- CR-2026-10-08-01: поменяли REQ-01 — владелец; downstream: design, plan\n',
        'docs/dev/2026-10-08-x/design.md': '---\nslug: x\nstatus: approved\n---\n',
        'docs/dev/2026-10-08-x/plan.md': '---\nslug: x\nstatus: draft\n---\n',
      },
      ['2026-10-08-x']
    );
    const findings = await runArtifactLint(deps);
    expect(findings.some((f) => f.message.includes('требует сброса статуса design.md'))).toBe(true);
    expect(findings.some((f) => f.message.includes('требует сброса статуса plan.md'))).toBe(false);
  });

  it('F1: блочный CR в requirements.md без downstream (форма scaffold)', async () => {
    const { deps } = fixture(
      {
        'docs/dev/2026-10-08-x/requirements.md':
          '---\nslug: x\nstatus: draft\n---\n\n## 7. Журнал изменений (CR)\n\n### CR-2026-10-08-01 — правка REQ-01\n\n<что и почему>\n',
      },
      ['2026-10-08-x']
    );
    const findings = await runArtifactLint(deps);
    expect(findings.some((f) => f.message.includes('CR-2026-10-08-01 без downstream-отметки'))).toBe(true);
  });

  it('F1: блочный CR в requirements.md требует сброса design/plan (§6.7)', async () => {
    const { deps } = fixture(
      {
        'docs/dev/2026-10-08-x/requirements.md':
          '---\nslug: x\nstatus: approved\n---\n\n### CR-2026-10-08-01 — правка REQ-01\n\n<что и почему>\n\n- downstream: design, plan\n',
        'docs/dev/2026-10-08-x/design.md': '---\nslug: x\nstatus: approved\n---\n',
        'docs/dev/2026-10-08-x/plan.md': '---\nslug: x\nstatus: draft\n---\n',
      },
      ['2026-10-08-x']
    );
    const findings = await runArtifactLint(deps);
    expect(findings.some((f) => f.message.includes('требует сброса статуса design.md'))).toBe(true);
    expect(findings.some((f) => f.message.includes('требует сброса статуса plan.md'))).toBe(false);
  });

  it('duplicate requirement text in one folder', async () => {
    const dup =
      '---\nslug: x\nstatus: draft\n---\n\n### REQ-01 — a\n- Требование: Когда щелчок, система должна сохранить.\n- AC: z\n- Источник: d\n\n### REQ-02 — b\n- Требование: когда  ЩЕЛЧОК,  система должна сохранить.\n- AC: z\n- Источник: d\n';
    const { deps } = fixture({ 'docs/dev/2026-10-08-x/requirements.md': dup }, ['2026-10-08-x']);
    const findings = await runArtifactLint(deps);
    expect(findings.some((f) => f.message.includes('дубликат требования'))).toBe(true);
  });

  it('roadmap item duplicated across two files', async () => {
    const { deps } = fixture({
      'docs/dev/roadmap/wave-2.16.md': '- Конвейер: части индексов\n',
      'docs/dev/roadmap/backlog.md': '- Конвейер: части  индексов\n',
    });
    const findings = await runArtifactLint(deps);
    expect(findings.some((f) => f.message.includes('пункт роадмапа в двух файлах'))).toBe(true);
  });

  it('released wave without feature folder; folder not mentioned in waves', async () => {
    const { deps } = fixture(
      {
        'docs/dev/wave-2.14.md': '---\nslug: wave-2.14\nstatus: released\n---\n\n- analytics-dashboard\n',
        'docs/dev/2026-10-08-orphan/requirements.md': '---\nslug: orphan\nstatus: draft\n---\n',
      },
      ['2026-10-08-orphan']
    );
    const findings = await runArtifactLint(deps);
    expect(findings.some((f) => f.message.includes('нет папки фичи'))).toBe(true);
    expect(findings.some((f) => f.message.includes('не упомянута в файлах волн'))).toBe(true);
  });

  it('feature readiness hints', async () => {
    const { deps } = fixture(
      {
        'docs/dev/2026-10-08-done/plan.md': '---\nslug: done\nstatus: approved\n---\n\n- [x] Задача 1\n',
        'docs/dev/2026-10-08-wip/plan.md': '---\nslug: wip\nstatus: draft\n---\n\n- [x] Задача 1\n- [ ] Задача 2\n',
      },
      ['2026-10-08-done', '2026-10-08-wip']
    );
    const findings = await runArtifactLint(deps);
    expect(findings.some((f) => f.message.includes('готова к релизу'))).toBe(true);
    expect(findings.some((f) => f.message.includes('в работе (закрыто 1 из 2'))).toBe(true);
  });

  it('ghost skill without tool object; base-set excluded', async () => {
    const { deps } = fixture({}, [], ['ghost-skill', 'wolf-plan']);
    const findings = await runArtifactLint(deps);
    expect(findings.some((f) => f.message.includes('скилл-призрак') && f.message.includes('ghost-skill'))).toBe(true);
    expect(findings.some((f) => f.message.includes('скилл-призрак') && f.message.includes('wolf-plan'))).toBe(false);
    expect(findings.some((f) => f.message.includes('скилл-призрак') && f.message.includes('registered-skill'))).toBe(
      false
    );
  });

  it('clean docs/dev — silence', async () => {
    const { deps } = fixture({}, []);
    expect(await runArtifactLint(deps)).toEqual([]);
  });
});
