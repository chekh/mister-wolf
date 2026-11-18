// tests/integration/learning-cycle-micro-note-e2e.test.ts
// 3.2.0 T-10 (REQ-02/REQ-03/REQ-08/REQ-09; design §3.1/§7/§10): full learning
// cycle on real use-cases and adapters (markdown store + SQLite, in-process, no
// dist). One fixture walks the whole path:
//   signal recorded → `wolf learn due` proposes (nothing dispatched) → the
//   assigned wolf-steward mandate drafts a learning-change v1 candidate
//   (proposing activates nothing) → independent verdict → `wolf learn accept`
//   (phase approved) → learning mode apply-approved → `wolf learn apply` (exact
//   bytes) → a NEW call/brief invocation delivers the micro-note with the exact
//   id@rev and persists attribution (selected/delivered) → a contradiction
//   suppresses delivery (S-27: both evidences kept) → resolve releases it again.
// Scope: this fixture drives the use-cases directly, so the channel context
// (projectId/version/target) is passed explicitly here. The adapters' own
// context wiring — the real memoryRoot/version passed by the CLI call, CLI
// brief and MCP brief — is covered by tests/unit/adapters/cli/memory-brief.test.ts.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { createCliContainer } from '../../src/bootstrap/container.js';
import { addMemoryObject } from '../../src/app/use-cases/add-memory-object.js';
import { getLearningDue } from '../../src/app/use-cases/learning-queries.js';
import { saveLearningCandidate } from '../../src/app/use-cases/save-proposal.js';
import { acceptLearningChange, applyLearningChange } from '../../src/app/use-cases/apply-learning-change.js';
import { getCallInjections } from '../../src/app/use-cases/get-call-injections.js';
import { generateAgentBrief } from '../../src/app/use-cases/generate-agent-brief.js';
import {
  reportMicroNoteContradiction,
  resolveMicroNoteSuppression,
} from '../../src/app/use-cases/micro-note-contradiction.js';
import { MarkdownMemoryStore } from '../../src/adapters/fs/markdown-memory-store.js';
import { SQLiteSearchIndex } from '../../src/adapters/sqlite/sqlite-search-index.js';
import { JsonlMicroNoteDeliveryLog } from '../../src/adapters/fs/jsonl-micro-note-delivery-log.js';
import { FsFileSystem } from '../../src/adapters/fs/fs-file-system.js';
import { HeuristicProjectScanner } from '../../src/adapters/fs/heuristic-project-scanner.js';
import { indexPath, targetPathFor } from '../../src/adapters/fs/project-paths.js';
import { learningSignalRevision } from '../../src/domain/learning-signals.js';
import { sha256Of, canonicalActiveHash } from '../../src/domain/schemas/learning-activation-schema.js';
import { validCandidateInput } from '../unit/domain/learning-fixtures.js';
import type { LearningCandidateInput } from '../../src/domain/schemas/learning-change-schema.js';

const NOW = new Date('2026-11-17T00:00:00.000Z');
const clock = { now: () => NOW };
const FIXED_TS = NOW.toISOString();

