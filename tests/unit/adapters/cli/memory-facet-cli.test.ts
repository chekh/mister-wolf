// tests/unit/adapters/cli/memory-facet-cli.test.ts
// P212 (2.13 §5.3б/в): list/search --facet + ANSI-подсветка фасета.
// Паттерн D12/Q11 (как memory-call.test.ts): vitest-воркеры не умеют
// process.chdir — мокаем cwd; TTY-режим подменяем через defineProperty.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createCliContainer } from '../../../../src/bootstrap/container.js';
import { addMemoryObject } from '../../../../src/app/use-cases/add-memory-object.js';

function setTTY(value: boolean | undefined): void {
  Object.defineProperty(process.stdout, 'isTTY', { value, configurable: true });
}

describe('P212: list/search --facet и ANSI-цвета', () => {
  let dir: string;
  let cwdMock: ReturnType<typeof vi.spyOn>;
  let logs: string[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-facet-cli-'));
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    setTTY(false);
  });

  afterEach(() => {
    cwdMock.mockRestore();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    delete (process.stdout as { isTTY?: boolean }).isTTY;
    rmSync(dir, { recursive: true, force: true });
  });

  async function seedNote(facet: string, title: string): Promise<string> {
    const deps = createCliContainer(dir);
    const seeded = await addMemoryObject(deps, {
      type: 'note',
      title,
      body: 'alpha common',
      createdBy: 'user:unit-test',
      facet,
    });
    return seeded.object.id;
  }

  it('list --facet фильтрует и показывает фасет в строке', async () => {
    const howtoId = await seedNote('howto', 'How to deploy');
    const pitfallId = await seedNote('pitfall', 'Deploy pitfall');
    const { memoryListCommand } = await import('../../../../src/adapters/cli/commands/memory-list.js');
    await memoryListCommand().exitOverride().parseAsync(['list', '--facet', 'pitfall'], { from: 'user' });
    const out = logs.join('\n');
    expect(out).toContain(pitfallId);
    expect(out).toContain('[pitfall]');
    expect(out).not.toContain(howtoId);
  });

  it('search --facet фильтрует по индексу', async () => {
    const howtoId = await seedNote('howto', 'How to deploy');
    const pitfallId = await seedNote('pitfall', 'Deploy pitfall');
    const { memorySearchCommand } = await import('../../../../src/adapters/cli/commands/memory-search.js');
    await memorySearchCommand().exitOverride().parseAsync(['alpha', '--facet', 'pitfall'], { from: 'user' });
    const out = logs.join('\n');
    expect(out).toContain(pitfallId);
    expect(out).not.toContain(howtoId);
  });

  it('search --facet с неизвестным значением → UserFacingError со словарём', async () => {
    await seedNote('howto', 'How to deploy');
    const { memorySearchCommand } = await import('../../../../src/adapters/cli/commands/memory-search.js');
    await expect(
      memorySearchCommand().exitOverride().parseAsync(['alpha', '--facet', 'nope'], { from: 'user' })
    ).rejects.toThrow(/Invalid facet "nope".*howto/);
  });

  it('pipe (isTTY=false): list и search без ANSI-кодов', async () => {
    await seedNote('pitfall', 'Deploy pitfall');
    const { memoryListCommand } = await import('../../../../src/adapters/cli/commands/memory-list.js');
    await memoryListCommand().exitOverride().parseAsync(['list'], { from: 'user' });
    const { memorySearchCommand } = await import('../../../../src/adapters/cli/commands/memory-search.js');
    await memorySearchCommand().exitOverride().parseAsync(['alpha'], { from: 'user' });
    const out = logs.join('\n');
    expect(out).toContain('[pitfall]');
    expect(out).not.toContain('\x1b[');
  });

  it('TTY: list подсвечивает фасет ANSI-кодом', async () => {
    setTTY(true);
    await seedNote('pitfall', 'Deploy pitfall');
    const { memoryListCommand } = await import('../../../../src/adapters/cli/commands/memory-list.js');
    await memoryListCommand().exitOverride().parseAsync(['list'], { from: 'user' });
    expect(logs.join('\n')).toContain('\x1b[31mpitfall\x1b[0m');
  });

  it('NO_COLOR / WOLF_NO_COLOR отключают цвет даже на TTY', async () => {
    setTTY(true);
    await seedNote('pitfall', 'Deploy pitfall');
    const { memoryListCommand } = await import('../../../../src/adapters/cli/commands/memory-list.js');
    vi.stubEnv('NO_COLOR', '1');
    await memoryListCommand().exitOverride().parseAsync(['list'], { from: 'user' });
    expect(logs.join('\n')).not.toContain('\x1b[');
    logs = [];
    vi.unstubAllEnvs();
    vi.stubEnv('WOLF_NO_COLOR', '1');
    await memoryListCommand().exitOverride().parseAsync(['list'], { from: 'user' });
    expect(logs.join('\n')).not.toContain('\x1b[');
  });
});
