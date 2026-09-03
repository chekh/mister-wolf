// tests/unit/adapters/render/opencode-renderer.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { OpencodeBaseSetRenderer } from '../../../../src/adapters/render/opencode/opencode-renderer.js';
import { parseStamp } from '../../../../src/adapters/render/stamp.js';

let proj: string;
let base: string;
let harness: string;

const renderer = () => new OpencodeBaseSetRenderer(base, { harnessTemplatesRoot: harness, setVersion: '9.9.9' });

beforeEach(() => {
  proj = mkdtempSync(join(tmpdir(), 'wolf-render-'));
  base = mkdtempSync(join(tmpdir(), 'wolf-base-'));
  harness = mkdtempSync(join(tmpdir(), 'wolf-h-'));
  mkdirSync(join(base, 'agents'), { recursive: true });
  mkdirSync(join(base, 'commands'), { recursive: true });
  mkdirSync(join(harness, 'plugins'), { recursive: true });
  writeFileSync(
    join(base, 'agents', 'mr-wolf.md'),
    '---\ndescription: d\nmodel: {{model.primary}}\n---\n# {{tool.task}}\n'
  );
  writeFileSync(join(base, 'commands', 'complain.md'), '/complain {{tool.skill}}\n');
  writeFileSync(join(harness, 'plugins', 'wolf-router.ts'), 'export const x = 1;\n');
  writeFileSync(
    join(base, 'AGENTS.md'),
    '<!-- wolf:onboarding v2 -->\n# Wolf\nПротокол: {{tool.skill}}.\n<!-- /wolf:onboarding -->\n'
  );
});

afterEach(() => {
  rmSync(proj, { recursive: true, force: true });
  rmSync(base, { recursive: true, force: true });
  rmSync(harness, { recursive: true, force: true });
});

describe('init', () => {
  it('создаёт из base + harness-плагинов; подстановка; штамп после frontmatter; повтор — skipped', async () => {
    const out = await renderer().renderBaseSet(proj);
    expect(out.filter((o) => o.action === 'created')).toHaveLength(4); // C1: commands + AGENTS.md не теряются
    const agent = readFileSync(join(proj, '.opencode/agents/mr-wolf.md'), 'utf-8');
    expect(agent).toContain('# task');
    expect(agent).toContain('wolf:rendered base=mr-wolf.md');
    const cmd = readFileSync(join(proj, '.opencode/command/complain.md'), 'utf-8');
    expect(cmd).toContain('/complain skill');
    expect(existsSync(join(proj, '.opencode/plugins/wolf-router.ts'))).toBe(true);
    const again = await renderer().renderBaseSet(proj);
    expect(again.every((o) => o.action === 'skipped')).toBe(true);
  });
  it('bake-in: вживлённое лицо присутствует в рендере (§11.4)', async () => {
    const bake = (baseName: string) => (baseName === 'mr-wolf.md' ? 'ЛИЦО: протокол v1' : null);
    await renderer().renderBaseSet(proj, { bake });
    const agent = readFileSync(join(proj, '.opencode/agents/mr-wolf.md'), 'utf-8');
    expect(agent).toContain('ЛИЦО: протокол v1');
    expect(agent).toContain('wolf:face');
  });
});

