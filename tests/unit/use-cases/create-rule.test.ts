import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createRule } from '../../../src/app/use-cases/create-rule.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

describe('createRule', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-rule-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates a rule with canonical governance for a user', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const result = await createRule(
      { store, log, clock, idGen },
      {
        title: 'Use TypeScript strict mode',
        body: 'Always enable strict mode in tsconfig.',
        scope: 'project',
        appliesTo: ['src/**/*.ts'],
        trigger: 'when creating tsconfig',
        createdBy: 'user:cli',
      }
    );

    expect(result.object.type).toBe('rule');
    expect(result.object.scope).toBe('project');
    expect(result.object.memory_class).toBe('canonical');
    expect(result.object.truth_role).toBe('source_of_truth');
  });

  it('rejects rule creation by agents', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    await expect(
      createRule(
        { store, log, clock, idGen },
        {
          title: 'Use strict mode',
          body: '...',
          scope: 'project',
          createdBy: 'agent:opencode',
        }
      )
    ).rejects.toThrow('Rules can only be created by explicit user request');
  });
});
