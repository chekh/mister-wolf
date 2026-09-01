import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, appendFileSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

// Ф24 (D3.3): GEPA продукт-минимум e2e — `wolf learn evolve` по умолчанию
// dry-run (ничего не пишет), --write пишет только кандидат-файл (активация —
// гейт человека, N24-07 v1.1+); пул <20 примеров — отказ (M24-02).

function toolErrorLine(offsetMs: number, tool: string): string {
  return (
    JSON.stringify({
      ts: new Date(Date.now() + offsetMs).toISOString(),
      event: 'tool_error',
      session_id: null,
      gen_ai: { modelID: null, agent: null },
      orchestration: { task: null, actor: 'user:cli' },
      outcome: 'error',
      tool_name: tool,
      error_class_id: 'timeout',
      detail: { message: 'boom' },
    }) + '\n'
  );
}

describe('wolf learn evolve (Ф24 GEPA dry-run, e2e)', () => {
  let cwd: string;
  let metrics: string;
  let templatePath: string;
  let candidatePath: string;
  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
    expect(runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], cwd).status).toBe(0);
    metrics = join(cwd, '.wolf/metrics/session-metrics.jsonl');
    mkdirSync(join(cwd, '.wolf/metrics'), { recursive: true });
    mkdirSync(join(cwd, '.wolf/templates'), { recursive: true });
    templatePath = join(cwd, '.wolf/templates/brief.md');
    candidatePath = join(cwd, '.wolf/templates/brief.candidate.md');
    writeFileSync(templatePath, 'Шаблон брифа v1. Секция контекста и критерии приёмки.');
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it('(а) пул <20 примеров — отказ с числом спеки (M24-02)', () => {
    for (let i = 1; i <= 5; i++) appendFileSync(metrics, toolErrorLine(i * 1000, 'bash'));
    const evolve = runCli(['learn', 'evolve', 'brief'], cwd);
    expect(evolve.status).not.toBe(0);
    expect(evolve.stderr).toContain('20');
  });

  it('(б) dry-run по умолчанию: метрика и вердикт напечатаны, ничего не записано', () => {
    for (let i = 6; i <= 25; i++) appendFileSync(metrics, toolErrorLine(i * 1000, i % 2 === 0 ? 'bash' : 'grep'));
    const evolve = runCli(['learn', 'evolve', 'brief'], cwd);
    expect(evolve.status).toBe(0);
    expect(evolve.stdout).toContain('пул 25 примеров');
    expect(evolve.stdout).toContain('метрика:');
    expect(evolve.stdout).toContain('verdict:');
    expect(evolve.stdout).toContain('dry-run: ничего не записано');
    expect(existsSync(candidatePath)).toBe(false);
    expect(readFileSync(templatePath, 'utf-8')).toBe('Шаблон брифа v1. Секция контекста и критерии приёмки.');
  });

  it('(в) --write: только кандидат-файл, текущий шаблон не тронут', () => {
    const evolve = runCli(['learn', 'evolve', 'brief', '--write'], cwd);
    expect(evolve.status).toBe(0);
    expect(evolve.stdout).toContain('кандидат записан');
    expect(existsSync(candidatePath)).toBe(true);
    const candidate = readFileSync(candidatePath, 'utf-8');
    expect(candidate).toContain('Шаблон брифа v1');
    expect(candidate).toContain('avoid: bash');
    expect(readFileSync(templatePath, 'utf-8')).toBe('Шаблон брифа v1. Секция контекста и критерии приёмки.');
  });

  it('(г) нет файла шаблона — отказ с подсказкой', () => {
    const evolve = runCli(['learn', 'evolve', 'nonexistent-template'], cwd);
    expect(evolve.status).not.toBe(0);
    expect(evolve.stderr).toContain('шаблон');
  });
});
