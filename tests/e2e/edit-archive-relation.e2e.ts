import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

// P220 (спека 2.13 §6.1/§6.4, критерий §10.2): edit пишет memory.edited с
// before/after (обрезка 200), archive ≡ transition, relation list/remove.
describe('edit + archive + relation via CLI (P220)', () => {
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

  function addObject(dir: string, extra: string[] = []): string {
    const r = runCli(['add', '--type', 'lesson', '--title', 'Edit me', '--body', 'original body', ...extra], dir);
    expect(r.status).toBe(0);
    const line = r.stdout.split('\n').find((l) => l.startsWith('Created memory object:'));
    expect(line).toBeDefined();
    return line!.split(': ')[1].trim();
  }

  function readEvents(dir: string): Array<Record<string, unknown>> {
    return readFileSync(join(dir, '.wolf', 'memory', 'events.jsonl'), 'utf-8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  }

  it('edit writes memory.edited events with before/after (200-char clip)', () => {
    const dir = newProject();
    const longBody = 'x'.repeat(300);
    const id = addObject(dir, ['--body', longBody]);

    const edited = runCli(['edit', id, '--title', 'Edited title', '--body', 'new body'], dir);
    expect(edited.status).toBe(0);
    expect(edited.stdout).toContain(`Edited ${id}`);

    const events = readEvents(dir).filter((e) => e.type === 'memory.edited');
    expect(events).toHaveLength(2);
    const titleEv = events.find((e) => (e.payload as Record<string, unknown>).field === 'title');
    const bodyEv = events.find((e) => (e.payload as Record<string, unknown>).field === 'body');
    expect(titleEv).toMatchObject({
      payload: { memory_id: id, field: 'title', before: 'Edit me', after: 'Edited title' },
    });
    // обрезка 200: before был 300 символов
    const payload = bodyEv!.payload as { before: string; after: string };
    expect(payload.before).toBe(longBody.slice(0, 200));
    expect(payload.after).toBe('new body');

    // get всегда печатает чистый JSON (флага --json нет — неизвестная опция валит commander)
    const obj = runCli(['get', id], dir);
    expect(obj.status).toBe(0);
    expect(JSON.parse(obj.stdout).title).toBe('Edited title');
  });

  it('edit without flags refuses; unknown id refuses', () => {
    const dir = newProject();
    const id = addObject(dir);
    expect(runCli(['edit', id], dir).status).not.toBe(0);
    expect(runCli(['edit', 'mem_does_not_exist', '--title', 'x'], dir).status).not.toBe(0);
  });

  it('archive transitions to archived (≡ transition --status archived)', () => {
    const dir = newProject();
    const id = addObject(dir);
    const r = runCli(['archive', id], dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`Archived ${id}`);

    const obj = JSON.parse(runCli(['get', id], dir).stdout);
    expect(obj.status).toBe('archived');
    const transitioned = readEvents(dir).find((e) => e.type === 'memory.transitioned');
    expect(transitioned).toMatchObject({ payload: { memory_id: id, from: 'active', to: 'archived' } });
  });

  it('relation list --of shows both sides; remove compensates (edge stops being read)', () => {
    const dir = newProject();
    const a = addObject(dir);
    const b = runCli(['add', '--type', 'decision', '--title', 'B'], dir);
    expect(b.status).toBe(0);
    const bId = b.stdout
      .split('\n')
      .find((l) => l.startsWith('Created memory object:'))!
      .split(': ')[1]
      .trim();

    expect(runCli(['relation', 'add', a, 'supports', bId], dir).status).toBe(0);

    const forward = runCli(['relation', 'list', '--of', a], dir);
    expect(forward.status).toBe(0);
    expect(forward.stdout).toContain(`${a} -supports-> ${bId}`);
    const backward = runCli(['relation', 'list', '--of', bId], dir);
    expect(backward.status).toBe(0);
    expect(backward.stdout).toContain(`${bId} -supported_by-> ${a}`);

    // remove прямого ребра: id — первый токен строки list
    const edgeId = forward.stdout
      .split('\n')
      .find((l) => l.includes(`-supports->`))!
      .split(/\s+/)[0];
    const removed = runCli(['relation', 'remove', edgeId], dir);
    expect(removed.status).toBe(0);

    const afterForward = runCli(['relation', 'list', '--of', a], dir);
    expect(afterForward.stdout).not.toContain(`-supports->`);
    // обратное ребро живо (remove гасит ровно одну запись)
    const afterBackward = runCli(['relation', 'list', '--of', bId], dir);
    expect(afterBackward.stdout).toContain(`-supported_by->`);

    // компенсирующая запись — append-only: в relations.jsonl она есть
    const lines = readFileSync(join(dir, '.wolf', 'memory', 'relations.jsonl'), 'utf-8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines.some((l) => l.id === edgeId && l.removed === true)).toBe(true);

    // remove несуществующего id — отказ
    expect(runCli(['relation', 'remove', 'rel_nope'], dir).status).not.toBe(0);
  });
});
