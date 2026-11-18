import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildMcpServer } from '../../../src/adapters/mcp/mcp-server.js';
import { NoteContradictionInputSchema } from '../../../src/adapters/mcp/mcp-schemas.js';
import { JsonlMicroNoteDeliveryLog } from '../../../src/adapters/fs/jsonl-micro-note-delivery-log.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { getCallInjections } from '../../../src/app/use-cases/get-call-injections.js';
import { learningSignalRevision } from '../../../src/domain/learning-signals.js';
import { MICRO_NOTE_TAG } from '../../../src/app/use-cases/micro-note-delivery.js';
import { UserFacingError } from '../../../src/domain/errors.js';
import type { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

// Патч 3.3.1 (REQ-331-1/4): MCP-тул `note_contradiction` — один составной тул с
// action:'report'|'resolve' (тот же use-case и тот же постоянный JSONL-журнал,
// что CLI `wolf contradict` — один носитель). report печатает suppression_id;
// resolve адресует запись журнала (suppression_id); note_id-адресация resolve
// отклоняется схемой; пустые reason/evidence — ошибка схемы до use-case
// (T-4.3, первая линия). Каталог тулов не растёт (guard без правок).
describe('MCP note_contradiction (patch 3.3.1)', () => {
  let dir: string;

  const clock = { now: () => new Date('2026-11-18T00:00:00.000Z') };

  function microNote(id: string): MemoryObject {
    return {
      title: `Hint ${id}`,
      body: `Body of ${id}.`,
      status: 'active',
      review_state: 'accepted',
      confidence: 'medium',
      importance: 0.5,
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-15T00:00:00Z',
      created_by: 'user:test',
      schema_version: 1,
      source: { kind: 'manual' },
      related: { files: [], docs: [], decisions: [] },
      tags: [MICRO_NOTE_TAG],
      superseded_by: null,
      facet: 'howto',
      type: 'note',
      id,
    } as MemoryObject;
  }

  type ToolHandler = (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>;

  function handler(): ToolHandler {
    const server = buildMcpServer(dir);
    const tools = (server as unknown as { _registeredTools: Record<string, { handler: ToolHandler }> })
      ._registeredTools;
    const tool = tools['note_contradiction'];
    if (!tool) throw new Error('note_contradiction is not registered');
    return tool.handler;
  }

  function journal(): JsonlMicroNoteDeliveryLog {
    return new JsonlMicroNoteDeliveryLog(dir);
  }

  function callDelivered(): Promise<string[]> {
    return getCallInjections(
      { store: new MarkdownMemoryStore(dir), clock, noteLog: journal() },
      { microNotes: {} }
    ).then((r) => r.microNotes?.delivered.map((c) => c.id) ?? []);
  }

  /** Тот же путь, что SDK: ~standard.validate обёрнутой схемы. */
  async function schemaIssues(input: unknown): Promise<string[]> {
    const result = (await NoteContradictionInputSchema['~standard'].validate(input)) as {
      issues?: Array<{ message: string }>;
    };
    return (result.issues ?? []).map((i) => i.message);
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-note-contradiction-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('AC-2.1: action=report suppresses like the CLI — same journal, prints the cnr_ record id, verbatim evidence', async () => {
    const obj = microNote('n_conf');
    await new MarkdownMemoryStore(dir).save(obj as never);
    const rev12 = learningSignalRevision(obj).slice(0, 12);

    const result = await handler()({
      action: 'report',
      note_id: 'n_conf',
      reason: 'note says A',
      contradiction_evidence: 'observed B in session sess-1',
    });
    const text = result.content[0]!.text;
    const id = text.match(/cnr_\d{8}_[0-9a-f]{6}/)?.[0];
    expect(id).toBeDefined();
    expect(text).toContain(`n_conf@${rev12}`);
    expect(text).toContain('suppressed until resolved');
    expect(text).toContain('observed B in session sess-1');

    // тот же носитель, что CLI (wolf contradict report) — одна запись журнала
    const records = journal().suppressions();
    expect(records).toHaveLength(1);
    expect(records[0]!.suppression_id).toBe(id);
    expect(records[0]!.note_evidence).toBe(`n_conf@${rev12}`);
    expect(records[0]!.resolved_at).toBeNull();
    expect(await callDelivered()).toEqual([]);
  });

  it('AC-1.3: action=resolve lifts the suppression by record id (audit row kept); unknown id refuses with the port text', async () => {
    const obj = microNote('n_conf');
    await new MarkdownMemoryStore(dir).save(obj as never);
    const h = handler();
    const reported = await h({
      action: 'report',
      note_id: 'n_conf',
      reason: 'note says A',
      contradiction_evidence: 'observed B',
    });
    const id = reported.content[0]!.text.match(/cnr_\d{8}_[0-9a-f]{6}/)?.[0]!;

    const resolved = await h({ action: 'resolve', suppression_id: id, resolution: 'note fixed by edit mem_x' });
    expect(resolved.content[0]!.text).toContain('resolved');
    expect(resolved.content[0]!.text).toContain(`n_conf@${learningSignalRevision(obj).slice(0, 12)}`);

    const records = journal().suppressions();
    expect(records).toHaveLength(1);
    expect(records[0]!.resolved_at).not.toBeNull();
    expect(await callDelivered()).toEqual(['n_conf']);

    const exactUnknown = `unknown or already resolved suppression for "cnr_20261118_ffffff" (REQ-03: unknown stays unknown)`;
    await expect(h({ action: 'resolve', suppression_id: 'cnr_20261118_ffffff', resolution: 'r' })).rejects.toThrow(
      UserFacingError
    );
    await expect(h({ action: 'resolve', suppression_id: 'cnr_20261118_ffffff', resolution: 'r' })).rejects.toThrow(
      exactUnknown
    );
    await expect(h({ action: 'report', note_id: 'n_ghost', reason: 'r', contradiction_evidence: 'e' })).rejects.toThrow(
      'unknown micro-note "n_ghost"'
    );
  });

  it('AC-1.3/AC-4.3: schema refuses resolve by note_id and empty reason/evidence before the use-case', async () => {
    await new MarkdownMemoryStore(dir).save(microNote('n_conf') as never);
    const h = handler();
    await h({ action: 'report', note_id: 'n_conf', reason: 'note says A', contradiction_evidence: 'observed B' });

    // resolve по note_id больше не существует в схеме (адресация по записи — AC-1.3)
    await expect(h({ action: 'resolve', note_id: 'n_conf', resolution: 'r' })).rejects.toThrow();
    // пустые reason/evidence отклоняются схемой (первая линия, T-4.3)
    await expect(
      h({ action: 'report', note_id: 'n_conf', reason: '   ', contradiction_evidence: 'e' })
    ).rejects.toThrow();
    await expect(h({ action: 'report', note_id: 'n_conf', reason: 'r', contradiction_evidence: '' })).rejects.toThrow();
    // журнал не изменён отказами
    expect(journal().suppressions()).toHaveLength(1);
  });

  it('AC-2.3: schema requires action and the action fields; incomplete input is a schema error', async () => {
    // нет action
    expect(await schemaIssues({ note_id: 'n_conf' })).not.toEqual([]);
    // нет note_id
    expect(await schemaIssues({ action: 'report', reason: 'r', contradiction_evidence: 'e' })).not.toEqual([]);
    // report без reason/contradiction_evidence
    expect(await schemaIssues({ action: 'report', note_id: 'n_conf' })).not.toEqual([]);
    // resolve без suppression_id/resolution
    expect(await schemaIssues({ action: 'resolve' })).not.toEqual([]);
    expect(await schemaIssues({ action: 'resolve', suppression_id: 'cnr_20261118_0000aa' })).not.toEqual([]);
    // неизвестный action
    expect(await schemaIssues({ action: 'merge', note_id: 'n_conf' })).not.toEqual([]);
    // полные входы обоих действий проходят
    expect(
      await schemaIssues({ action: 'report', note_id: 'n_conf', reason: 'r', contradiction_evidence: 'e' })
    ).toEqual([]);
    expect(await schemaIssues({ action: 'resolve', suppression_id: 'cnr_20261118_0000aa', resolution: 'r' })).toEqual(
      []
    );
  });
});
