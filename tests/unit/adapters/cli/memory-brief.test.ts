// tests/unit/adapters/cli/memory-brief.test.ts
// 3.2.0 T-10 corrective return (F-2, REQ-09): the brief channels deliver
// addressed micro-notes under the REAL context wired by the adapters —
// project = the wolf memory root, version = the wolf version. A project-scoped
// note (applies.projects=[memoryRoot]) must deliver in all three channels
// (CLI call, CLI brief, MCP brief) with the exact [id@rev12] and a persisted
// attribution row; a note scoped to another project must not deliver.
// vitest-воркеры не поддерживают process.chdir — мокаем cwd (паттерн D12/Q11).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import yaml from 'js-yaml';
import { buildMcpServer } from '../../../../src/adapters/mcp/mcp-server.js';
import { JsonlMicroNoteDeliveryLog } from '../../../../src/adapters/fs/jsonl-micro-note-delivery-log.js';
import { learningSignalRevision } from '../../../../src/domain/learning-signals.js';

describe('micro-note context wiring in the brief/call adapters (T-10 F-2)', () => {
  let dir: string;
  let cwdMock: ReturnType<typeof vi.spyOn>;
  let logs: string[];

  const memoryRoot = (): string => dir; // container memoryRoot = project dir (resolveMemoryRoot)

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-cli-brief-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'brief-micro-adapter' }), 'utf-8');
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.mocked(console.log).mockRestore();
    vi.mocked(console.error).mockRestore();
    cwdMock.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  /** Raw-seed an active micro-note scoped to the given projects (store layout). */
  function seedMicroNote(id: string, projects: string[]): void {
    const fm = {
      id,
      type: 'note',
      title: `hint ${id}`,
      status: 'active',
      review_state: 'accepted',
      confidence: 'medium',
      importance: 0.6,
      created_at: '2026-11-17T00:00:00.000Z',
      updated_at: '2026-11-17T00:00:00.000Z',
      created_by: 'user:unit-test',
      schema_version: 1,
      source: { kind: 'manual' },
      related: { files: [], docs: [], decisions: [] },
      tags: ['micro-note'],
      superseded_by: null,
      // note survives per-type validation only with a dictionary facet (howto)
      facet: 'howto',
      applies: { projects },
    };
    const path = join(memoryRoot(), '.wolf', 'memory', 'shared', 'notes', `${id}.md`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `---\n${yaml.dump(fm)}---\n\nCheck the probe before retrying.`);
  }

  // Патч 3.3.1 (REQ-331-2): журнал доставок — постоянный JSONL вне кэша,
  // читается тем же адаптером, которым его пишут call/brief-адаптеры.
  function deliveredRows(channel: string): unknown[] {
    const journal = new JsonlMicroNoteDeliveryLog(memoryRoot());
    return journal.deliveries().filter((d) => d.kind === 'delivered' && d.channel === channel);
  }

  it('CLI brief delivers a project-scoped micro-note with id@rev and attributes channel "brief"', async () => {
    seedMicroNote('mem_brief_proj', [memoryRoot()]);
    const { memoryBriefCommand } = await import('../../../../src/adapters/cli/commands/memory-brief.js');
    await memoryBriefCommand().exitOverride().parseAsync(['brief'], { from: 'user' });

    const rev = learningSignalRevision({
      type: 'note',
      status: 'active',
      title: 'hint mem_brief_proj',
      body: 'Check the probe before retrying.',
    });
    expect(logs.join('\n')).toContain('## Local Micro-Notes');
    expect(logs.join('\n')).toContain(`[mem_brief_proj@${rev.slice(0, 12)}]`);
    expect(deliveredRows('brief')).toEqual([
      { memory_id: 'mem_brief_proj', revision: rev, channel: 'brief', kind: 'delivered', ts: expect.any(String) },
    ]);
  });

  it('CLI brief does not deliver a note scoped to another project (fail-closed applicability)', async () => {
    seedMicroNote('mem_brief_other', [join(tmpdir(), 'some-other-project')]);
    const { memoryBriefCommand } = await import('../../../../src/adapters/cli/commands/memory-brief.js');
    await memoryBriefCommand().exitOverride().parseAsync(['brief'], { from: 'user' });

    expect(logs.join('\n')).not.toContain('## Local Micro-Notes');
    expect(logs.join('\n')).not.toContain('[mem_brief_other@');
    expect(deliveredRows('brief')).toEqual([]);
  });

  it('MCP brief tool delivers the same project-scoped micro-note and attributes channel "brief"', async () => {
    seedMicroNote('mem_mcp_proj', [memoryRoot()]);
    const server = buildMcpServer(dir);
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
        >;
      }
    )._registeredTools;
    const result = await tools.brief.handler({});

    const rev = learningSignalRevision({
      type: 'note',
      status: 'active',
      title: 'hint mem_mcp_proj',
      body: 'Check the probe before retrying.',
    });
    expect(result.content[0]!.text).toContain('## Local Micro-Notes');
    expect(result.content[0]!.text).toContain(`[mem_mcp_proj@${rev.slice(0, 12)}]`);
    expect(deliveredRows('brief')).toEqual([
      { memory_id: 'mem_mcp_proj', revision: rev, channel: 'brief', kind: 'delivered', ts: expect.any(String) },
    ]);
  });

  it('CLI call delivers the same project-scoped micro-note and attributes channel "call"', async () => {
    seedMicroNote('mem_call_proj', [memoryRoot()]);
    const { memoryCallCommand } = await import('../../../../src/adapters/cli/commands/memory-call.js');
    await memoryCallCommand().exitOverride().parseAsync(['call'], { from: 'user' });

    const rev = learningSignalRevision({
      type: 'note',
      status: 'active',
      title: 'hint mem_call_proj',
      body: 'Check the probe before retrying.',
    });
    expect(logs.join('\n')).toContain(`[mem_call_proj@${rev.slice(0, 12)}]`);
    expect(deliveredRows('call')).toEqual([
      { memory_id: 'mem_call_proj', revision: rev, channel: 'call', kind: 'delivered', ts: expect.any(String) },
    ]);
  });
});
