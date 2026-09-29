import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { rmSync, readFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject, cliPath, writeLegacyInjection } from './helpers.js';

// Волна 0 (0.2): session-ключ CLI-канала — per-invocation продюсер WOLF_SESSION
// (runCli → ensureCliSessionId). Свойство-доказательство механизма (DoD ≥100
// вызовов / ≥90% уникальных — окно 100+ на soak): N=10 последовательных
// CLI-вызовов без WOLF_SESSION → уникальные сессии ≥90%, все delivery/mcp_call
// сигналы CLI-канала с session_id !== null. Прочие writers не задеты.

interface Signal {
  event: string;
  session_id: string | null;
  orchestration: { actor: string };
  detail: Record<string, unknown>;
}

/** Спавн CLI БЕЗ WOLF_SESSION (env копируется, ключ удаляется — даже если
 * тестовый харнес выставил его, продюсер обязан сгенерировать свежий id). */
function runCliNoSession(args: string[], cwd: string): { stdout: string; stderr: string; status: number | null } {
  const env = { ...process.env };
  delete env.WOLF_SESSION;
  const result = spawnSync('node', [cliPath, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 30_000,
    env,
  });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status };
}

function readSignals(dir: string): Signal[] {
  const path = join(dir, '.wolf', 'metrics', 'session-metrics.jsonl');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as Signal);
}

describe('session-key CLI-канала (волна 0 0.2)', () => {
  const dirs: string[] = [];

  beforeAll(() => {
    ensureBuilt();
  });

  afterEach(() => {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  /** tmp-проект с .wolf и одним активным call-injection (delivery пишутся). */
  function seedProject(): string {
    const dir = tmpProject();
    dirs.push(dir);
    runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir);
    // call-injection сеётся легаси-md файлом в shared/calls/ (2.13: тип удалён
    // из store.save, старый frontmatter читается как note+alias_origin —
    // прецедент: call.e2e.ts / writeLegacyInjection в helpers.ts)
    writeLegacyInjection(dir, {
      id: 'mem_inj_session_e2e',
      title: 'Session key fixture',
      body: 'Fixture body for session-key e2e.',
      trigger_keywords: ['get', 'session'],
      created_by: 'user:e2e',
    });
    return dir;
  }

  it('t1 CLI-продюсер: 10 вызовов call без WOLF_SESSION → delivery/mcp_call non-null, ≥90% уникальных сессий', () => {
    const dir = seedProject();

    for (let i = 0; i < 10; i++) {
      const run = runCliNoSession(['call', '--for', 'get'], dir);
      expect(run.status).toBe(0);
      expect(run.stdout).toContain('mem_inj_session_e2e');
    }

    const signals = readSignals(dir);
    // delivery-сигналы: все с session_id !== null (продюсер работает)
    const deliveries = signals.filter((s) => s.event === 'delivery');
    expect(deliveries.length).toBe(10); // 1 доставленный объект × 10 вызовов
    for (const d of deliveries) expect(d.session_id).not.toBeNull();
    // механизм-доказательство: ≥90% уникальных (per-invocation дискриминативность)
    const uniqueSessions = new Set(deliveries.map((d) => d.session_id));
    expect(uniqueSessions.size / deliveries.length).toBeGreaterThanOrEqual(0.9);
    // все mcp_call-сигналы от CLI тоже с session_id !== null
    const mcpCalls = signals.filter((s) => s.event === 'mcp_call');
    expect(mcpCalls.length).toBeGreaterThan(0);
    for (const m of mcpCalls) expect(m.session_id).not.toBeNull();
  });

  it('t2 без env: mcp_call CLI-канала non-null, writers без продюсера (complaint) остаются null', () => {
    const dir = seedProject();

    const list = runCliNoSession(['list'], dir);
    expect(list.status).toBe(0);
    const complain = runCliNoSession(
      [
        'complain',
        '--about',
        'steward',
        '--rule',
        'rule text',
        '--evidence',
        'evidence text',
        '--proposal',
        'proposal text',
      ],
      dir
    );
    expect(complain.status).toBe(0);

    const signals = readSignals(dir);
    // CLI-канал: mcp_call actor=user:cli с session_id !== null (продюсер работает)
    const cliCalls = signals.filter((s) => s.event === 'mcp_call' && s.orchestration.actor === 'user:cli');
    expect(cliCalls.length).toBeGreaterThan(0);
    for (const c of cliCalls) expect(c.session_id).not.toBeNull();
    // контракт: события без продюсера не задеты — complaint всегда session_id null
    const complaints = signals.filter((s) => s.event === 'complaint');
    expect(complaints.length).toBe(1);
    for (const c of complaints) expect(c.session_id).toBeNull();
  });

  // P204 (волна 2.13): плагин wolf-session-start больше не перезаписывает
  // WOLF_SESSION на каждый спавн — ключ наследуется, сессионная дедупликация
  // доставок работает между спавнами одной логической сессии. Здесь ключ
  // выставлен в env процесса-родителя (как его ставит плагин) и НЕ передаётся
  // в spawn явно: оба CLI-вызова обязаны унаследовать его как есть.
  it('t3 P204: унаследованный WOLF_SESSION не перезаписывается — дедуп между спавнами', () => {
    const dir = seedProject();
    const key = 'opc-e2e-inherited-p204';
    process.env.WOLF_SESSION = key;
    try {
      for (let i = 0; i < 2; i++) {
        const run = runCli(['call', '--for', 'get'], dir); // env наследуется из process
        expect(run.status).toBe(0);
      }
      const deliveries = readSignals(dir).filter((s) => s.event === 'delivery');
      // первый спавн доставил, второй — дедуплицировал (1 delivery-сигнал, тот же ключ)
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]!.session_id).toBe(key);
    } finally {
      delete process.env.WOLF_SESSION;
    }
  });
});
