// REQ-333-5 (ADR-340-5): ревизия наблюдения в report. CLI `--revision` и MCP
// `observed_revision` — опционально; без поля — сегодняшнее поведение (запись
// под текущей ревизией, T-333-5.1); с расхождением — запись под НАБЛЮДАЕМОЙ
// ревизией, успех + явное предупреждение, текущая ревизия не подавляется
// (заметка доставляется), resolve адресует запись (T-333-5.2, сценарий r5).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, readFileSync, writeFileSync } from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import { join } from 'path';
import { ensureBuilt, cliPath, runCli, tmpProject } from './helpers.js';
import { NoteContradictionInputSchema } from '../../src/adapters/mcp/mcp-schemas.js';

const JOURNAL = join('.wolf', 'memory', 'micro-note-delivery.jsonl');

/** Проект с одной активной micro-note; возвращает id заметки. */
function createMicroNoteProject(title: string, body: string): { dir: string; noteId: string } {
  const dir = tmpProject();
  expect(runCli(['init', '--yes'], dir).status).toBe(0);
  const added = runCli(
    ['add', '--type', 'note', '--facet', 'howto', '--tags', 'micro-note', '--title', title, '--body', body],
    dir
  );
  expect(added.status).toBe(0);
  const noteId = added.stdout.match(/mem_[0-9a-zA-Z_]+/)?.[0] ?? '';
  expect(noteId).not.toBe('');
  return { dir, noteId };
}

function report(noteId: string, reason: string, evidence: string, dir: string, revision?: string) {
  const args = ['contradict', 'report', '--note', noteId, '--reason', reason, '--evidence', evidence];
  if (revision !== undefined) args.push('--revision', revision);
  return runCli(args, dir);
}

describe('T-333-5.1: report without --revision binds to the current revision; malformed --revision refuses', () => {
  let proj: { dir: string; noteId: string };
  beforeAll(() => {
    ensureBuilt();
    proj = createMicroNoteProject('R51 note', 'Guidance (v1)');
  });
  afterAll(() => rmSync(proj.dir, { recursive: true, force: true }));

  it('report without --revision binds the record to the CURRENT revision (r5 pre-state regression)', () => {
    const r = report(proj.noteId, 'plain issue', 'plain evidence', proj.dir);
    expect(r.status).toBe(0);
    // note_evidence = mem@<rev12> текущей ревизии; запись в журнале — с той же ревизией
    const rev12 = r.stdout.match(/for mem_[0-9a-zA-Z_]+@([0-9a-f]{12})/)?.[1] ?? '';
    expect(rev12).not.toBe('');
    const journal = readFileSync(join(proj.dir, JOURNAL), 'utf-8');
    expect(journal).toContain(`"revision":"${rev12}`);
    expect(journal).not.toContain('differs from the current revision');
  });

  it('--revision shorter than 12 hex refuses explicitly', () => {
    const r = report(proj.noteId, 'short rev', 'evidence', proj.dir, 'abc123');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/observed revision/i);
  });

  it('--revision with non-hex characters refuses explicitly', () => {
    const r = report(proj.noteId, 'non-hex rev', 'evidence', proj.dir, 'zzzzzzzzzzzz');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/observed revision/i);
  });

  it('MCP schema: observed_revision is optional and preserved (unit-schema part of AC-5.1)', () => {
    const base = { action: 'report' as const, note_id: 'mem_x', reason: 'r', contradiction_evidence: 'e' };
    // без поля — валидно (эквивалент CLI без --revision)
    expect(NoteContradictionInputSchema.parse(base)).toEqual(base);
    // с полем — значение НЕ теряется (не strip) и доходит до use-case
    const parsed = NoteContradictionInputSchema.parse({ ...base, observed_revision: 'a'.repeat(12) });
    expect((parsed as { observed_revision?: string }).observed_revision).toBe('a'.repeat(12));
  });
});

