// tests/unit/use-cases/sync-base-set.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { syncBaseSet } from '../../../src/app/use-cases/sync-base-set.js';
import type {
  BaseSetRenderer,
  BackupHook,
  ModelContext,
  SyncBaseSetOptions,
} from '../../../src/ports/base-set-renderer.port.js';
import { memorySyncCommand } from '../../../src/adapters/cli/commands/memory-sync.js';
import { createCli } from '../../../src/adapters/cli/cli-entry.js';
import { UserFacingError } from '../../../src/domain/errors.js';

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

describe('syncBaseSet — структурные исходы §4.3 (волна 2.20.0)', () => {
  it('protected/kept/backup проходят через use-case без трансформаций', async () => {
    const outcomes = [
      { file: 'p.md', action: 'skipped' as const, protected: true, protect: 'true' },
      { file: 'k.md', action: 'skipped' as const, kept: true },
      { file: 'u.md', action: 'updated' as const, backup: '.wolf/backup/u.md' },
    ];
    const fake = {
      id: 'fake',
      async renderBaseSet() {
        throw new Error('renderBaseSet не вызывается из sync');
      },
      async syncBaseSet() {
        return { outcomes, orphaned: [] };
      },
    } as unknown as BaseSetRenderer;
    const res = await syncBaseSet(fake, '/proj');
    expect(res.outcomes).toEqual(outcomes);
  });

  it('pass-through §4.12: opts.takeMutated доходит до renderer.syncBaseSet без трансформаций', async () => {
    const seen: unknown[] = [];
    const backup: BackupHook = async (rel) => rel;
    const fake = {
      id: 'fake',
      async renderBaseSet() {
        throw new Error('renderBaseSet не вызывается из sync');
      },
      async syncBaseSet(_dir: string, _models?: unknown, opts?: unknown) {
        seen.push(opts);
        return { outcomes: [], orphaned: [] };
      },
    } as unknown as BaseSetRenderer;
    const opts: SyncBaseSetOptions = { takeMutated: { backup } };
    await syncBaseSet(fake, '/proj');
    await syncBaseSet(fake, '/proj', 'omit', opts);
    expect(seen[0]).toBeUndefined();
    expect(seen[1]).toBe(opts); // тот же объект: второй обёртки/копии нет
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

  it('не-npx: печатает outcomes и orphaned; модели — режим omit (routing-объект удалён, волна 2.13)', async () => {
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
      expect(logs.some((l) => l.includes('Memory (.wolf/) untouched'))).toBe(true);
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
});
