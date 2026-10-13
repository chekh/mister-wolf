import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

// 2.15 A1 + 2.17.1 REQ-05 AC-3: scaffold требует активный claim артефакта
// dev:<UTC-date>-<slug>. FIX-1 (CRITICAL-1): CLI-acquire держит claim как
// агент-сессия (pid 0 — владение до TTL/передачи), поэтому acquire и scaffold —
// два РАЗНЫХ CLI-процесса с одним WOLF_ACTOR/WOLF_SESSION (без общей сессии
// каждый процесс получил бы свой cli-<uuid>).

describe('wolf scaffold artifact (2.15 A1; 2.17.1 REQ-05 AC-3)', () => {
  let cwd: string;

  const CLAIM_ENV = { WOLF_ACTOR: 'agent:e2e', WOLF_SESSION: 'ses-e2e' };

  /** artifact-id из отказа guard'а: дату не вычисляем руками (UTC/полночь),
   * берём ровно тот id, который scaffold собирался писать. */
  function probeArtifactId(slug: string): string {
    const r = runCli(['scaffold', 'artifact', slug], cwd, CLAIM_ENV);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('No claim held');
    const id = r.stderr.match(/"([^"]+)"/)?.[1];
    expect(id, `artifact-id в отказе guard'а: ${r.stderr}`).toMatch(/^dev:\d{4}-\d{2}-\d{2}-/);
    return id!;
  }

  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
  });

  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it('без claim — exit ≠ 0, «No claim held» и подсказка acquire (AC-3)', () => {
    const r = runCli(['scaffold', 'artifact', 'demo'], cwd, CLAIM_ENV);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('No claim held');
    expect(r.stderr).toContain('claim acquire'); // подсказка, как захватить
    expect(readdirSync(cwd)).toEqual(['package.json']); // записей нет
  });

  it('acquire → scaffold (другой CLI-процесс, та же сессия) — exit=0, 4 файла', () => {
    const artifact = probeArtifactId('demo');
    const acq = runCli(['claim', 'acquire', artifact], cwd, CLAIM_ENV);
    expect(acq.status, `claim acquire ${artifact}: ${acq.stderr}`).toBe(0);

    const r = runCli(['scaffold', 'artifact', 'demo'], cwd, CLAIM_ENV);
    expect(r.status, `scaffold после acquire: ${r.stderr}`).toBe(0);

    const devDir = join(cwd, 'docs', 'dev');
    const dirs = readdirSync(devDir).filter((d) => d.endsWith('-demo'));
    expect(dirs).toHaveLength(1);
    const dir = join(devDir, dirs[0]!);
    expect(readdirSync(dir).sort()).toEqual(['design.md', 'plan.md', 'requirements.md', 'test-plan.md'].sort());
    expect(readFileSync(join(dir, 'requirements.md'), 'utf-8')).toContain('status: draft');
  });

  it('повторный scaffold того же slug — exit ≠ 0, «already exists» (claim той же сессии жив)', () => {
    // claim из предыдущего сценария: pid 0 → не stale, отдельный re-acquire не нужен
    const r = runCli(['scaffold', 'artifact', 'demo'], cwd, CLAIM_ENV);
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
