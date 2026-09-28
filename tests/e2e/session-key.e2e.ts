import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject, repoRoot, cliPath } from './helpers.js';

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
    // call-injection сеётся скрипт-фикстурой напрямую в dist-store
    // (прецедент: call.e2e.ts — generic `add --set` не выражает string[] trigger_keywords).
    const script = `
import { MarkdownMemoryStore } from '${join(repoRoot, 'dist/adapters/fs/markdown-memory-store.js')}';
const store = new MarkdownMemoryStore(process.cwd());
const now = new Date().toISOString();
await store.save({
  id: 'mem_inj_session_e2e', type: 'call-injection', title: 'Session key fixture',
  status: 'active', review_state: 'accepted', confidence: 'high', importance: 0.8,
  created_at: now, updated_at: now, created_by: 'user:e2e', schema_version: 1,
  source: { kind: 'manual' }, related: { files: [], docs: [], decisions: [] }, tags: [],
  superseded_by: null, body: 'Fixture body for session-key e2e.',
  trigger_keywords: ['get', 'session'], related_objects: [],
});
console.log('seeded');
`;
    writeFileSync(join(dir, 'seed-injection.mjs'), script);
    const seedRun = spawnSync('node', ['seed-injection.mjs'], { cwd: dir, encoding: 'utf-8' });
    expect(seedRun.stdout).toContain('seeded');
    rmSync(join(dir, 'seed-injection.mjs'), { force: true });
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
});