describe('learning cycle end-to-end: signal → candidate → apply → micro-note delivery (T-10)', () => {
  let dir: string;
  type Container = ReturnType<typeof createCliContainer>;
  let container: Container;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-learn-e2e-'));
    container = createCliContainer(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** A fresh store/index pair — every channel step models a new CLI/MCP invocation. */
  function fresh() {
    return {
      store: new MarkdownMemoryStore(container.memoryRoot),
      index: new SQLiteSearchIndex(indexPath(container.memoryRoot)),
    };
  }

  /** Патч 3.3.1 (REQ-331-2): журнал — постоянный JSONL вне кэша, каждый шаг
   * канала моделирует новый процесс, читающий тот же файл. */
  function journal(): JsonlMicroNoteDeliveryLog {
    return new JsonlMicroNoteDeliveryLog(container.memoryRoot);
  }

  it('delivers an accepted learning change as an attributed, suppressible micro-note', async () => {
    // Step 1 — a signal is recorded (a lesson enters the memory and the index).
    const { object: signal } = await addMemoryObject(
      { store: container.store, log: container.log, clock, idGen: container.idGen, index: container.index },
      {
        type: 'lesson',
        title: 'Retry masked a real failure',
        body: 'Two retries hid a broken probe; check the probe before retrying.',
        createdBy: 'user:test',
      }
    );

    // Tag gate (REQ-09): without the `micro-note` tag the call channels change
    // nothing — the lesson is not delivered and nothing is attributed.
    const gate = fresh();
    const beforeTag = await getCallInjections(
      { store: gate.store, clock, noteLog: journal() },
      { microNotes: { projectId: container.memoryRoot, version: '3.2.0' } }
    );
    expect(beforeTag.microNotes!.blocks).toEqual([]);
    expect(beforeTag.deliveredIds).not.toContain(signal.id);
    expect(journal().deliveries()).toEqual([]);

    // Step 2 — `wolf learn due`: deterministic read-only hint; nothing dispatched.
    const due = getLearningDue({ signals: container.index, mode: 'suggest' });
    expect(due.mode).toBe('suggest');
    expect(due.has_work).toBe(true);
    expect(due.items[0]!.memory_id).toBe(signal.id);

    // Step 3 — the assigned wolf-steward mandate drafts the change candidate:
    // a learning-change v1 envelope whose patch tags the lesson as an addressed
    // micro-note scoped to this project. Proposing activates nothing.
    const notePath = targetPathFor(container.memoryRoot, { type: 'lesson', id: signal.id });
    const baselineBytes = readFileSync(notePath);
    const baseline = baselineBytes.toString('utf8');
    const patched = baseline.replace(
      /^tags:.*$/m,
      ['tags:', '  - micro-note', 'applies:', '  projects:', `    - ${container.memoryRoot}`].join('\n')
    );
    expect(patched).not.toBe(baseline); // the tags line was found and rewritten

    const relPath = relative(dir, notePath);
    const patchRel = 'patches/retry-hint-micro-note.json';
    mkdirSync(join(dir, 'patches'), { recursive: true });
    const patchJson = JSON.stringify({ files: [{ path: relPath, content: patched }] }, null, 2);
    writeFileSync(join(dir, patchRel), patchJson, 'utf-8');

    const candidate: LearningCandidateInput = {
      ...validCandidateInput(),
      kind: 'knowledge_delta',
      problem: 'a proven local hint sits in memory but never reaches the working contour',
      goal: 'deliver the lesson as an addressed micro-note (tag micro-note, project-scoped)',
      expected_benefit: 'the next call/brief in this project carries the exact hint revision',
      scope: {
        project_id: 'proj-e2e',
        target_paths: [relPath],
        applicability: ['this project only'],
      },
      sources: [
        {
          signal_id: `seq-${due.items[0]!.seq}`,
          ref: signal.id,
          revision: due.items[0]!.revision,
          source: 'lesson',
          context: 'wolf learn due: changed signal proposed for the micro-note contour',
          observed_outcome: 'unknown',
        },
      ],
      baseline: {
        files: [{ path: relPath, sha256: sha256Of(baselineBytes) }],
        model: 'company/code',
        harness: 'opencode',
      },
      candidate: {
        diff_ref: patchRel,
        sha256: sha256Of(Buffer.from(patchJson, 'utf-8')),
        rationale: 'tag the lesson as a micro-note scoped to this project',
        negative_cases: ['a note without the micro-note tag must never deliver', 'another project must not receive it'],
      },
      trial: {
        suite_ref: 'trials/micro-note-e2e',
        oracle_sha256: sha256Of(Buffer.from('oracle: delivered block carries the exact id@rev', 'utf-8')),
        budget: { tool_calls: 0 },
      },
      rollback: {
        previous_ref: '.wolf/learning/operations/retry-hint-previous.json',
        expected_active_sha256: canonicalActiveHash([
          { path: relPath, sha256: sha256Of(Buffer.from(patched, 'utf-8')) },
        ]),
      },
    };
    const saved = await saveLearningCandidate(
      { ...container, env: {} },
      { envelope: candidate, addressee: 'user:owner' }
    );
    expect(saved.envelope.phase).toBe('proposed'); // proposing activated nothing
    expect(readFileSync(notePath, 'utf-8')).toBe(baseline); // target bytes untouched

    // Step 4 — the independent verdict (host-level review artifact, modeled by ref).
    const verdictRef = `independent-verdict: wolf-reviewer approved candidate ${saved.envelope.change_id}`;

    // Step 5 — `wolf learn accept`: the lead accepts; phase becomes approved.
    const accepted = await acceptLearningChange(
      container,
      { candidateId: saved.object.id, acceptedBy: 'user:owner', verdictRef },
      'agent:mr-wolf'
    );
    expect(accepted.phase).toBe('approved');
    expect(readFileSync(notePath, 'utf-8')).toBe(baseline); // accept still applies nothing

    // Step 6 — learning mode apply-approved, then `wolf learn apply`: exact bytes.
    const applied = await applyLearningChange(
      { ...container, baseDir: dir, mode: 'apply-approved', env: {} },
      saved.object.id,
      'agent:mr-wolf'
    );
    expect(applied.applied).toEqual([relPath]);
    expect(readFileSync(notePath, 'utf-8')).toBe(patched);

    // Step 7 — a NEW call invocation delivers the micro-note with the exact
    // id@rev and persists the attribution record (channel "call", delivered).
    const rev = learningSignalRevision(signal);
    const call = fresh();
    const result = await getCallInjections(
      { store: call.store, clock, noteLog: journal() },
      { microNotes: { projectId: container.memoryRoot, version: '3.2.0', target: 'retry before rerun' } }
    );
    expect(result.microNotes!.delivered.map((c) => c.id)).toEqual([signal.id]);
    expect(result.microNotes!.blocks.join('\n')).toContain(`[${signal.id}@${rev.slice(0, 12)}]`);
    expect(result.deliveredIds).toContain(signal.id);
    expect(journal().deliveries()).toEqual([
      { memory_id: signal.id, revision: rev, channel: 'call', kind: 'delivered', ts: FIXED_TS },
    ]);

    // Use-case level: a NEW brief invocation delivers the same note and
    // attributes channel "brief"; the context here is explicit because this
    // fixture bypasses the adapters (their wiring: memory-brief.test.ts).
    const snapshot = await new HeuristicProjectScanner(new FsFileSystem()).scan(dir);
    const brief = await generateAgentBrief(
      { store: fresh().store, fs: new FsFileSystem(), clock, noteLog: journal() },
      dir,
      snapshot,
      { microNotes: { context: { projectId: container.memoryRoot } } }
    );
    expect(brief.content).toContain('## Local Micro-Notes');
    expect(brief.content).toContain(`[${signal.id}@${rev.slice(0, 12)}]`);
    expect(brief.microNotes!.delivered.map((c) => c.id)).toEqual([signal.id]);
    expect(brief.injectedIds).toContain(signal.id);
    // The delivery log is persistent and shared: it holds the call row from
    // step 7 and appends this brief delivery after it.
    expect(
      journal()
        .deliveries()
        .filter((d) => d.kind === 'delivered')
        .map((d) => d.channel)
    ).toEqual(['call', 'brief']);
    expect(journal().deliveries().at(-1)).toMatchObject({
      memory_id: signal.id,
      revision: rev,
      channel: 'brief',
      kind: 'delivered',
      ts: FIXED_TS,
    });

    // Step 8 — a contradiction suppresses delivery (S-27): the active note with
    // the same revision stays out; both evidences are kept verbatim.
    const conflict = fresh();
    const report = await reportMicroNoteContradiction(
      { store: conflict.store, clock, log: journal(), idGen: container.idGen },
      {
        note_id: signal.id,
        reason: 'hint says retry; observed retries masked the broken probe',
        contradiction_evidence: 'session sess-e2e: rerun failed twice with retry applied',
      }
    );
    expect(report.memory_id).toBe(signal.id);
    expect(report.suppression_id).toMatch(/^cnr_\d{8}_[0-9a-f]{6}$/);

    const suppressed = fresh();
    const during = await getCallInjections(
      { store: suppressed.store, clock, noteLog: journal() },
      { microNotes: { projectId: container.memoryRoot } }
    );
    expect(during.microNotes!.delivered).toEqual([]);
    expect(during.microNotes!.underReview.map((u) => u.id)).toEqual([signal.id]);
    const record = journal().suppressions()[0]!;
    expect(record.resolved_at).toBeNull();
    expect(record.note_evidence).toBe(`${signal.id}@${rev.slice(0, 12)}`);
    expect(record.contradiction_evidence).toBe('session sess-e2e: rerun failed twice with retry applied');

    // Step 9 — resolve: delivery resumes; the audit row keeps the resolution.
    resolveMicroNoteSuppression(
      { clock, log: journal() },
      { suppression_id: record.suppression_id, resolution: 'lead confirmed: probe fixed, hint stays' }
    );
    const released = fresh();
    const after = await getCallInjections(
      { store: released.store, clock, noteLog: journal() },
      { microNotes: { projectId: container.memoryRoot } }
    );
    expect(after.microNotes!.delivered.map((c) => c.id)).toEqual([signal.id]);
    expect(journal().suppressions()[0]!.resolution).toBe('lead confirmed: probe fixed, hint stays');
  });
});
