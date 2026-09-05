import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

describe('analytics + dashboard golden scenarios (spec 2026-09-03)', () => {
  const dirs: string[] = [];

  beforeAll(() => {
    ensureBuilt();
  });

  afterEach(() => {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  /** PATH-stub opencode: одна NDJSON-строка — sessionID + step-finish с токенами (M1). */
  function installOpencodeStub(dir: string): void {
    mkdirSync(join(dir, 'bin'), { recursive: true });
    writeFileSync(
      join(dir, 'bin', 'opencode'),
      '#!/bin/sh\nprintf \'%s\\n\' \'{"sessionID":"s-e2e","part":{"type":"step-finish","tokens":{"input":100,"output":20,"cache":{"read":50}}}}\'\n'
    );
    chmodSync(join(dir, 'bin', 'opencode'), 0o755);
  }

  it('run flags -> run-signal; snapshot -> delta; analytics views (acceptance 1,2,4,5,6)', () => {
    const dir = tmpProject();
    dirs.push(dir);
    expect(runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir).status).toBe(0);

    // --- сценарий 1: прогон с экспериментальными флагами (критерий 1).
    // routing-объекта в свежем проекте нет -> memory-run напечатает warning в stderr
    // и уйдёт на fallback-модель — это ок, статус 0.
    installOpencodeStub(dir);
    const run = runCli(
      [
        'run',
        '--agent',
        'dev',
        '--title',
        'e2e',
        '--experiment',
        'exp1',
        '--arm',
        'wolf',
        '--task-id',
        't-1',
        '--',
        'hi',
      ],
      dir,
      { PATH: `${join(dir, 'bin')}:${process.env.PATH ?? ''}` }
    );
    expect(run.status).toBe(0);

    // P1 D3: .wolf/run-log.jsonl больше не пишется — канонический источник run-метрик
    // это сигнальный лог (assert ниже); legacy-мерж покрыт юнит-тестами через fixtures.
    const signals = readFileSync(join(dir, '.wolf', 'metrics', 'session-metrics.jsonl'), 'utf-8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    const runSignal = signals.find((e) => e.event === 'run');
    expect(runSignal).toBeDefined();
    expect(runSignal?.session_id).toBe('s-e2e');
    expect(typeof runSignal?.duration_ms).toBe('number');
    expect((runSignal?.tokens as { input: number }).input).toBe(100);
    expect((runSignal?.experiment as { id: string }).id).toBe('exp1');
    expect((runSignal?.experiment as { arm: string }).arm).toBe('wolf');
    expect((runSignal?.experiment as { task_id: string }).task_id).toBe('t-1');

    // --- сценарий 2: снапшот + дельта (критерий 2), тот же dir
    const snap = runCli(['effectiveness', '--snapshot'], dir);
    expect(snap.status).toBe(0);
    expect(snap.stdout).toContain('snapshot appended');

    const added = runCli(
      ['add', '--type', 'decision', '--title', 'post-snapshot decision', '--body', 'changes noise'],
      dir
    );
    expect(added.status).toBe(0);

    const eff = runCli(['effectiveness'], dir);
    expect(eff.status).toBe(0);
    expect(eff.stdout).toContain('delta vs');

    // --- сценарий 3: analytics-представления (критерии 4-6), тот же dir
    for (let i = 1; i <= 3; i++) {
      const c = runCli(
        ['complain', '--about', 'skill:x', '--rule', 'r', '--proposal', 'p', '--text', `жалоба ${i}`],
        dir
      );
      expect(c.status).toBe(0);
    }

    const memory = runCli(['analytics', '--view', 'memory', '--json'], dir);
    expect(memory.status).toBe(0);
    const memoryPayload = JSON.parse(memory.stdout) as { view: string; rows: Array<Record<string, unknown>> };
    expect(memoryPayload.view).toBe('memory');
    expect(Array.isArray(memoryPayload.rows)).toBe(true);
    const row = memoryPayload.rows[0];
    expect(row).toHaveProperty('lifecycle');
    expect(row).toHaveProperty('age_days');
    expect(row).toHaveProperty('deliveries');

    const silentRules = runCli(['analytics', '--view', 'rules', '--silent', '--json'], dir);
    expect(silentRules.status).toBe(0);

    const tools = runCli(['analytics', '--view', 'tools', '--json'], dir);
    expect(tools.status).toBe(0);
    const toolsPayload = JSON.parse(tools.stdout) as { rows: unknown[] };
    expect(Array.isArray(toolsPayload.rows)).toBe(true); // может быть пуст — ок

    const readiness = runCli(['analytics', '--view', 'readiness', '--json'], dir);
    expect(readiness.status).toBe(0);
    const readinessPayload = JSON.parse(readiness.stdout) as {
      readiness: { totalRuns: number; withArm: number };
    };
    expect(readinessPayload.readiness.totalRuns).toBeGreaterThanOrEqual(1);
    expect(readinessPayload.readiness.withArm).toBe(1);

    const steward = runCli(['analytics', '--view', 'steward', '--json'], dir);
    expect(steward.status).toBe(0);
    const stewardPayload = JSON.parse(steward.stdout) as {
      steward: { complaintFunnel: { filed: number } };
    };
    expect(stewardPayload.steward.complaintFunnel.filed).toBeGreaterThanOrEqual(3);

    const councils = runCli(['analytics', '--view', 'councils', '--json'], dir);
    expect(councils.status).toBe(0);
    const councilsPayload = JSON.parse(councils.stdout) as {
      view: string;
      councils: { questions: { total: number } };
    };
    expect(councilsPayload.view).toBe('councils');
    expect(typeof councilsPayload.councils.questions.total).toBe('number');
  });

  it('campaign end-to-end: run --campaign + memory-stage injected + task-eval → views campaign/memory (P3 D1–D4)', () => {
    const dir = tmpProject();
    dirs.push(dir);
    expect(runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir).status).toBe(0);

    // ран с campaign_id (стаб-сессия s-e2e); routing-warning в stderr — ок, статус 0
    installOpencodeStub(dir);
    const run = runCli(['run', '--agent', 'dev', '--title', 'camp', '--campaign', 'c-e2e', '--', 'hi'], dir, {
      PATH: `${join(dir, 'bin')}:${process.env.PATH ?? ''}`,
    });
    expect(run.status).toBe(0);

    // injected-сигнал в сессии рана → когорта with_memory + ROI-строка m-roi
    const stage = runCli(['memory-stage', '--stage', 'injected', '--ids', 'm-roi', '--session', 's-e2e'], dir);
    expect(stage.status).toBe(0);

    const verdict = runCli(['task-eval', '--verdict', 'accepted', '--session', 's-e2e', '--campaign', 'c-e2e'], dir);
    expect(verdict.status).toBe(0);

    const campaign = runCli(['analytics', '--view', 'campaign', '--json'], dir);
    expect(campaign.status).toBe(0);
    const campaignPayload = JSON.parse(campaign.stdout) as {
      view: string;
      campaign: {
        rows: Array<{
          campaign: string;
          hasVerdicts: boolean;
          withMemory: { n: number };
          noMemory: { n: number };
        }>;
      };
    };
    expect(campaignPayload.view).toBe('campaign');
    const row = campaignPayload.campaign.rows.find((r) => r.campaign === 'c-e2e');
    expect(row).toBeDefined();
    expect(row?.withMemory.n).toBe(1);
    expect(row?.noMemory.n).toBe(0);
    expect(row?.hasVerdicts).toBe(true);

    const memory = runCli(['analytics', '--view', 'memory', '--json'], dir);
    expect(memory.status).toBe(0);
    const memoryPayload = JSON.parse(memory.stdout) as {
      roi: { rows: Array<{ id: string; associatedAccepted: number }> };
    };
    const roiRow = memoryPayload.roi.rows.find((r) => r.id === 'm-roi');
    expect(roiRow).toBeDefined();
    expect(roiRow?.associatedAccepted).toBe(1);
  });

  it('dashboard renders three sections, --tab selects one, no files written (acceptance 7)', () => {
    const dir = tmpProject();
    dirs.push(dir);
    expect(runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir).status).toBe(0);

    const asJson = runCli(['dashboard', '--json'], dir);
    expect(asJson.status).toBe(0);
    const data = JSON.parse(asJson.stdout) as Record<string, unknown>;
    expect(data).toHaveProperty('effectiveness');
    expect(data).toHaveProperty('analytics');
    expect(data).toHaveProperty('snapshot');

    const tab = runCli(['dashboard', '--tab', 'trends'], dir);
    expect(tab.status).toBe(0);
    expect(tab.stdout).toContain('trends');

    const full = runCli(['dashboard'], dir);
    expect(full.status).toBe(0);
    expect(full.stdout).toContain('health');
    expect(full.stdout).toContain('ledgers');
    expect(full.stdout).toContain('trends');

    // D8: дашборд ничего не пишет на диск (HTML-витрина отложена)
    expect(existsSync(join(dir, 'dashboard.html'))).toBe(false);
  });
});
