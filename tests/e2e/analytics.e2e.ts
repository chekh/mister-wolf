import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

// Волна 2.13 (диета C2/C5): `run` и `memory-stage` удалены — run-метрики сеются
// в сигнальный лог напрямую (лог append-only, формат — SignalEventSchema),
// аналитика читает исторические записи как есть.

/** Посев строки сигнального лога (замена удалённых CLI-writer'ов). */
function appendSignalLine(dir: string, event: Record<string, unknown>): void {
  mkdirSync(join(dir, '.wolf', 'metrics'), { recursive: true });
  appendFileSync(join(dir, '.wolf', 'metrics', 'session-metrics.jsonl'), JSON.stringify(event) + '\n');
}

describe('analytics + dashboard golden scenarios (spec 2026-09-03)', () => {
  const dirs: string[] = [];

  beforeAll(() => {
    ensureBuilt();
  });

  afterEach(() => {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('run-signal from log -> snapshot -> delta; analytics views (acceptance 1,2,4,5,6)', () => {
    const dir = tmpProject();
    dirs.push(dir);
    expect(runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir).status).toBe(0);

    // --- сценарий 1: run-запись с экспериментальными полями (критерий 1).
    // weighted = input + 0.1×cache_read + 5×output = 100 + 5 + 100 = 205
    appendSignalLine(dir, {
      ts: new Date().toISOString(),
      event: 'run',
      schema_version: 2,
      session_id: 's-e2e',
      gen_ai: { modelID: 'stub-model', agent: 'dev' },
      orchestration: { task: 'e2e', actor: 'user:e2e' },
      weighted: 205,
      outcome: 'ok',
      duration_ms: 1500,
      tokens: { input: 100, output: 20, cache_read: 50 },
      experiment: { id: 'exp1', arm: 'wolf', task_id: 't-1' },
    });

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

    // P110: панель наблюдаемости доставки
    const deliveryView = runCli(['analytics', '--view', 'delivery', '--json'], dir);
    expect(deliveryView.status).toBe(0);
    const deliveryPayload = JSON.parse(deliveryView.stdout) as {
      view: string;
      delivery: { topDelivered: unknown[] };
    };
    expect(deliveryPayload.view).toBe('delivery');
    expect(Array.isArray(deliveryPayload.delivery.topDelivered)).toBe(true);
  });

  it('campaign end-to-end: seeded run/memory_stage signals + task-eval → views campaign/memory (P3 D1–D4)', () => {
    const dir = tmpProject();
    dirs.push(dir);
    expect(runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir).status).toBe(0);

    // ран с campaign_id (стаб-сессия s-e2e)
    appendSignalLine(dir, {
      ts: new Date().toISOString(),
      event: 'run',
      schema_version: 2,
      session_id: 's-e2e',
      gen_ai: { modelID: 'stub-model', agent: 'dev' },
      orchestration: { task: 'camp', actor: 'user:e2e' },
      weighted: 205,
      outcome: 'ok',
      campaign_id: 'c-e2e',
    });

    // injected-сигнал в сессии рана → когорта with_memory + ROI-строка m-roi
    appendSignalLine(dir, {
      ts: new Date().toISOString(),
      event: 'memory_stage',
      session_id: 's-e2e',
      gen_ai: { modelID: null, agent: null },
      orchestration: { task: null, actor: 'user:e2e' },
      outcome: 'ok',
      detail: { stage: 'injected', memory_ids: ['m-roi'] },
    });

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
