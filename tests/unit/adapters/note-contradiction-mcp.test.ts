import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildMcpServer } from '../../../src/adapters/mcp/mcp-server.js';
import { NoteContradictionInputSchema } from '../../../src/adapters/mcp/mcp-schemas.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { SQLiteSearchIndex } from '../../../src/adapters/sqlite/sqlite-search-index.js';
import { indexPath } from '../../../src/adapters/fs/project-paths.js';
import { getCallInjections } from '../../../src/app/use-cases/get-call-injections.js';
import { learningSignalRevision } from '../../../src/domain/learning-signals.js';
import { MICRO_NOTE_TAG } from '../../../src/app/use-cases/micro-note-delivery.js';
import { UserFacingError } from '../../../src/domain/errors.js';
import type { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

// Волна R-4 (REQ-R4-2): MCP-тул `note_contradiction` — один составной тул с
// action:'report'|'resolve' (прецедент: propose_candidate), тот же use-case
// 3.2.0 T-09 и тот же журнал подавлений, что CLI `wolf contradict` (один носитель).
// AC-2.1 report подавляет как CLI; AC-2.2 resolve снимает, unknown id — отказ
// use-case; AC-2.3 схема требует action/note_id + поля действия (ошибка схемы,
// не тихий пропуск).
describe('MCP note_contradiction (REQ-R4-2)', () => {
  let dir: string;

  const NOW = new Date('2026-11-18T00:00:00.000Z');
  const clock = { now: () => NOW };

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

  function journal(): SQLiteSearchIndex {
    return new SQLiteSearchIndex(indexPath(dir));
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

  it('AC-2.1: action=report suppresses like the CLI — same journal, exact id@rev12, verbatim evidence', async () => {
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
    expect(text).toContain(`n_conf@${rev12}`);
    expect(text).toContain('suppressed until resolved');
    expect(text).toContain('observed B in session sess-1');

    // тот же носитель, что CLI (wolf contradict report) — одна запись журнала
    const records = journal().suppressions();
    expect(records).toHaveLength(1);
    expect(records[0]!.note_evidence).toBe(`n_conf@${rev12}`);
    expect(records[0]!.resolved_at).toBeNull();
    expect(await callDelivered()).toEqual([]);
  });

  it('AC-2.2: action=resolve lifts the suppression (audit row kept); unknown id refuses with the use-case text', async () => {
    const obj = microNote('n_conf');
    await new MarkdownMemoryStore(dir).save(obj as never);
    const h = handler();
    await h({ action: 'report', note_id: 'n_conf', reason: 'note says A', contradiction_evidence: 'observed B' });

    const resolved = await h({ action: 'resolve', note_id: 'n_conf', resolution: 'note fixed by edit mem_x' });
    expect(resolved.content[0]!.text).toContain('resolved');

    const records = journal().suppressions();
    expect(records).toHaveLength(1);
    expect(records[0]!.resolved_at).not.toBeNull();
    expect(await callDelivered()).toEqual(['n_conf']);

    await expect(h({ action: 'resolve', note_id: 'n_ghost', resolution: 'r' })).rejects.toThrow(UserFacingError);
    await expect(h({ action: 'resolve', note_id: 'n_ghost', resolution: 'r' })).rejects.toThrow(
      'unknown or already resolved suppression for "n_ghost"'
    );
    await expect(h({ action: 'report', note_id: 'n_ghost', reason: 'r', contradiction_evidence: 'e' })).rejects.toThrow(
      'unknown micro-note "n_ghost"'
    );
  });

  it('AC-2.3: schema requires action/note_id and the action fields; incomplete input is a schema error', async () => {
    // нет action
    expect(await schemaIssues({ note_id: 'n_conf' })).not.toEqual([]);
    // нет note_id
    expect(await schemaIssues({ action: 'report', reason: 'r', contradiction_evidence: 'e' })).not.toEqual([]);
    // report без reason/contradiction_evidence
    expect(await schemaIssues({ action: 'report', note_id: 'n_conf' })).not.toEqual([]);
    // resolve без resolution
    expect(await schemaIssues({ action: 'resolve', note_id: 'n_conf' })).not.toEqual([]);
    // неизвестный action
    expect(await schemaIssues({ action: 'merge', note_id: 'n_conf' })).not.toEqual([]);
    // полные входы обоих действий проходят
    expect(
      await schemaIssues({ action: 'report', note_id: 'n_conf', reason: 'r', contradiction_evidence: 'e' })
    ).toEqual([]);
    expect(await schemaIssues({ action: 'resolve', note_id: 'n_conf', resolution: 'r' })).toEqual([]);
  });
});
