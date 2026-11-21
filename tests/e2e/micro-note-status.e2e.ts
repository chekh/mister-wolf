// REQ-333-6 (ADR-340-5 §10.3): честные статусы list/resolve.
// T-333-6.1 (AC-6.1): две открытые записи одной заметки — resolve первой
// называет счётчик оставшихся открытых противоречий (доставки НЕТ и ничего не
// обещается), resolve второй — счётчик 0; MCP resolve — тот же статус.
// patch 3.4.x review (F5.1/F5.2): формат строки list без `deliverable:`,
// тексты resolve — счётчик открытых противоречий без обещаний выдачи.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, readFileSync, writeFileSync } from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import { join } from 'path';
import { ensureBuilt, cliPath, runCli, tmpProject } from './helpers.js';

const JOURNAL = join('.wolf', 'memory', 'micro-note-delivery.jsonl');
const ONE_OPEN = 'open contradictions on the current revision: 1'; // patch 3.4.x review (F5.2)
const ZERO_OPEN = 'open contradictions on the current revision: 0'; // patch 3.4.x review (F5.2)

function createMicroNoteProject(title: string): { dir: string; noteId: string } {
  const dir = tmpProject();
  expect(runCli(['init', '--yes'], dir).status).toBe(0);
  const added = runCli(
    [
      'add',
      '--type',
      'note',
      '--facet',
      'howto',
      '--tags',
      'micro-note',
      '--title',
      title,
      '--body',
      `Body of ${title}.`,
    ],
    dir
  );
  expect(added.status).toBe(0);
  const noteId = added.stdout.match(/mem_[0-9a-zA-Z_]+/)?.[0] ?? '';
  expect(noteId).not.toBe('');
  return { dir, noteId };
}

function report(noteId: string, reason: string, dir: string): string {
  const r = runCli(
    ['contradict', 'report', '--note', noteId, '--reason', reason, '--evidence', `observed ${reason}`],
    dir
  );
  expect(r.status).toBe(0);
  const id = r.stdout.match(/cnr_[0-9a-f_]+/)?.[0] ?? '';
  expect(id).not.toBe('');
  return id;
}

