import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getThreadBrief } from '../../../src/app/use-cases/get-thread-brief.js';
import { createWorkThread } from '../../../src/app/use-cases/create-work-thread.js';
import { createInfoRequest } from '../../../src/app/use-cases/create-info-request.js';
import { createArticle } from '../../../src/app/use-cases/create-article.js';
import { createDecision } from '../../../src/app/use-cases/create-decision.js';
import { createBlocker } from '../../../src/app/use-cases/create-blocker.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

describe('getThreadBrief', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-thread-brief-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('assembles a brief from a thread, info request, and article', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const { object: thread } = await createWorkThread(
      { store, log, clock, idGen },
      {
        title: 'Onboarding flow',
        goal: 'Build a self-service onboarding flow for new users.',
        currentState: 'Requirements drafted.',
        nextSteps: ['Design wireframes', 'Review with team'],
        createdBy: 'user:test',
      }
    );

    const { object: request } = await createInfoRequest(
      { store, log, clock, idGen },
      {
        title: 'Auth provider choice',
        thread: thread.id,
        question: 'Should we use OAuth2 or SAML?',
        detourReason: 'Blocks the login step design.',
        expectedAnswer: ['Recommended provider', 'Rationale'],
        createdBy: 'user:test',
      }
    );

    const { object: article } = await createArticle(
      { store, log, clock, idGen },
      {
        title: 'Onboarding research',
        thread: thread.id,
        summary: 'Collected competitor onboarding patterns.',
        body: 'Full research notes go here.',
        createdBy: 'user:test',
      }
    );

    const { object: decision } = await createDecision(
      { store, log, clock, idGen },
      {
        title: 'Use OAuth2',
        body: 'OAuth2 is simpler to integrate and maintain.',
        thread: thread.id,
        createdBy: 'user:test',
      }
    );

    const { object: blocker } = await createBlocker(
      { store, log, clock, idGen },
      {
        title: 'No test environment',
        impact: 'Cannot validate the login flow end-to-end.',
        workaround: 'Use a staging account for manual testing.',
        thread: thread.id,
        createdBy: 'user:test',
      }
    );

    const { object: resolvedBlocker } = await createBlocker(
      { store, log, clock, idGen },
      {
        title: 'Resolved dependency issue',
        impact: 'Package was temporarily unavailable.',
        thread: thread.id,
        createdBy: 'user:test',
      }
    );
    await store.update(resolvedBlocker.id, { status: 'resolved' });

    const brief = await getThreadBrief({ store }, thread.id);

    expect(brief.thread.id).toBe(thread.id);
    expect(brief.openInfoRequests.map((r) => r.id)).toContain(request.id);
    expect(brief.articles.map((a) => a.id)).toContain(article.id);
    expect(brief.decisions.map((d) => d.id)).toContain(decision.id);
    expect(brief.blockers.map((b) => b.id)).toContain(blocker.id);
    expect(brief.blockers.map((b) => b.id)).not.toContain(resolvedBlocker.id);
    expect(brief.rendered).toContain(thread.title);
    expect(brief.rendered).toContain(request.title);
    expect(brief.rendered).toContain(article.title);
    expect(brief.rendered).toContain(request.question);
    expect(brief.rendered).toContain(article.summary);
    expect(brief.rendered).toContain(decision.title);
    expect(brief.rendered).toContain(blocker.title);
    expect(brief.rendered).toContain('## Decisions');
    expect(brief.rendered).toContain('## Blockers');
    expect(brief.rendered).not.toContain(resolvedBlocker.title);
  });
});
