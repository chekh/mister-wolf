import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'fs';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

describe('task lifecycle: init -> thread -> brief -> report -> relation -> transition -> auto session-summary', () => {
  let cwd: string;
  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it('runs full lifecycle', () => {
    const init = runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], cwd);
    expect(init.status).toBe(0);

    const thread = runCli(['thread', 'create', '--title', 'T', '--goal', 'G'], cwd);
    expect(thread.status).toBe(0);
    expect(thread.stdout).toContain('Created work thread:');
    const threadId = thread.stdout.match(/Created work thread: (\S+)/)?.[1]!;

    // 2.13: task-brief (project-тип) вне config.yaml — краткая сводка = note howto
    const brief = runCli(['add', '--type', 'note', '--facet', 'howto', '--title', 'Brief'], cwd);
    expect(brief.status).toBe(0);
    expect(brief.stdout).toContain('Created memory object:');
    const briefId = brief.stdout.match(/Created memory object: (\S+)/)?.[1]!;

    // 2.13: report → note facet history
    const report = runCli(['add', '--type', 'note', '--facet', 'history', '--title', 'Report'], cwd);
    expect(report.status).toBe(0);

    // relation: brief answers thread
    const rel = runCli(['relation', 'add', briefId, 'answers', threadId], cwd);
    expect(rel.status).toBe(0);
    expect(rel.stdout).toContain('Recorded relation');

    const tr = runCli(['transition', briefId, 'completed'], cwd);
    expect(tr.status).toBe(0);
    expect(tr.stdout).toContain('Transitioned');

    // 2.13 P210(е): transition → completed авто-создаёт session-summary
    // (note facet history, тег session-summary); в list — строка [history]
    const list = runCli(['list'], cwd);
    expect(list.status).toBe(0);
    expect(list.stdout).toContain('Session wrap-up');
    expect(list.stdout).toContain('[history]');
  });
});