describe('T-333-6.1: resolve reports the remaining open count honestly; help promises nothing', () => {
  let proj: { dir: string; noteId: string };
  let firstId = '';
  let secondId = '';
  beforeAll(() => {
    ensureBuilt();
    proj = createMicroNoteProject('R61 note');
    firstId = report(proj.noteId, 'first issue', proj.dir);
    secondId = report(proj.noteId, 'second issue', proj.dir);
  });
  afterAll(() => rmSync(proj.dir, { recursive: true, force: true }));

  it('resolving the FIRST of two open records names the remaining open count (no delivery promise)', () => {
    const r = runCli(['contradict', 'resolve', '--id', firstId, '--resolution', 'fix one'], proj.dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Suppression resolved');
    expect(r.stdout).toContain(ONE_OPEN);
    expect(r.stdout).not.toMatch(/delivery resumes/i);
  });

  it('resolve help does not promise delivery resumption (exactly one record is closed)', () => {
    const h = runCli(['contradict', 'resolve', '--help'], proj.dir);
    expect(h.status).toBe(0);
    expect(h.stdout + h.stderr).not.toMatch(/delivery resumes/i);
  });

  it('resolving the SECOND record — zero open contradictions on the current revision, no promise', () => {
    const r = runCli(['contradict', 'resolve', '--id', secondId, '--resolution', 'fix two'], proj.dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(ZERO_OPEN);
    expect(r.stdout).not.toMatch(/resumes/i);
  });
});

// patch 3.4.x review (F5.1): строка list без `deliverable:` — формат строки
// заканчивается актуальностью блокировки `block: <state>`.
describe('T-333-6.2 (r6): tag removed, same revision — list shows block: unknown, no deliverable field', () => {
  let proj: { dir: string; noteId: string };
  let recordId = '';
  beforeAll(() => {
    ensureBuilt();
    proj = createMicroNoteProject('R62 note');
    recordId = report(proj.noteId, 'r6 issue', proj.dir);
    // тег снят при той же ревизии (тег не входит в learningSignalRevision);
    // как в стенде r6: tags: [] + удаление строки тега (фронтматтер валиден)
    const md = join(proj.dir, '.wolf', 'memory', 'shared', 'notes', `${proj.noteId}.md`);
    const edited = readFileSync(md, 'utf-8')
      .replace(/^tags:$/m, 'tags: []')
      .replace(/^  - micro-note\n/m, '');
    writeFileSync(md, edited, 'utf-8');
  });
  afterAll(() => rmSync(proj.dir, { recursive: true, force: true }));

  it('the row shows block: unknown (was: actual — r6 defect) and carries no deliverable field', () => {
    const list = runCli(['contradict', 'list'], proj.dir);
    expect(list.status).toBe(0);
    const row = list.stdout.split('\n').find((l) => l.includes(recordId)) ?? '';
    expect(row).not.toBe('');
    expect(row).toContain('block: unknown');
    expect(row).not.toContain('deliverable:');
    expect(row.trim().endsWith('block: unknown')).toBe(true); // строка заканчивается блокировкой
  });

  it('a deliverable note with one open record shows block: actual (row ends with the block state)', () => {
    // контрольный сценарий без снятия тега: вторая заметка, одна открытая запись
    const added = runCli(
      [
        'add',
        '--type',
        'note',
        '--facet',
        'howto',
        '--tags',
        'micro-note',
        '--title',
        'R62 control',
        '--body',
        'Control body.',
      ],
      proj.dir
    );
    const noteId = added.stdout.match(/mem_[0-9a-zA-Z_]+/)?.[0] ?? '';
    const id = report(noteId, 'control issue', proj.dir);
    const list = runCli(['contradict', 'list'], proj.dir);
    const row = list.stdout.split('\n').find((l) => l.includes(id)) ?? '';
    expect(row).toContain('block: actual');
    expect(row).not.toContain('deliverable:');
    expect(row.trim().endsWith('block: actual')).toBe(true);
  });
});

describe('T-333-6.1 MCP stdio: resolve response carries the same remaining-block status', () => {
  let proj: { dir: string; noteId: string };
  let child: ChildProcess;
  let firstId = '';
  let secondId = '';
  let nextId = 1;

  function sendAndReceive(
    message: Record<string, unknown>
  ): Promise<{ result?: { content?: Array<{ text?: string }> }; error?: { message?: string } }> {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const timeout = setTimeout(() => reject(new Error('mcp timeout')), 15_000);
      let buffer = '';
      const handler = (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed) as { id?: number; jsonrpc?: string };
            if (parsed.jsonrpc === '2.0' && parsed.id === id) {
              clearTimeout(timeout);
              child.stdout?.off('data', handler);
              resolve(parsed as { result?: { content?: Array<{ text?: string }> }; error?: { message?: string } });
              return;
            }
          } catch {
            // non-JSON
          }
        }
      };
      child.stdout?.on('data', handler);
      child.stdin?.write(JSON.stringify({ ...message, id }) + '\n');
    });
  }

  async function callNoteContradiction(args: Record<string, unknown>): Promise<string> {
    const res = await sendAndReceive({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'note_contradiction', arguments: args },
    });
    return res.result?.content?.[0]?.text ?? `ERROR: ${res.error?.message ?? 'no content'}`;
  }

  beforeAll(() => {
    ensureBuilt();
    proj = createMicroNoteProject('R61 MCP note');
    child = spawn('node', [cliPath, 'mcp'], { cwd: proj.dir, stdio: ['pipe', 'pipe', 'pipe'] });
  });
  afterAll(() => {
    child.kill();
    rmSync(proj.dir, { recursive: true, force: true });
  });

  it('resolve of the first record names the remaining open count; the second reports zero', async () => {
    await sendAndReceive({
      jsonrpc: '2.0',
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0.1.0' } },
    });
    for (const reason of ['mcp first', 'mcp second']) {
      const text = await callNoteContradiction({
        action: 'report',
        note_id: proj.noteId,
        reason,
        contradiction_evidence: `observed ${reason}`,
      });
      expect(text).toContain('Contradiction recorded');
    }
    const journal = readFileSync(join(proj.dir, JOURNAL), 'utf-8');
    const ids = (journal.match(/cnr_[0-9a-f_]+/g) ?? []).filter((v, i, a) => a.indexOf(v) === i);
    expect(ids.length).toBe(2);
    firstId = ids[0]!;
    secondId = ids[1]!;

    const first = await callNoteContradiction({ action: 'resolve', suppression_id: firstId, resolution: 'fix one' });
    expect(first).toContain('Suppression resolved');
    expect(first).toContain(ONE_OPEN);
    expect(first).not.toMatch(/delivery resumes/i);

    const second = await callNoteContradiction({ action: 'resolve', suppression_id: secondId, resolution: 'fix two' });
    expect(second).toContain(ZERO_OPEN);
  });
});
