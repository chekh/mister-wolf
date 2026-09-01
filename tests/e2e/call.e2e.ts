import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { rmSync, writeFileSync } from 'fs';
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
