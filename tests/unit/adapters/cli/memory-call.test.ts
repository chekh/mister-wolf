// tests/unit/adapters/cli/memory-call.test.ts
// Волна 0 0.1: `wolf call` — обрезка delivery.detail.target до 200 симв,
// detail.injection_bytes и CLI-обёртка withCliCall (mcp_call, actor=user:cli).
// vitest-воркеры не поддерживают process.chdir — мокаем cwd (паттерн D12/Q11).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import yaml from 'js-yaml';
import { readSignals } from '../../../../src/adapters/fs/session-metrics-log.js';
import { createCliContainer } from '../../../../src/bootstrap/container.js';

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
    // wave13-a: call-injection поглощён note+howto — легаси-запись сеем сырым
    // .md (alias-резолвер отдаст её пулу доставок по alias_origin, §3.4)
    const fm = {
      id: 'mem_20260929_call_seedprobe',
      type: 'call-injection',
      title: 'w0 probe injection',
      status: 'active',
      review_state: 'accepted',
      confidence: 'medium',
      importance: 0.5,
      created_at: '2026-09-29T00:00:00.000Z',
      updated_at: '2026-09-29T00:00:00.000Z',
      created_by: 'user:unit-test',
      schema_version: 1,
      source: { kind: 'manual' },
      related: { files: [], docs: [], decisions: [] },
      tags: [],
      superseded_by: null,
      memory_class: 'working',
      truth_role: 'accepted_knowledge',
      lifetime: 'long_term',
      trigger_keywords: [keyword],
    };
    const path = join(dir, '.wolf', 'memory', 'shared', 'calls', `${fm.id}.md`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `---\n${yaml.dump(fm)}---\n\nprobe content`);
    return fm.id;
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

  it('P212 §5.3в: colors=true → ANSI-подсветка фасета в блоках; false/undefined → плоский текст', async () => {
    const keyword = 'colorprobe';
    await seedInjection(keyword);
    const { getCallInjections } = await import('../../../../src/app/use-cases/get-call-injections.js');
    const { MarkdownMemoryStore } = await import('../../../../src/adapters/fs/markdown-memory-store.js');
    const store = new MarkdownMemoryStore(dir);
    const clock = { now: () => new Date('2026-09-29T00:00:00.000Z') };

    // alias call-injection → note с инжектированным facet 'howto' (§5.4)
    const colored = await getCallInjections({ store, clock }, { topic: keyword, colors: true });
    expect(colored.blocks.length).toBeGreaterThan(0);
    expect(colored.blocks[0]).toContain('[\x1b[32mhowto\x1b[0m]');

    const plain = await getCallInjections({ store, clock }, { topic: keyword, colors: false });
    expect(plain.blocks[0]).toContain('[howto]');
    expect(plain.blocks[0]).not.toContain('\x1b[');

    const undef = await getCallInjections({ store, clock }, { topic: keyword });
    expect(undef.blocks[0]).toContain('[howto]');
    expect(undef.blocks[0]).not.toContain('\x1b[');
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
