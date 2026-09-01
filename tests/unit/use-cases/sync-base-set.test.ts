// tests/unit/use-cases/sync-base-set.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { syncBaseSet } from '../../../src/app/use-cases/sync-base-set.js';
import type { BaseSetRenderer, ModelContext } from '../../../src/ports/base-set-renderer.port.js';
import { memorySyncCommand } from '../../../src/adapters/cli/commands/memory-sync.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { createCli } from '../../../src/adapters/cli/cli-entry.js';
import { UserFacingError } from '../../../src/domain/errors.js';
import type { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

function fakeRenderer(calls: string[], modelsSeen: (ModelContext | 'omit' | undefined)[] = []) {
  return {
    id: 'fake',
    async renderBaseSet() {
      throw new Error('renderBaseSet не вызывается из sync');
    },
    async syncBaseSet(dir: string, models?: ModelContext | 'omit') {
      calls.push(dir);
      modelsSeen.push(models);
      return {
        outcomes: [{ file: 'a.md', action: 'skipped' as const }],
        orphaned: ['.opencode/agents/gone.md'],
      };
    },
  } as unknown as BaseSetRenderer;
}

describe('syncBaseSet use-case (Task 7)', () => {
  it('делегирует renderer.syncBaseSet без трансформаций', async () => {
    const calls: string[] = [];
    const res = await syncBaseSet(fakeRenderer(calls), '/proj');
    expect(calls).toEqual(['/proj']);
    expect(res.outcomes).toEqual([{ file: 'a.md', action: 'skipped' }]);
    expect(res.orphaned).toEqual(['.opencode/agents/gone.md']);
  });
  it('пробрасывает models-контекст (§4.5): контекст и omit', async () => {
    const modelsSeen: (ModelContext | 'omit' | undefined)[] = [];
    const fr = () => fakeRenderer([], modelsSeen);
    const ctx: ModelContext = { primary: 'p/m1', worker: 'w/m1' };
    await syncBaseSet(fr(), '/proj', ctx);
    await syncBaseSet(fr(), '/proj', 'omit');
    await syncBaseSet(fr(), '/proj'); // легаси-вызов без контекста
    expect(modelsSeen).toEqual([ctx, 'omit', undefined]);
  });
});

describe('wolf sync CLI (Task 7)', () => {
  beforeEach(() => {
    delete process.env.npm_command;
  });

  it('команда sync зарегистрирована в CLI', () => {
    const cli = createCli();
    expect(cli.commands.map((c) => c.name())).toContain('sync');
  });

  it('npx → UserFacingError (try-out не пишет набор)', async () => {
    process.env.npm_command = 'exec';
    const cmd = memorySyncCommand();
    await expect(cmd.parseAsync(['node', 'sync'])).rejects.toThrow(UserFacingError);
    await expect(cmd.parseAsync(['node', 'sync'])).rejects.toThrow(/npx try-out/);
  });

  it('не-npx: печатает outcomes и orphaned; без routing-объекта — режим omit', async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => logs.push(a.map(String).join(' ')));
    // фаза B: templates/base наполнен — рендерим в реальный tmp-проект
    const proj = mkdtempSync(join(tmpdir(), 'wolf-sync-cli-'));
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(proj);
    try {
      const cmd = memorySyncCommand();
      await cmd.parseAsync(['node', 'sync']);
      expect(logs.some((l) => l.includes('# wolf sync'))).toBe(true);
      expect(logs.some((l) => l.includes('models: omit'))).toBe(true);
      expect(logs.some((l) => l.includes('Память (.wolf/) не тронута'))).toBe(true);
      // omit-режим: в отрендеренных агентах нет model:-строки и нет пинов
      const agent = readFileSync(join(proj, '.opencode/agents/mr-wolf.md'), 'utf-8');
      expect(agent).not.toMatch(/^model:/m);
      expect(agent).not.toContain('zai-coding-plan');
    } finally {
      spy.mockRestore();
      cwdSpy.mockRestore();
      rmSync(proj, { recursive: true, force: true });
    }
  });

  it('routing-объект в памяти → sync подставляет модели и печатает их', async () => {
    const routing = {
      id: 'mem_20260901_rt_aa0001',
      type: 'rule',
      title: 'Routing: модели агентов',
      status: 'active',
      review_state: 'accepted',
      confidence: 'high',
      importance: 0.9,
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
      created_by: 'wolf-init',
      schema_version: 1,
      source: { kind: 'manual' },
      related: { files: [], docs: [], decisions: [] },
      tags: ['wolf-routing', 'models'],
      superseded_by: null,
      body: 'primary: cli/p1\nworker: cli/w1\n',
      memory_class: 'working',
      truth_role: 'source_of_truth',
      lifetime: 'long_term',
      scope: 'project',
    } as MemoryObject;
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => logs.push(a.map(String).join(' ')));
    const proj = mkdtempSync(join(tmpdir(), 'wolf-sync-rt-'));
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(proj);
    try {
      await new MarkdownMemoryStore(proj).save(routing);
      const cmd = memorySyncCommand();
      await cmd.parseAsync(['node', 'sync']);
      expect(logs.some((l) => l.includes('primary=cli/p1') && l.includes('worker=cli/w1'))).toBe(true);
      expect(logs.some((l) => l.includes('models: omit'))).toBe(false);
      const mrWolf = readFileSync(join(proj, '.opencode/agents/mr-wolf.md'), 'utf-8');
      expect(mrWolf).toContain('model: cli/p1');
      const worker = readFileSync(join(proj, '.opencode/agents/worker-implementer.md'), 'utf-8');
      expect(worker).toContain('model: cli/w1');
    } finally {
      spy.mockRestore();
      cwdSpy.mockRestore();
      rmSync(proj, { recursive: true, force: true });
    }
  });
});
