// tests/unit/adapters/render/opencode-renderer.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { OpencodeBaseSetRenderer } from '../../../../src/adapters/render/opencode/opencode-renderer.js';

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
  writeFileSync(join(base, 'agents', 'mr-wolf.md'), '---\ndescription: d\n---\n# {{tool.task}}\n');
  writeFileSync(join(base, 'commands', 'complain.md'), '/complain {{tool.skill}}\n');
  writeFileSync(join(harness, 'plugins', 'wolf-router.ts'), 'export const x = 1;\n');
});

afterEach(() => {
  rmSync(proj, { recursive: true, force: true });
  rmSync(base, { recursive: true, force: true });
  rmSync(harness, { recursive: true, force: true });
});

describe('init', () => {
  it('создаёт из base + harness-плагинов; подстановка; штамп после frontmatter; повтор — skipped', async () => {
    const out = await renderer().renderBaseSet(proj);
    expect(out.filter((o) => o.action === 'created')).toHaveLength(3); // C1: commands не теряются
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
    await renderer().renderBaseSet(proj, bake);
    const agent = readFileSync(join(proj, '.opencode/agents/mr-wolf.md'), 'utf-8');
    expect(agent).toContain('ЛИЦО: протокол v1');
    expect(agent).toContain('wolf:face');
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
    expect(c?.reason).toContain('переименовать'); // M10: опции разрешения
    expect(readFileSync(join(proj, '.opencode/agents/rogue.md'), 'utf-8')).toBe('no stamp\n');
    expect(orphaned.some((f) => f.includes('wolf-router.ts'))).toBe(true);
  });
});
