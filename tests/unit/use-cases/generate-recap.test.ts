import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { generateRecap, renderRecap } from '../../../src/app/use-cases/generate-recap.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';
import { addMemoryObject } from '../../../src/app/use-cases/add-memory-object.js';
import { createRule } from '../../../src/app/use-cases/create-rule.js';
import { createWorkThread } from '../../../src/app/use-cases/create-work-thread.js';
import { createBlocker } from '../../../src/app/use-cases/create-blocker.js';
import { createDecision } from '../../../src/app/use-cases/create-decision.js';
import { createInfoRequest } from '../../../src/app/use-cases/create-info-request.js';
import { transitionMemoryObject } from '../../../src/app/use-cases/transition-memory-object.js';
import { BOOTSTRAP_THREAD_TITLE } from '../../../src/app/use-cases/bootstrap-project.js';

describe('generateRecap', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-recap-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function mkDeps() {
    return {
      store: new MarkdownMemoryStore(dir),
      log: new JsonlEventLog(eventsPath(dir)),
      clock: new SystemClock(),
      idGen: new HashIdGenerator(),
    };
  }

  it('collects only active/open objects into their sections', async () => {
    const deps = mkDeps();

    const rule = await createRule(deps, {
      title: 'Run checks before done',
      body: 'Always run npm run check.',
      scope: 'project',
      createdBy: 'user:test',
    });
    const oldRule = await createRule(deps, {
      title: 'Old rule',
      body: 'Superseded rule.',
      scope: 'project',
      createdBy: 'user:test',
    });
    await transitionMemoryObject(deps, oldRule.object.id, 'superseded', 'user:test');

    const thread = await createWorkThread(deps, {
      title: 'Phase 7 recap',
      goal: 'Ship wolf recap',
      createdBy: 'user:test',
    });
    const doneThread = await createWorkThread(deps, {
      title: 'Phase 6 insights',
      goal: 'Ship wolf insights',
      createdBy: 'user:test',
    });
    await transitionMemoryObject(deps, doneThread.object.id, 'completed', 'user:test');

    const blocker = await createBlocker(deps, {
      title: 'CLI crash on boot',
      impact: 'Users cannot run wolf.',
      createdBy: 'user:test',
    });
    const resolvedBlocker = await createBlocker(deps, {
      title: 'Index missing',
      impact: 'Fixed already.',
      createdBy: 'user:test',
    });
    await transitionMemoryObject(deps, resolvedBlocker.object.id, 'resolved', 'user:test');

    const openQuestion = await addMemoryObject(deps, {
      type: 'open-question',
      title: 'Auth strategy',
      body: 'JWT or sessions?',
      createdBy: 'user:test',
    });
    const legacyQuestion = await addMemoryObject(deps, {
      type: 'open-question',
      title: 'Legacy open question',
      body: 'Created before defaultStatus existed.',
      status: 'active',
      createdBy: 'user:test',
    });
    const answeredQuestion = await addMemoryObject(deps, {
      type: 'open-question',
      title: 'Answered question',
      body: 'No longer open.',
      createdBy: 'user:test',
    });
    await transitionMemoryObject(deps, answeredQuestion.object.id, 'answered', 'user:test');

    const infoRequest = await createInfoRequest(deps, {
      title: 'Need recap spec',
      thread: thread.object.id,
      question: 'What sections does recap have?',
      detourReason: 'spec is with the lead',
      expectedAnswer: ['section list'],
      createdBy: 'user:test',
    });
    const answeredRequest = await createInfoRequest(deps, {
      title: 'Old info request',
      thread: thread.object.id,
      question: 'Answered already?',
      detourReason: 'history',
      expectedAnswer: ['yes'],
      createdBy: 'user:test',
    });
    await transitionMemoryObject(deps, answeredRequest.object.id, 'answered', 'user:test');

    const decision = await createDecision(deps, {
      title: 'Use recap command',
      body: 'recap summarizes active memory.',
      createdBy: 'user:test',
    });
    const supersededDecision = await createDecision(deps, {
      title: 'Old decision',
      body: 'Superseded decision.',
      createdBy: 'user:test',
    });
    await transitionMemoryObject(deps, supersededDecision.object.id, 'superseded', 'user:test');

    const report = await generateRecap({ store: deps.store });

    expect(report.activeRules.map((o) => o.title)).toEqual([rule.object.title]);
    expect(report.activeWorkThreads.map((o) => o.title)).toEqual([thread.object.title]);
    expect(report.openBlockers.map((o) => o.title)).toEqual([blocker.object.title]);
    expect(report.openQuestions.map((o) => o.title).sort()).toEqual(
      [openQuestion.object.title, legacyQuestion.object.title].sort()
    );
    expect(report.openInfoRequests.map((o) => o.title)).toEqual([infoRequest.object.title]);
    expect(report.recentDecisions.map((o) => o.title)).toEqual([decision.object.title]);

    const text = renderRecap(report);
    expect(text).toContain('## Active rules');
    expect(text).toContain('## Active work threads');
    expect(text).toContain('## Open blockers');
    expect(text).toContain('## Open questions');
    expect(text).toContain('## Open info requests');
    expect(text).toContain('## Recent decisions');
    expect(text).toContain('Run checks before done');
    expect(text).toContain('Phase 7 recap');
    expect(text).toContain('CLI crash on boot');
    expect(text).toContain('Auth strategy');
    expect(text).toContain('Legacy open question');
    expect(text).toContain('Need recap spec');
    expect(text).toContain('Use recap command');
    expect(text).not.toContain('Old rule');
    expect(text).not.toContain('Phase 6 insights');
    expect(text).not.toContain('Index missing');
    expect(text).not.toContain('Answered question');
    expect(text).not.toContain('Old info request');
    expect(text).not.toContain('Old decision');
  });

  it('caps recent decisions at 5 sorted by updated_at desc', async () => {
    const deps = mkDeps();

    for (let i = 1; i <= 7; i++) {
      const { object } = await createDecision(deps, {
        title: `Decision number ${i}`,
        body: `Body ${i}.`,
        createdBy: 'user:test',
      });
      // store.update() перезаписывает updated_at, поэтому фиксируем время через save()
      await deps.store.save({ ...object, updated_at: `2026-01-0${i}T00:00:00.000Z` });
    }

    const report = await generateRecap({ store: deps.store });

    expect(report.recentDecisions).toHaveLength(5);
    expect(report.recentDecisions.map((o) => o.title)).toEqual([
      'Decision number 7',
      'Decision number 6',
      'Decision number 5',
      'Decision number 4',
      'Decision number 3',
    ]);
  });

  it('renders placeholders for every section on empty memory', async () => {
    const store = new MarkdownMemoryStore(dir);

    const report = await generateRecap({ store });
    const text = renderRecap(report);

    expect(report.activeRules).toEqual([]);
    expect(report.activeWorkThreads).toEqual([]);
    expect(report.openBlockers).toEqual([]);
    expect(report.openQuestions).toEqual([]);
    expect(report.openInfoRequests).toEqual([]);
    expect(report.recentDecisions).toEqual([]);
    expect(report.onboarding).toBeNull();

    for (const header of [
      '## Active rules',
      '## Active work threads',
      '## Open blockers',
      '## Open questions',
      '## Open info requests',
      '## Recent decisions',
    ]) {
      expect(text).toContain(`${header}\n-`);
    }
    expect(text).not.toContain('## Onboarding');
  });

  // F11/D9: accepted-правила видны в recap рядом с active
  it('includes accepted rules alongside active in activeRules', async () => {
    const deps = mkDeps();

    await createRule(deps, {
      title: 'Active rule',
      body: 'Still active.',
      scope: 'project',
      createdBy: 'user:test',
    });
    const draft = await addMemoryObject(deps, {
      type: 'rule',
      title: 'Accepted convention',
      body: 'Folded by the user.',
      createdBy: 'user:test',
      status: 'proposed',
      extra: { scope: 'project' },
    });
    await transitionMemoryObject(deps, draft.object.id, 'accepted', 'user:test');

    const report = await generateRecap({ store: deps.store });

    expect(report.activeRules.map((o) => o.title).sort()).toEqual(['Accepted convention', 'Active rule']);
    expect(renderRecap(report)).toContain('Accepted convention');
  });

  // §3 правило 2: init-report active + thread отсутствует → bootstrap-сигнал
  it('onboarding: bootstrap signal when active init-report exists and no thread', async () => {
    const deps = mkDeps();
    await addMemoryObject(deps, {
      type: 'report',
      title: 'Init report: demo',
      body: '## Сделано\n…',
      createdBy: 'wolf-init',
      tags: ['wolf-init', 'onboarding-v2'],
    });

    const report = await generateRecap({ store: deps.store });

    expect(report.onboarding).toEqual({ kind: 'bootstrap' });
    const text = renderRecap(report);
    expect(text).toContain('## Onboarding');
    // текст §6.2 — дословный контракт для рамки mr-wolf
    expect(text).toContain(
      'Onboarding v2: init done, bootstrap not yet. Ask the user: offer to run ' +
        '`wolf bootstrap` (can be executed right in the session: `wolf bootstrap`; in the Wolf dogfood repo — ' +
        '`node dist/bootstrap/cli.js bootstrap`) or follow the user’s path. ' +
        'Actions with side effects — only with the user’s consent.'
    );
    // секция — первая после 'Recap', до Active rules
    expect(text.indexOf('## Onboarding')).toBeGreaterThan(0);
    expect(text.indexOf('## Onboarding')).toBeLessThan(text.indexOf('## Active rules'));
  });

  // §3 правило 1: thread active → продолжение-сигнал (legacy: без init-report)
  it('onboarding: continue signal when bootstrap thread is active (legacy without report)', async () => {
    const deps = mkDeps();
    const { object } = await createWorkThread(deps, {
      title: BOOTSTRAP_THREAD_TITLE,
      goal: 'Collapse drafts and finish onboarding',
      createdBy: 'user:test',
    });

    const report = await generateRecap({ store: deps.store });

    expect(report.onboarding).toEqual({ kind: 'continue', threadId: object.id });
    const text = renderRecap(report);
    expect(text).toContain('## Onboarding');
    expect(text).toContain('Onboarding v2: bootstrap done, onboarding not finished');
    // текст §6.2 — дословный контракт, <id> = реальный threadId
    expect(text).toContain(
      'Onboarding v2: bootstrap done, onboarding not finished (thread active). Work under the user’s ' +
        'direction — collapsing drafts, deep project study — as the user decides; no prescribed ' +
        `roles. When onboarding is finished — offer to close the thread (\`wolf transition ${object.id} ` +
        'completed`) and close it with the user’s consent.'
    );
  });

  it('onboarding: active thread wins over init-report (continue)', async () => {
    const deps = mkDeps();
    await addMemoryObject(deps, {
      type: 'report',
      title: 'Init report: demo',
      body: '…',
      createdBy: 'wolf-init',
      tags: ['wolf-init', 'onboarding-v2'],
    });
    const { object } = await createWorkThread(deps, {
      title: BOOTSTRAP_THREAD_TITLE,
      goal: 'g',
      createdBy: 'user:test',
    });

    const report = await generateRecap({ store: deps.store });

    expect(report.onboarding).toEqual({ kind: 'continue', threadId: object.id });
  });

  // §3 правило 2/Q4: paused — тишина, даже при активном init-report
  it('onboarding: silence when thread paused even with active init-report', async () => {
    const deps = mkDeps();
    await addMemoryObject(deps, {
      type: 'report',
      title: 'Init report: demo',
      body: '…',
      createdBy: 'wolf-init',
      tags: ['wolf-init', 'onboarding-v2'],
    });
    const { object } = await createWorkThread(deps, {
      title: BOOTSTRAP_THREAD_TITLE,
      goal: 'g',
      createdBy: 'user:test',
    });
    await transitionMemoryObject(deps, object.id, 'paused', 'user:test');

    const report = await generateRecap({ store: deps.store });

    expect(report.onboarding).toBeNull();
    expect(renderRecap(report)).not.toContain('## Onboarding');
  });

  it('onboarding: silence when thread completed or archived', async () => {
    for (const finalStatus of ['completed', 'archived'] as const) {
      const deps = mkDeps();
      const { object } = await createWorkThread(deps, {
        title: BOOTSTRAP_THREAD_TITLE,
        goal: 'g',
        createdBy: 'user:test',
      });
      await transitionMemoryObject(deps, object.id, finalStatus, 'user:test');

      const report = await generateRecap({ store: deps.store });
      expect(report.onboarding).toBeNull();
      expect(renderRecap(report)).not.toContain('## Onboarding');
    }
  });
});
