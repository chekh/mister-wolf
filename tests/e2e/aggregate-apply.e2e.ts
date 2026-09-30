import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { rmSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

// 2.14 §11.3: e2e сценарий aggregate apply. «Роль Стюарда» (3 active урока →
// proposed-агрегат + рёбра aggregates) исполняет оператор теста через CLI.
describe('aggregate apply via CLI', () => {
  const dirs: string[] = [];

  beforeAll(() => {
    ensureBuilt();
  });

  afterEach(() => {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function newProject(): string {
    const dir = tmpProject();
    dirs.push(dir);
    runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir);
    return dir;
  }

  function addLesson(dir: string, title: string): string {
    const r = runCli(
      [
        'add',
        '--type',
        'lesson',
        '--title',
        title,
        '--body',
        'b',
        '--tags',
        'deploy',
        '--set',
        'trigger_keywords=[deploy]',
      ],
      dir
    );
    expect(r.status).toBe(0);
    return r.stdout.match(/Created memory object: (\S+)/)?.[1]!;
  }

  function addProposedAggregate(dir: string, srcIds: string[]): string {
    const r = runCli(
      [
        'add',
        '--type',
        'lesson',
        '--title',
        'Aggregated deploy lessons',
        '--body',
        '## Было → стало → почему',
        '--tags',
        'deploy',
        '--set',
        'status=proposed',
        '--set',
        'trigger_keywords=[deploy]',
        '--created-by',
        'agent:steward',
      ],
      dir
    );
    expect(r.status).toBe(0);
    const aggId = r.stdout.match(/Created memory object: (\S+)/)?.[1]!;
    for (const src of srcIds) {
      const rel = runCli(['relation', 'add', aggId, 'aggregates', src], dir);
      expect(rel.status).toBe(0);
    }
    return aggId;
  }

  /** Рекурсивный поиск файла объекта `<id>.md` под .wolf/memory. */
  function memoryFile(dir: string, id: string): string {
    const root = join(dir, '.wolf', 'memory');
    const hit = readdirSync(root, { recursive: true })
      .map((p) => join(root, String(p)))
      .find((p) => p.endsWith(`${id}.md`) && existsSync(p));
    if (!hit) throw new Error(`memory file not found for ${id}`);
    return hit;
  }

  function readEvents(dir: string) {
    return readFileSync(join(dir, '.wolf/memory/events.jsonl'), 'utf-8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
  }

  it('steward proposes → recap lines → apply (activate + archive + event + no-op on repeat)', () => {
    const dir = newProject();
    const srcIds = [addLesson(dir, 'Deploy pain 1'), addLesson(dir, 'Deploy pain 2'), addLesson(dir, 'Deploy pain 3')];

    const recap1 = runCli(['recap'], dir);
    expect(recap1.stdout).toContain('неагрегированных уроков: 3 (зрелых: 3)');

    const aggId = addProposedAggregate(dir, srcIds);

    const recap2 = runCli(['recap'], dir);
    expect(recap2.stdout).toContain('предложенных агрегатов: 1');
    expect(recap2.stdout).not.toContain('неагрегированных');

    const apply = runCli(['aggregate', 'apply', aggId], dir);
    expect(apply.status).toBe(0);

    expect(runCli(['get', aggId], dir).stdout).toContain('"status": "active"');
    expect(runCli(['get', srcIds[0]], dir).stdout).toContain('"status": "archived"');

    const events = readEvents(dir).filter((e) => e.type === 'memory.aggregated');
    expect(events).toHaveLength(1);
    expect(events[0].payload.aggregate_id).toBe(aggId);
    expect(events[0].payload.source_ids).toEqual(srcIds);

    const repeat = runCli(['aggregate', 'apply', aggId], dir);
    expect(repeat.status).toBe(0);
    expect(repeat.stdout).toContain('no-op');
  });

  it('partial failure dose-completion: resurrected sources are re-archived, done ones skipped', () => {
    const dir = newProject();
    const srcIds = [addLesson(dir, 'Deploy pain 1'), addLesson(dir, 'Deploy pain 2'), addLesson(dir, 'Deploy pain 3')];
    const aggId = addProposedAggregate(dir, srcIds);
    expect(runCli(['aggregate', 'apply', aggId], dir).status).toBe(0);

    // симуляция обрыва apply посередине: 2 из 3 исходников вновь active
    for (const src of [srcIds[0], srcIds[2]]) {
      const path = memoryFile(dir, src);
      writeFileSync(path, readFileSync(path, 'utf-8').replace('status: archived', 'status: active'));
    }

    const apply = runCli(['aggregate', 'apply', aggId], dir);
    expect(apply.status).toBe(0);
    expect(apply.stdout).toContain('archived: 2 (skipped: 1)');

    for (const src of srcIds) {
      expect(runCli(['get', src], dir).stdout).toContain('"status": "archived"');
    }
    expect(runCli(['get', aggId], dir).stdout).toContain('"status": "active"');
  });

  it('delivery after apply (P1): sources stop injecting, aggregate takes over', () => {
    const dir = newProject();
    const srcIds = [addLesson(dir, 'Deploy pain 1'), addLesson(dir, 'Deploy pain 2'), addLesson(dir, 'Deploy pain 3')];
    const aggId = addProposedAggregate(dir, srcIds);

    const before = runCli(['call', '--for', 'deploy'], dir);
    // proposed-агрегат не доставляется; хотя бы один исходник ещё активен
    expect(before.stdout).not.toContain(aggId);
    expect(before.stdout).toContain(srcIds[0]);

    expect(runCli(['aggregate', 'apply', aggId], dir).status).toBe(0);

    const after = runCli(['call', '--for', 'deploy'], dir);
    expect(after.stdout).toContain(aggId);
    for (const src of srcIds) {
      expect(after.stdout).not.toContain(src);
    }
  });

  it('refusal: transition rejected keeps sources active and the cluster unaggregated', () => {
    const dir = newProject();
    const srcIds = [addLesson(dir, 'Deploy pain 1'), addLesson(dir, 'Deploy pain 2'), addLesson(dir, 'Deploy pain 3')];
    const aggId = addProposedAggregate(dir, srcIds);

    const refuse = runCli(['transition', aggId, 'rejected'], dir);
    expect(refuse.status).toBe(0);

    for (const src of srcIds) {
      expect(runCli(['get', src], dir).stdout).toContain('"status": "active"');
    }

    const recap = runCli(['recap'], dir);
    expect(recap.stdout).toContain('неагрегированных уроков: 3 (зрелых: 3)');

    const apply = runCli(['aggregate', 'apply', aggId], dir);
    expect(apply.status).not.toBe(0);
  });
});
