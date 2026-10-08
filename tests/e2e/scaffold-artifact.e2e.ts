import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

describe('wolf scaffold artifact (2.15 A1)', () => {
  let cwd: string;

  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
  });

  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it('full profile: 4 файла в docs/dev/<date>-demo, front-matter draft', () => {
    const r = runCli(['scaffold', 'artifact', 'demo'], cwd);
    expect(r.status).toBe(0);

    const devDir = join(cwd, 'docs', 'dev');
    const dirs = readdirSync(devDir).filter((d) => d.endsWith('-demo'));
    expect(dirs).toHaveLength(1);
    const dir = join(devDir, dirs[0]);
    expect(readdirSync(dir).sort()).toEqual(['design.md', 'plan.md', 'requirements.md', 'test-plan.md'].sort());
    expect(readFileSync(join(dir, 'requirements.md'), 'utf-8')).toContain('status: draft');
  });

  it('fix profile: 2 файла (requirements.md, plan.md)', () => {
    const r = runCli(['scaffold', 'artifact', 'demo-fix', '--fix'], cwd);
    expect(r.status).toBe(0);

    const devDir = join(cwd, 'docs', 'dev');
    const dir = readdirSync(devDir).find((d) => d.endsWith('-demo-fix'));
    expect(dir).toBeDefined();
    expect(readdirSync(join(devDir, dir!)).sort()).toEqual(['plan.md', 'requirements.md']);
  });

  it('повторный slug — exit ≠ 0, already exists, файлов по-прежнему 4', () => {
    const r = runCli(['scaffold', 'artifact', 'demo'], cwd);
    expect(r.status).not.toBe(0);
    expect(r.stderr + r.stdout).toContain('already exists');

    const devDir = join(cwd, 'docs', 'dev');
    const dir = readdirSync(devDir).find((d) => d.endsWith('-demo'));
    expect(readdirSync(join(devDir, dir!))).toHaveLength(4);
  });

  it('плохой slug — exit ≠ 0, сообщение про слаг', () => {
    const r = runCli(['scaffold', 'artifact', 'Bad_Slug'], cwd);
    expect(r.status).not.toBe(0);
    expect(r.stderr + r.stdout).toContain('Invalid slug');
  });
});
