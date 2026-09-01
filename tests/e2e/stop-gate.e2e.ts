import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

// Ф23 (D3.1): STOP-гейт e2e — pressure-сценарии доставки через реальный CLI
// + read-only zone probe. Критерий спеки §5: сценарий проходит при наличии
// delivery-механизма и падает при его отсутствии (недоставляемое правило).

function toolErrorLine(offsetMs: number): string {
  return (
    JSON.stringify({
      ts: new Date(Date.now() + offsetMs).toISOString(),
      event: 'tool_error',
      session_id: null,
      gen_ai: { modelID: null, agent: null },
      orchestration: { task: null, actor: 'user:cli' },
      outcome: 'error',
      tool_name: 'bash',
      error_class_id: 'timeout',
      detail: { message: 'Command timed out' },
    }) + '\n'
  );
}

function draftIdFrom(stdout: string): string {
  const line = stdout.split('\n').find((l) => l.startsWith('Draft created: '));
  if (!line) throw new Error(`no Draft created line in stdout: ${stdout}`);
  return line.slice('Draft created: '.length).trim();
}

describe('wolf learn gate (Ф23 STOP-гейт, e2e)', () => {
  let cwd: string;
  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
    expect(runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], cwd).status).toBe(0);
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it('зелёный: доставленное правило + FP-проба + все read-only зоны enforced', () => {
    const metrics = join(cwd, '.wolf/metrics/session-metrics.jsonl');
    mkdirSync(join(cwd, '.wolf/metrics'), { recursive: true });
    for (let i = 3; i >= 1; i--) appendFileSync(metrics, toolErrorLine(-i * 60_000));

    const propose = runCli(['learn', 'propose', 'bash:timeout'], cwd);
    expect(propose.status).toBe(0);
    const draftId = draftIdFrom(propose.stdout);

    appendFileSync(metrics, toolErrorLine(0));
    expect(runCli(['learn', 'validate', draftId], cwd).status).toBe(0);
    const activate = runCli(['learn', 'activate', draftId], cwd);
    expect(activate.status).toBe(0);

    const gate = runCli(['learn', 'gate'], cwd);
    expect(gate.status).toBe(0);
    expect(gate.stdout).toContain('STOP-гейт: ЗЕЛЁНЫЙ');
    expect(gate.stdout).toContain(`PASS draft:${draftId}`);
    expect(gate.stdout).toContain('PASS fp-probe');
    expect(gate.stdout).toContain('read-only зоны:');
    expect(gate.stdout).not.toContain('НЕ ЗАЩИЩЕНА');
    expect(gate.stdout).toContain('layer4:');
  });

  it('красный: активное механическое знание с пустыми trigger_keywords не доставляется', () => {
    // правило с constraint_tool, но без ключевых слов: delivery-механизм его
    // не поднимет по теме — сценарий обязан упасть (чувствительность harness'а)
    const add = runCli(
      [
        'add',
        '--type',
        'lesson',
        '--title',
        'Недоставляемое правило',
        '--body',
        'Правило про old-tool, которое никогда не доедет до агента',
        '--set',
        'mechanical=true',
        '--set',
        'constraint_tool=old-tool',
        '--set',
        'trigger_keywords=[]',
      ],
      cwd
    );
    expect(add.status).toBe(0);

    const gate = runCli(['learn', 'gate'], cwd);
    expect(gate.status).not.toBe(0);
    expect(gate.stdout).toContain('STOP-гейт: КРАСНЫЙ');
    expect(gate.stdout).toContain('FAIL');
    expect(gate.stdout).toContain('old-tool');
  });
});
