import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, appendFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

// Ф26 (D3.2): decay по ПРОБЕГУ (сессии, не календарь) — e2e на фикстуре пробега.
// TTL [ВА] §16: lesson 90 сессий без срабатывания → review_required (статус
// остаётся active); реактивация при новой доставке; drift-индикаторы в status.

function runLine(sessionId: string, offsetMs: number): string {
  return (
    JSON.stringify({
      ts: new Date(Date.now() + offsetMs).toISOString(),
      event: 'run',
      session_id: sessionId,
      gen_ai: { modelID: 'test-model', agent: 'executor' },
      orchestration: { task: 'задача', actor: 'user:cli' },
      weighted: 1000,
      outcome: 'ok',
    }) + '\n'
  );
}

function deliveryLine(objectId: string, offsetMs: number): string {
  return (
    JSON.stringify({
      ts: new Date(Date.now() + offsetMs).toISOString(),
      event: 'delivery',
      session_id: null,
      gen_ai: { modelID: null, agent: null },
      orchestration: { task: null, actor: 'user:cli' },
      outcome: 'delivered',
      detail: { name: objectId, mechanism: 'call' },
    }) + '\n'
  );
}

function toolErrorLine(offsetMs: number, errorClass: string): string {
  return (
    JSON.stringify({
      ts: new Date(Date.now() + offsetMs).toISOString(),
      event: 'tool_error',
      session_id: null,
      gen_ai: { modelID: null, agent: null },
      orchestration: { task: null, actor: 'user:cli' },
      outcome: 'error',
      tool_name: 'bash',
      error_class_id: errorClass,
      detail: { message: 'boom' },
    }) + '\n'
  );
}

describe('wolf learn decay (Ф26, e2e на фикстуре пробега)', () => {
  let cwd: string;
  let lessonId: string;
  let metrics: string;
  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
    expect(runCli(['init'], cwd).status).toBe(0);
    metrics = join(cwd, '.wolf/metrics/session-metrics.jsonl');
    mkdirSync(join(cwd, '.wolf/metrics'), { recursive: true });
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it('(а) создание урока: пробег 91 сессия без срабатывания → review_required', () => {
    const add = runCli(
      [
        'add',
        '--type',
        'lesson',
        '--title',
        'Урок про bash',
        '--body',
        'Делай так и только так',
        '--set',
        'trigger_keywords=["bash"]',
      ],
      cwd
    );
    expect(add.status).toBe(0);
    lessonId = add.stdout.replace('Created memory object: ', '').trim();

    // 91 run-событие с уникальными session_id, ts строго после created_at урока
    for (let i = 1; i <= 91; i++) appendFileSync(metrics, runLine(`s-${i}`, i * 60_000));
    // drift-факт для status: error_class вне таксономии
    appendFileSync(metrics, toolErrorLine(91 * 60_000 + 1000, 'alien_drift_class'));

    const decay = runCli(['learn', 'decay'], cwd);
    expect(decay.status).toBe(0);
    expect(decay.stdout).toContain('ttl_marked=1');
    expect(decay.stdout).toContain(lessonId);
    expect(decay.stdout).toContain('причина: ttl');

    // жизненный цикл: review_required — НЕ удаление, статус остаётся active
    const get = runCli(['get', lessonId], cwd);
    expect(get.status).toBe(0);
    expect(get.stdout).toContain('review_required');
    expect(get.stdout).toContain('"status": "active"');

    // очередь видна в digest (пост-аудит §6)
    const digest = runCli(['learn', 'digest'], cwd);
    expect(digest.status).toBe(0);
    expect(digest.stdout).toContain('decay queue (review_required):');
    expect(digest.stdout).toContain(lessonId);
  });

  it('(б) реактивация: новая доставка (wolf call) возвращает знание в строй', () => {
    // срабатывание call-injection = delivery_event (Ф26: доставка = срабатывание)
    appendFileSync(metrics, deliveryLine(lessonId, 92 * 60_000));

    const decay = runCli(['learn', 'decay'], cwd);
    expect(decay.status).toBe(0);
    expect(decay.stdout).toContain('reactivated=1');
    expect(decay.stdout).toContain('очередь пересмотра: пусто');

    const get = runCli(['get', lessonId], cwd);
    expect(get.stdout).toContain('accepted');
  });

  it('(в) drift-индикаторы в learn status', () => {
    const status = runCli(['learn', 'status'], cwd);
    expect(status.status).toBe(0);
    expect(status.stdout).toContain('decay:');
    expect(status.stdout).toContain('decayShare=');
    expect(status.stdout).toContain('drift:');
    expect(status.stdout).toContain('alien_drift_class');
  });

  it('(г) wolf call пишет delivery-события на доставленные объекты (замыкание контура)', () => {
    const call = runCli(['call', '--for', 'bash'], cwd);
    expect(call.status).toBe(0);
    expect(call.stdout).toContain(lessonId);
    const raw = readFileSync(metrics, 'utf-8');
    expect(raw).toContain('"event":"delivery"');
    expect(raw).toContain(`"name":"${lessonId}"`);
  });
});
