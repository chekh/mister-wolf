// tests/unit/adapters/cli/memory-call.test.ts
// Волна 0 0.1: `wolf call` — обрезка delivery.detail.target до 200 симв,
// detail.injection_bytes и CLI-обёртка withCliCall (mcp_call, actor=user:cli).
// vitest-воркеры не поддерживают process.chdir — мокаем cwd (паттерн D12/Q11).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readSignals } from '../../../../src/adapters/fs/session-metrics-log.js';
import { createCliContainer } from '../../../../src/bootstrap/container.js';
import { addMemoryObject } from '../../../../src/app/use-cases/add-memory-object.js';

describe('волна 0 0.1: `wolf call` — target≤200, injection_bytes, withCliCall', () => {
  let dir: string;
  let cwdMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-cli-call-'));
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(dir);
  });
  afterEach(() => {
    cwdMock.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  async function seedInjection(keyword: string): Promise<string> {
    const deps = createCliContainer(dir);
    const seeded = await addMemoryObject(deps, {
      type: 'call-injection',
      title: 'w0 probe injection',
      body: 'probe content',
      createdBy: 'user:unit-test',
      reviewState: 'accepted',
      extra: { trigger_keywords: [keyword] },
    });
    return seeded.object.id;
  }

  it('target длиннее 200 симв обрезается до 200; injection_bytes — число > 0', async () => {
    await seedInjection('waveprobe');
    const { memoryCallCommand } = await import('../../../../src/adapters/cli/commands/memory-call.js');
    const longTopic = `waveprobe ${'п'.repeat(250)}`;
    await memoryCallCommand().exitOverride().parseAsync(['call', '--for', longTopic], { from: 'user' });

    const deliveries = readSignals(dir).filter((e) => e.event === 'delivery');
    expect(deliveries.length).toBeGreaterThan(0);
    for (const d of deliveries) {
      expect((d.detail?.target as string).length).toBe(200);
      expect(typeof d.detail?.injection_bytes).toBe('number');
      expect(d.detail?.injection_bytes as number).toBeGreaterThan(0);
    }
  });

  it('withCliCall: mcp_call с tool_name=call, actor=user:cli, detail.cli_command=call, outcome=ok', async () => {
    await seedInjection('waveprobe');
    const { memoryCallCommand } = await import('../../../../src/adapters/cli/commands/memory-call.js');
    await memoryCallCommand().exitOverride().parseAsync(['call', '--for', 'waveprobe'], { from: 'user' });

    const calls = readSignals(dir).filter((e) => e.event === 'mcp_call');
    expect(calls).toHaveLength(1);
    const ev = calls[0];
    expect(ev.tool_name).toBe('call');
    expect(ev.outcome).toBe('ok');
    expect(ev.orchestration.actor).toBe('user:cli');
    expect(ev.detail?.cli_command).toBe('call');
    expect(ev.detail?.method).toBe('call');
    expect(typeof ev.detail?.wolf_version).toBe('string');
  });

  it('withCliCall error-ветка: outcome=error, detail.error.message/error_class_id, rethrow', async () => {
    // get несуществующего id → UserFacingError из action → error-сигнал + rethrow
    const { memoryGetCommand } = await import('../../../../src/adapters/cli/commands/memory-get.js');
    await expect(memoryGetCommand().exitOverride().parseAsync(['mem_nope'], { from: 'user' })).rejects.toThrow(
      /Memory object not found: mem_nope/
    );
    const calls = readSignals(dir).filter((e) => e.event === 'mcp_call');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.outcome).toBe('error');
    expect(calls[0]?.detail?.memory_id).toBe('mem_nope');
    expect((calls[0]?.detail?.error as { message?: string }).message).toContain('Memory object not found');
    expect(typeof calls[0]?.detail?.error_class_id).toBe('string');
  });
});
