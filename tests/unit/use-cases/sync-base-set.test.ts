// tests/unit/use-cases/sync-base-set.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { syncBaseSet } from '../../../src/app/use-cases/sync-base-set.js';
import type { BaseSetRenderer } from '../../../src/ports/base-set-renderer.port.js';
import { memorySyncCommand } from '../../../src/adapters/cli/commands/memory-sync.js';
import { createCli } from '../../../src/adapters/cli/cli-entry.js';
import { UserFacingError } from '../../../src/domain/errors.js';

function fakeRenderer(calls: string[]) {
  return {
    id: 'fake',
    async renderBaseSet() {
      throw new Error('renderBaseSet не вызывается из sync');
    },
    async syncBaseSet(dir: string) {
      calls.push(dir);
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

  it('не-npx: печатает outcomes и orphaned', async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => logs.push(a.map(String).join(' ')));
    // фаза B: templates/base наполнен — рендерим в реальный tmp-проект
    const proj = mkdtempSync(join(tmpdir(), 'wolf-sync-cli-'));
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(proj);
    try {
      const cmd = memorySyncCommand();
      await cmd.parseAsync(['node', 'sync']);
      expect(logs.some((l) => l.includes('# wolf sync'))).toBe(true);
      expect(logs.some((l) => l.includes('Память (.wolf/) не тронута'))).toBe(true);
    } finally {
      spy.mockRestore();
      cwdSpy.mockRestore();
      rmSync(proj, { recursive: true, force: true });
    }
  });
});
