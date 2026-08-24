import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join, extname } from 'path';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';
import { buildSolvePack } from '../../../src/app/use-cases/build-solve-pack.js';

const NOW = new Date('2026-08-24T00:00:00.000Z');
const clock = { now: () => NOW };
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function makeObject(id: string, type: string, overrides: Partial<MemoryObject> = {}): MemoryObject {
  return {
    id,
    type: type as any,
    title: 'Test',
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: daysAgo(30),
    updated_at: daysAgo(30),
    created_by: 'user:test',
    schema_version: 1,
    source: { kind: 'manual' },
    related: {},
    tags: [],
    superseded_by: null,
    body: '',
    ...overrides,
  };
}

describe('buildSolvePack', () => {
  let dir: string;
  let store: MarkdownMemoryStore;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-solve-'));
    store = new MarkdownMemoryStore(dir);
    await store.save(
      makeObject('rule_old', 'rule', { title: 'Use top-level get', updated_at: daysAgo(60), scope: 'project' } as any)
    );
    await store.save(
      makeObject('rule_new', 'rule', {
        title: 'Use entity-specific get commands',
        updated_at: daysAgo(1),
        scope: 'project',
      } as any)
    );
    await store.save(
      makeObject('decision_cli', 'decision', { title: 'CLI entity-specific commands', updated_at: daysAgo(5) })
    );
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('builds solve pack with scenario header, grouped memory, analysis prompts, constraints', async () => {
    const result = await buildSolvePack({ store, clock }, { problem: 'agent keeps using deprecated get command' });
    const md = result.markdown;
    expect(md).toContain('# Mr. Wolf Solve Pack');
    expect(md).toContain('Scenario: stale-instruction');
    expect(md).toContain('## Problem');
    expect(md).toContain('agent keeps using deprecated get command');
    expect(md).toContain('## Suspected Issue Types');
    expect(md).toContain('stale-instruction');
    expect(md).toMatch(/### rule/);
    expect(md).toContain('rule_old');
    expect(md).toContain('decision_cli');
    expect(md).toContain('diagnosis');
    expect(md).toContain('supersedes relation');
    expect(md).toContain('call-injection');
    expect(md).toContain('Prefer superseding over deleting');
    expect(result.objectIds).toContain('rule_old');
    expect(result.objectIds).toContain('decision_cli');
  });

  it('empty memory renders pack with explicit no-memory note', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'wolf-solve-empty-'));
    const emptyStore = new MarkdownMemoryStore(emptyDir);
    try {
      const result = await buildSolvePack({ store: emptyStore, clock }, { problem: 'anything at all' });
      expect(result.markdown).toContain('No relevant memory found');
      expect(result.objectIds).toEqual([]);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('solve does not mutate memory', async () => {
    const countFiles = (): number => {
      const wolfDir = join(dir, '.wolf/memory');
      let count = 0;
      const walk = (p: string) => {
        for (const entry of readdirSync(p, { withFileTypes: true })) {
          const full = join(p, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (extname(entry.name) === '.md') count++;
        }
      };
      try {
        walk(wolfDir);
      } catch {
        /* empty */
      }
      return count;
    };
    const before = countFiles();
    await buildSolvePack({ store, clock }, { problem: 'agent keeps using deprecated get command' });
    expect(countFiles()).toBe(before);
  });
});
