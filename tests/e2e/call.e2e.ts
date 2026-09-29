import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync, rmSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject, repoRoot } from './helpers.js';

describe('clean session repairs memory and call injects the fix', () => {
  const dirs: string[] = [];

  beforeAll(() => {
    ensureBuilt();
  });

  afterEach(() => {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function seedWithConflict(): { dir: string; oldId: string; newId: string; threadId: string } {
    const dir = tmpProject();
    dirs.push(dir);
    runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir);
    const threadRun = runCli(
      ['thread', 'create', '--title', 'CLI repair thread', '--goal', 'Repair stale CLI guidance'],
      dir
    );
    const threadId = threadRun.stdout.match(/Created work thread: (\S+)/)?.[1] ?? '';

    const oldRun = runCli(
      [
        'rule',
        'add',
        '--title',
        'Use top-level get',
        '--body',
        'Old guidance: use top-level get.',
        '--scope',
        'project',
      ],
      dir
    );
    const newRun = runCli(
      [
        'rule',
        'add',
        '--title',
        'Use entity-specific get commands',
        '--body',
        'New guidance: use entity-specific get.',
        '--scope',
        'project',
      ],
      dir
    );
    const oldId = oldRun.stdout.match(/Created (?:memory object|rule): (\S+)/)?.[1] ?? '';
    const newId = newRun.stdout.match(/Created (?:memory object|rule): (\S+)/)?.[1] ?? '';
    expect(oldId).not.toBe('');
    expect(newId).not.toBe('');
    return { dir, oldId, newId, threadId };
  }

  it('clean session repairs memory and call injects the fix', () => {
    const { dir, oldId, newId, threadId } = seedWithConflict();

    // Чистая сессия чинит память обычными CLI-командами:
    runCli(
      [
        'article',
        'add',
        '--title',
        'Diagnosis: top-level get is deprecated',
        '--thread',
        threadId,
        '--summary',
        'Top-level get is deprecated',
        '--body',
        'Entity-specific get commands replace top-level get.',
      ],
      dir
    );
    runCli(['supersede', oldId, newId], dir);
    runCli(['relation', 'add', newId, 'supersedes', oldId], dir);

    // Call-injection сеётся скрипт-фикстурой: generic `add --set` не выражает
    // string[] trigger_keywords (V15b), поэтому пишем через dist-store напрямую.
    const script = `
import { MarkdownMemoryStore } from '${join(repoRoot, 'dist/adapters/fs/markdown-memory-store.js')}';
const store = new MarkdownMemoryStore(process.cwd());
const now = new Date().toISOString();
await store.save({
  id: 'mem_inj_get_e2e', type: 'call-injection', title: 'Do not use top-level get',
  status: 'active', review_state: 'accepted', confidence: 'high', importance: 0.8,
  created_at: now, updated_at: now, created_by: 'user:clean-session', schema_version: 1,
  source: { kind: 'manual' }, related: { files: [], docs: [], decisions: [] }, tags: [],
  superseded_by: null, body: 'Do not use top-level get. Use entity-specific commands.',
  trigger_keywords: ['get', 'deprecated'], related_objects: ['${newId}'],
});
console.log('seeded');
`;
    writeFileSync(join(dir, 'seed-injection.mjs'), script);
    const seedRun = spawnSync('node', ['seed-injection.mjs'], { cwd: dir, encoding: 'utf-8' });
    expect(seedRun.stdout).toContain('seeded');

    const call = runCli(['call', '--for', 'get'], dir);
    expect(call.status).toBe(0);
    expect(call.stdout).toContain('Do not use top-level get');
    expect(call.stdout).toContain('source: mem_inj_get_e2e');
    // Старое правило superseded — не звучит как активная инструкция:
    expect(call.stdout).not.toContain('Use top-level get');

    rmSync(join(dir, 'seed-injection.mjs'), { force: true });
  });
});

// --- P108 (волна 2.12 4.C): сессионная дедупликация доставок ---

describe('P108: session delivery dedup (same WOLF_SESSION)', () => {
  const dirs: string[] = [];
  const INJ_ID = 'mem_inj_dedup_e2e';

  beforeAll(() => {
    ensureBuilt();
  });

  afterEach(() => {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function seedDedupProject(): string {
    const dir = tmpProject();
    dirs.push(dir);
    runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir);
    // call-injection сеётся скрипт-фикстурой: generic `add --set` не выражает
    // string[] trigger_keywords (V15b) — паттерн первого кейса этого файла.
    const script = `
import { MarkdownMemoryStore } from '${join(repoRoot, 'dist/adapters/fs/markdown-memory-store.js')}';
const store = new MarkdownMemoryStore(process.cwd());
const now = new Date().toISOString();
await store.save({
  id: '${INJ_ID}', type: 'call-injection', title: 'Dedup probe: do not use top-level get',
  status: 'active', review_state: 'accepted', confidence: 'high', importance: 0.8,
  created_at: now, updated_at: now, created_by: 'user:e2e-dedup', schema_version: 1,
  source: { kind: 'manual' }, related: { files: [], docs: [], decisions: [] }, tags: [],
  superseded_by: null, body: 'Do not use top-level get. Use entity-specific commands.',
  trigger_keywords: ['get'],
});
console.log('seeded');
`;
    writeFileSync(join(dir, 'seed-dedup.mjs'), script);
    const seedRun = spawnSync('node', ['seed-dedup.mjs'], { cwd: dir, encoding: 'utf-8' });
    expect(seedRun.stdout).toContain('seeded');
    rmSync(join(dir, 'seed-dedup.mjs'), { force: true });
    return dir;
  }

  /** delivery-строки metrics-лога с нашим id в конкретной сессии (repeat-streak-факт). */
  function deliveryLines(dir: string, sessionId: string): string[] {
    const log = join(dir, '.wolf', 'metrics', 'session-metrics.jsonl');
    return readFileSync(log, 'utf8')
      .split('\n')
      .filter(
        (l) =>
          l.includes('"event":"delivery"') &&
          l.includes(`"session_id":"${sessionId}"`) &&
          l.includes(`"name":"${INJ_ID}"`)
      );
  }

  it('second call in the same session skips delivered id and explains the emptiness', () => {
    const dir = seedDedupProject();
    const env = { WOLF_SESSION: 'opc-e2e-dedup-1' };

    const first = runCli(['call', '--for', 'get'], dir, env);
    expect(first.status).toBe(0);
    expect(first.stdout).toContain(INJ_ID);
    expect(deliveryLines(dir, 'opc-e2e-dedup-1')).toHaveLength(1);

    const second = runCli(['call', '--for', 'get'], dir, env);
    expect(second.status).toBe(0);
    // блок не доставляется повторно, пустота объясняет себя строкой дедупликации
    expect(second.stdout).not.toContain(`source: ${INJ_ID}`);
    expect(second.stdout).toContain('[wolf] 1 ');
    expect(second.stdout).toContain('\u0434\u0435\u0434\u0443\u043f\u043b\u0438\u043a\u0430\u0446\u0438\u044f'); // "дедупликация"
    // delivery-сигналы не дублируются
    expect(deliveryLines(dir, 'opc-e2e-dedup-1')).toHaveLength(1);
  });

  it('changed record body (new title) is delivered again in the same session', () => {
    const dir = seedDedupProject();
    const env = { WOLF_SESSION: 'opc-e2e-dedup-2' };
    expect(runCli(['call', '--for', 'get'], dir, env).stdout).toContain(INJ_ID);

    // перезапись .md с новым title → checksum блока меняется → повторная доставка
    const md = join(dir, '.wolf', 'memory', 'shared', 'calls', `${INJ_ID}.md`);
    const updated = readFileSync(md, 'utf8').replace(
      'Dedup probe: do not use top-level get',
      'Dedup probe v2: entity-specific get'
    );
    writeFileSync(md, updated);

    const again = runCli(['call', '--for', 'get'], dir, env);
    expect(again.status).toBe(0);
    expect(again.stdout).toContain('Dedup probe v2');
    expect(deliveryLines(dir, 'opc-e2e-dedup-2')).toHaveLength(2);
  });

  it('fresh WOLF_SESSION gets full delivery', () => {
    const dir = seedDedupProject();
    expect(runCli(['call', '--for', 'get'], dir, { WOLF_SESSION: 'opc-e2e-a' }).stdout).toContain(INJ_ID);

    const fresh = runCli(['call', '--for', 'get'], dir, { WOLF_SESSION: 'opc-e2e-b' });
    expect(fresh.status).toBe(0);
    expect(fresh.stdout).toContain(INJ_ID);
    expect(fresh.stdout).not.toContain('[wolf] 1 ');
    expect(deliveryLines(dir, 'opc-e2e-a')).toHaveLength(1);
    expect(deliveryLines(dir, 'opc-e2e-b')).toHaveLength(1);
  });
});

// P109 (спека 4.D): мягкий лимит контекста — fault-injection: реестр с накрученным
// injectedBytes выше порога → одна строка в stderr; вывод и exit code не меняются.
describe('P109: context budget warning (fault-injection)', () => {
  const dirs: string[] = [];
  const INJ_ID = 'mem_inj_budget_e2e';

  beforeAll(() => {
    ensureBuilt();
  });

  afterEach(() => {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function seedBudgetProject(): string {
    const dir = tmpProject();
    dirs.push(dir);
    runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir);
    const script = `
import { MarkdownMemoryStore } from '${join(repoRoot, 'dist/adapters/fs/markdown-memory-store.js')}';
const store = new MarkdownMemoryStore(process.cwd());
const now = new Date().toISOString();
await store.save({
  id: '${INJ_ID}', type: 'call-injection', title: 'Budget probe: do not use top-level get',
  status: 'active', review_state: 'accepted', confidence: 'high', importance: 0.8,
  created_at: now, updated_at: now, created_by: 'user:e2e-budget', schema_version: 1,
  source: { kind: 'manual' }, related: { files: [], docs: [], decisions: [] }, tags: [],
  superseded_by: null, body: 'Do not use top-level get. Use entity-specific commands.',
  trigger_keywords: ['get'],
});
console.log('seeded');
`;
    writeFileSync(join(dir, 'seed-budget.mjs'), script);
    const seedRun = spawnSync('node', ['seed-budget.mjs'], { cwd: dir, encoding: 'utf-8' });
    expect(seedRun.stdout).toContain('seeded');
    rmSync(join(dir, 'seed-budget.mjs'), { force: true });
    return dir;
  }

  it('over-budget registry prints one stderr line; stdout and exit code unchanged', () => {
    const dir = seedBudgetProject();
    const env = { WOLF_SESSION: 'opc-e2e-budget-1' };

    // первый вызов: доставка, порог не пересечён — stderr чист
    const first = runCli(['call', '--for', 'get'], dir, env);
    expect(first.status).toBe(0);
    expect(first.stderr).not.toContain('[wolf]');

    // fault-injection: накручиваем injectedBytes (1M байт ≈ 250k токенов > 20% от 200k)
    const regPath = join(dir, '.wolf', 'cache', 'sessions', 'opc-e2e-budget-1.json');
    const reg = JSON.parse(readFileSync(regPath, 'utf8')) as { injectedBytes: number };
    reg.injectedBytes = 1_000_000;
    writeFileSync(regPath, JSON.stringify(reg));

    // второй вызов в той же сессии: дедупликация фильтрует всё (stdout — строка
    // дедупликации), предупреждение о бюджете — в stderr, exit code прежний
    const second = runCli(['call', '--for', 'get'], dir, env);
    expect(second.status).toBe(0);
    expect(second.stderr).toContain('[wolf]');
    expect(second.stderr).toContain('~125%');
    expect(second.stderr).toContain('1000000 bytes / 200000 tokens');
    expect(second.stdout).toContain('[wolf] 1 '); // дедуп-объяснение на месте
    expect(second.stdout).not.toContain(`source: ${INJ_ID}`); // доставке не помешало фильтру
  });
});
