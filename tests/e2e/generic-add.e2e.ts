import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'fs';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

const TYPES: { type: string; set: string; expectedStatus: string }[] = [
  { type: 'decision', set: '', expectedStatus: 'active' },
  { type: 'lesson', set: '', expectedStatus: 'active' },
  { type: 'observation', set: '', expectedStatus: 'active' },
  { type: 'session-summary', set: '', expectedStatus: 'active' },
  { type: 'open-question', set: '', expectedStatus: 'active' },
  { type: 'context', set: '', expectedStatus: 'active' },
  { type: 'work-thread', set: 'goal=G', expectedStatus: 'active' },
  // info-request skipped — expected_answer is string[], CLI --set can't create arrays
  { type: 'article', set: 'thread=t1,summary=S', expectedStatus: 'proposed' },
  { type: 'blocker', set: 'impact=I', expectedStatus: 'active' },
  { type: 'session-checkpoint', set: 'thread=t1', expectedStatus: 'active' },
  { type: 'rule', set: 'scope=project', expectedStatus: 'active' },
  // document-ref skipped — requireSourcePath, no CLI option for source.path
  { type: 'document-native', set: '', expectedStatus: 'active' },
  { type: 'task-brief', set: 'executor=E,priority=high', expectedStatus: 'active' },
  { type: 'report', set: '', expectedStatus: 'active' },
  { type: 'council-question', set: 'question=Q', expectedStatus: 'open' },
  { type: 'council-opinion', set: 'vote=A', expectedStatus: 'proposed' },
  { type: 'synthesis', set: 'recommendation=R', expectedStatus: 'proposed' },
  { type: 'escalation', set: 'question=Q', expectedStatus: 'open' },
  { type: 'decision-request', set: 'question=Q', expectedStatus: 'open' },
];

describe('all creatable types default to declaration lifecycle head via generic add', () => {
  let cwd: string;
  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  for (const t of TYPES) {
    it(`${t.type} → ${t.expectedStatus}`, () => {
      const args = ['add', '--type', t.type, '--title', `${t.type} test`];
      if (t.set) args.push('--set', t.set);
      const r = runCli(args, cwd);
      expect(r.status).toBe(0);
      const id = r.stdout.match(/Created memory object: (\S+)/)?.[1]!;
      expect(id).toBeDefined();

      const g = runCli(['get', id], cwd);
      expect(g.status).toBe(0);
      expect(g.stdout).toContain(t.expectedStatus);
    });
  }

  it("info-request rejected via CLI --set (expected_answer is string[], --set can't create arrays)", () => {
    const r = runCli(
      [
        'add',
        '--type',
        'info-request',
        '--title',
        'IR',
        '--set',
        'thread=t1,question=Q,detour_reason=D,expected_answer=A',
      ],
      cwd
    );
    expect(r.status).not.toBe(0);
  });

  it('document-ref rejected via CLI (requireSourcePath, no --source-path option)', () => {
    const r = runCli(['add', '--type', 'document-ref', '--title', 'DR'], cwd);
    expect(r.status).not.toBe(0);
  });

  it('document type is rejected (deprecated)', () => {
    const r = runCli(['add', '--type', 'document', '--title', 'deprecated'], cwd);
    expect(r.status).not.toBe(0);
  });
});