describe('модели и diff-ветка renderBaseSet (§4.5)', () => {
  it('с models подставляет конкретные id, плейсхолдеров не остаётся', async () => {
    await renderer().renderBaseSet(proj, { models: { primary: 'prov/m1', worker: 'prov/m2' } });
    const agent = readFileSync(join(proj, '.opencode/agents/mr-wolf.md'), 'utf-8');
    expect(agent).toContain('model: prov/m1');
    expect(agent).not.toContain('{{model.');
  });
  it('diff: существует unstamped → skipped (wx-политика), файл не тронут', async () => {
    mkdirSync(join(proj, '.opencode/agents'), { recursive: true });
    writeFileSync(join(proj, '.opencode/agents/mr-wolf.md'), 'чужое без штампа\n');
    const out = await renderer().renderBaseSet(proj);
    const o = out.find((x) => x.file === '.opencode/agents/mr-wolf.md');
    expect(o?.action).toBe('skipped');
    expect(o?.reason).toContain('wx');
    expect(readFileSync(join(proj, '.opencode/agents/mr-wolf.md'), 'utf-8')).toBe('чужое без штампа\n');
  });
  it('diff: stamped + иной контент (смена модели) → updated; совпадение → skipped', async () => {
    await renderer().renderBaseSet(proj, { models: { primary: 'p/m1', worker: 'w/m1' } });
    const out2 = await renderer().renderBaseSet(proj, { models: { primary: 'p/m2', worker: 'w/m2' } });
    expect(out2.find((o) => o.file === '.opencode/agents/mr-wolf.md')?.action).toBe('updated');
    expect(readFileSync(join(proj, '.opencode/agents/mr-wolf.md'), 'utf-8')).toContain('model: p/m2');
    const out3 = await renderer().renderBaseSet(proj, { models: { primary: 'p/m2', worker: 'w/m2' } });
    expect(out3.find((o) => o.file === '.opencode/agents/mr-wolf.md')?.action).toBe('skipped');
  });
  it('outcome.file — путь относительно baseDir, не basename (F5)', async () => {
    const out = await renderer().renderBaseSet(proj);
    expect(out.some((o) => o.file === '.opencode/agents/mr-wolf.md')).toBe(true);
    expect(out.some((o) => o.file === '.opencode/command/complain.md')).toBe(true);
    expect(out.some((o) => o.file === '.opencode/plugins/wolf-router.ts')).toBe(true);
    expect(out.some((o) => o.file === 'AGENTS.md')).toBe(true);
    expect(out.every((o) => !o.file.startsWith('/'))).toBe(true);
  });
});

describe('AGENTS.md (§4.2)', () => {
  it('отсутствует → created: цель в корне, штамп + маркер', async () => {
    const out = await renderer().renderBaseSet(proj);
    const o = out.find((x) => x.file === 'AGENTS.md');
    expect(o?.action).toBe('created');
    const cur = readFileSync(join(proj, 'AGENTS.md'), 'utf-8');
    expect(parseStamp(cur)?.base).toBe('AGENTS.md');
    expect(cur).toContain('<!-- wolf:onboarding v2 -->');
    expect(cur).toContain('<!-- /wolf:onboarding -->');
    expect(cur).toContain('# Wolf');
  });
  it('существует без маркера → marker-append: блок в конец, чужой контент цел, без штампа', async () => {
    writeFileSync(join(proj, 'AGENTS.md'), '# Чужой конфиг\nне трогай\n');
    const out = await renderer().renderBaseSet(proj);
    expect(out.find((x) => x.file === 'AGENTS.md')?.action).toBe('appended');
    const cur = readFileSync(join(proj, 'AGENTS.md'), 'utf-8');
    expect(cur.startsWith('# Чужой конфиг\nне трогай\n')).toBe(true);
    expect(cur).toContain('<!-- wolf:onboarding v2 -->');
    expect(cur).toContain('<!-- /wolf:onboarding -->');
    expect(cur.indexOf('# Чужой конфиг')).toBeLessThan(cur.indexOf('<!-- wolf:onboarding v2 -->'));
    expect(parseStamp(cur)).toBeNull();
  });
  it('маркер есть → skipped (повторный init)', async () => {
    await renderer().renderBaseSet(proj);
    const out = await renderer().renderBaseSet(proj);
    const o = out.find((x) => x.file === 'AGENTS.md');
    expect(o?.action).toBe('skipped');
  });
  it('sync обновляет только штампованный цельный файл; append-блок (без штампа) не трогаем', async () => {
    await renderer().renderBaseSet(proj);
    const r2 = new OpencodeBaseSetRenderer(base, { harnessTemplatesRoot: harness, setVersion: '1.0.1' });
    const res = await r2.syncBaseSet(proj);
    expect(res.outcomes.find((o) => o.file === 'AGENTS.md')?.action).toBe('updated');
    expect(parseStamp(readFileSync(join(proj, 'AGENTS.md'), 'utf-8'))?.set).toBe('1.0.1');

    const proj2 = mkdtempSync(join(tmpdir(), 'wolf-render2-'));
    try {
      writeFileSync(join(proj2, 'AGENTS.md'), '# Только чужой\n');
      await renderer().renderBaseSet(proj2); // AGENTS.md → appended (без штампа)
      const before = readFileSync(join(proj2, 'AGENTS.md'), 'utf-8');
      const res2 = await renderer().syncBaseSet(proj2);
      expect(res2.outcomes.find((o) => o.file === 'AGENTS.md')?.action).toBe('skipped');
      expect(readFileSync(join(proj2, 'AGENTS.md'), 'utf-8')).toBe(before);
    } finally {
      rmSync(proj2, { recursive: true, force: true });
    }
  });
});