describe('T-333-5.2 (r5): report --revision on an edited note records the OBSERVED revision, warns, keeps delivering', () => {
  let proj: { dir: string; noteId: string };
  let v1rev12 = '';
  let divergedId = '';
  beforeAll(() => {
    ensureBuilt();
    proj = createMicroNoteProject('R52 note', 'Guidance (v1)');
    // rev12 наблюдаемой ревизии — из первого report (запись привязана к v1)
    const r1 = report(proj.noteId, 'v1 issue', 'v1 evidence', proj.dir);
    expect(r1.status).toBe(0);
    v1rev12 = r1.stdout.match(/for mem_[0-9a-zA-Z_]+@([0-9a-f]{12})/)?.[1] ?? '';
    expect(v1rev12).not.toBe('');
    // заметка отредактирована v1 → v2 (новая ревизия контента); notes —
    // .wolf/memory/shared/notes/<id>.md (layout v2, targetPathFor)
    const md = join(proj.dir, '.wolf', 'memory', 'shared', 'notes', `${proj.noteId}.md`);
    writeFileSync(md, readFileSync(md, 'utf-8').replace('(v1)', '(v2)'), 'utf-8');
  });
  afterAll(() => rmSync(proj.dir, { recursive: true, force: true }));

  it('report --revision <observed v1> succeeds with an explicit divergence warning', () => {
    const r = report(proj.noteId, 'r5 scenario', 'observed on v1', proj.dir, v1rev12);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('differs from the current revision');
    expect(r.stdout).toContain('NOT suppressed');
    divergedId = r.stdout.match(/cnr_[0-9a-f_]+/)?.[0] ?? '';
    expect(divergedId).not.toBe('');
  });

  it('the record is stored under the OBSERVED revision with the observed rev12 evidence', () => {
    const journal = readFileSync(join(proj.dir, JOURNAL), 'utf-8');
    const line = journal.split('\n').find((l) => l.includes(divergedId)) ?? '';
    expect(line).toContain(`"revision":"${v1rev12}"`);
    expect(line).toContain(`"note_evidence":"${proj.noteId}@${v1rev12}"`);
    expect(line).toContain('r5 scenario');
  });

  it('brief keeps delivering the CURRENT (v2) text; list shows the record; resolve addresses it', () => {
    const b = runCli(['brief'], proj.dir);
    expect(b.status).toBe(0);
    expect(b.stdout).toContain('R52 note'); // v2 доставляется — текущая ревизия не подавлена
    expect(b.stdout).not.toContain('Guidance (v1)');

    const list = runCli(['contradict', 'list'], proj.dir);
    expect(list.status).toBe(0);
    expect(list.stdout).toContain(divergedId);

    const resolve = runCli(
      ['contradict', 'resolve', '--id', divergedId, '--resolution', 'stale evidence resolved'],
      proj.dir
    );
    expect(resolve.status).toBe(0);
    expect(resolve.stdout).toContain(`${proj.noteId}@${v1rev12}`); // аудит: id@rev12 записи
  });
});

// MCP stdio: тот же сценарий r5 через note_contradiction с observed_revision —
// то же поведение и тот же текст предупреждения (единый источник в use-case).
describe('T-333-5.2 MCP stdio: observed_revision diverges — warning text and observed-revision record', () => {
  let proj: { dir: string; noteId: string };
  let child: ChildProcess;
  let v1rev12 = '';
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

  beforeAll(() => {
    ensureBuilt();
    proj = createMicroNoteProject('R52 MCP note', 'Guidance (v1)');
    // rev12 из первого MCP report (без observed_revision — привязка к текущей)
    child = spawn('node', [cliPath, 'mcp'], { cwd: proj.dir, stdio: ['pipe', 'pipe', 'pipe'] });
  });
  afterAll(() => {
    child.kill();
    rmSync(proj.dir, { recursive: true, force: true });
  });

  it('report without observed_revision binds to the current revision (captured as the observed one)', async () => {
    await sendAndReceive({
      jsonrpc: '2.0',
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0.1.0' } },
    });
    const res = await sendAndReceive({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'note_contradiction',
        arguments: {
          action: 'report',
          note_id: proj.noteId,
          reason: 'v1 issue',
          contradiction_evidence: 'v1 evidence',
        },
      },
    });
    const text = res.result?.content?.[0]?.text ?? '';
    expect(text).toContain('Contradiction recorded');
    v1rev12 = text.match(/@([0-9a-f]{12})/)?.[1] ?? '';
    expect(v1rev12).not.toBe('');
    expect(text).not.toContain('differs from the current revision');
  });

  it('report with observed_revision on the edited note warns with the same text and records the observed revision', async () => {
    const md = join(proj.dir, '.wolf', 'memory', 'shared', 'notes', `${proj.noteId}.md`);
    writeFileSync(md, readFileSync(md, 'utf-8').replace('(v1)', '(v2)'), 'utf-8');
    const res = await sendAndReceive({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'note_contradiction',
        arguments: {
          action: 'report',
          note_id: proj.noteId,
          reason: 'r5 mcp scenario',
          contradiction_evidence: 'observed on v1',
          observed_revision: v1rev12,
        },
      },
    });
    const text = res.result?.content?.[0]?.text ?? '';
    expect(text).toContain('Contradiction recorded');
    expect(text).toContain('differs from the current revision');
    expect(text).toContain('NOT suppressed');
    // запись под наблюдаемой ревизией
    const journal = readFileSync(join(proj.dir, JOURNAL), 'utf-8');
    const line = journal.split('\n').find((l) => l.includes('r5 mcp scenario')) ?? '';
    expect(line).toContain(`"revision":"${v1rev12}"`);
    // заметка продолжает доставляться (текущая ревизия не подавлена)
    const b = runCli(['brief'], proj.dir);
    expect(b.status).toBe(0);
    expect(b.stdout).toContain('R52 MCP note');
  });
});