describe('sync', () => {
  it('штампованный с изменённым контентом → updated; идентичный → skipped', async () => {
    await renderer().renderBaseSet(proj);
    const p = join(proj, '.opencode/agents/mr-wolf.md');
    writeFileSync(p, readFileSync(p, 'utf-8').replace('# task', '# task edited'));
    let res = await renderer().syncBaseSet(proj);
    expect(res.outcomes.find((o) => o.file.endsWith('mr-wolf.md'))?.action).toBe('updated');
    expect(readFileSync(p, 'utf-8')).not.toContain('# edited'); // перезаписан из шаблона
    res = await renderer().syncBaseSet(proj);
    expect(res.outcomes.find((o) => o.file.endsWith('mr-wolf.md'))?.action).toBe('skipped'); // M2: контент-компаратор
  });
  it('unstamped → conflict (файл не тронут, reason с опциями); orphaned при исчезновении шаблона', async () => {
    await renderer().renderBaseSet(proj);
    writeFileSync(join(proj, '.opencode/agents/rogue.md'), 'no stamp\n');
    writeFileSync(join(base, 'agents', 'rogue.md'), 'tpl\n');
    rmSync(join(harness, 'plugins', 'wolf-router.ts'));
    const { outcomes, orphaned } = await renderer().syncBaseSet(proj);
    const c = outcomes.find((o) => o.file.endsWith('rogue.md'));
    expect(c?.action).toBe('conflict');
    expect(c?.reason).toContain('rename'); // M10: опции разрешения
    expect(readFileSync(join(proj, '.opencode/agents/rogue.md'), 'utf-8')).toBe('no stamp\n');
    expect(orphaned.some((f) => f.includes('wolf-router.ts'))).toBe(true);
  });
});

describe('sync model context (§4.5)', () => {
  it('sync с контекстом моделей: агент рендерится конкретной моделью', async () => {
    const res = await renderer().syncBaseSet(proj, { primary: 'p/m9', worker: 'w/m9' });
    expect(res.outcomes.find((o) => o.file === '.opencode/agents/mr-wolf.md')?.action).toBe('created');
    expect(readFileSync(join(proj, '.opencode/agents/mr-wolf.md'), 'utf-8')).toContain('model: p/m9');
  });
  it('sync без контекста (легаси) и с omit: model:-строка удалена; повтор — skipped', async () => {
    const res = await renderer().syncBaseSet(proj); // undefined → omit
    expect(res.outcomes.find((o) => o.file === '.opencode/agents/mr-wolf.md')?.action).toBe('created');
    const agent = readFileSync(join(proj, '.opencode/agents/mr-wolf.md'), 'utf-8');
    expect(agent).not.toMatch(/^model:/m);
    expect(agent).not.toContain('{{model.');
    const res2 = await renderer().syncBaseSet(proj, 'omit');
    expect(res2.outcomes.find((o) => o.file === '.opencode/agents/mr-wolf.md')?.action).toBe('skipped');
  });
});
