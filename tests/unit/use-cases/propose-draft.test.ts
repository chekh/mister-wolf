import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  proposeDraft,
  mechanicalDraftGenerator,
  type DraftGenerator,
} from '../../../src/app/use-cases/propose-draft.js';
import type { PatternSummary } from '../../../src/app/use-cases/pattern-detection.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';
import { MECHANICAL_ADVICE } from '../../../src/domain/mechanical-advice.js';
import { UserFacingError } from '../../../src/domain/errors.js';

function patternsFor(key: string, count: number): PatternSummary[] {
  return [
    {
      key,
      count,
      first_ts: '2026-08-30T10:00:00.000Z',
      last_ts: '2026-08-30T11:00:00.000Z',
      evidence: Array.from({ length: count }, (_, i) => `session-metrics.jsonl:${i + 1}`),
    },
  ];
}

describe('proposeDraft (Ф22 D2.2)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-propose-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function makeDeps() {
    return {
      store: new MarkdownMemoryStore(dir),
      log: new JsonlEventLog(eventsPath(dir)),
      clock: new SystemClock(),
      idGen: new HashIdGenerator(),
    };
  }

  it('(а) механический propose из tool-паттерна: lesson proposed с констрейнтом и манифестом', async () => {
    const deps = makeDeps();
    const { object } = await proposeDraft(deps, {
      patternKey: 'bash:timeout',
      patterns: patternsFor('bash:timeout', 3),
      actor: 'steward:archivist',
    });
    const rec = object as Record<string, unknown>;

    expect(object.type).toBe('lesson');
    expect(object.status).toBe('proposed');
    expect(object.review_state).toBe('proposed');
    expect(object.truth_role).toBe('proposed_knowledge');
    expect(object.tags).toContain('draft');
    expect(rec.mechanical).toBe(true);
    expect(rec.constraint_tool).toBe('bash');
    expect(rec.constraint_class).toBe('timeout');
    expect(rec.polarity).toBe('positive');
    expect(rec.pattern_key).toBe('bash:timeout');
    expect(rec.pattern_count).toBe(3);
    expect(rec.predicted_effect).toBe('prevention of bash:timeout recurrences');
    expect(rec.risk_level).toBe('low');
    expect(object.body).toContain('Recurring error bash:timeout 3 times — rule:');
    expect(object.body).toContain(MECHANICAL_ADVICE.timeout!);
    expect(object.body).toContain(
      'evidence: session-metrics.jsonl:1, session-metrics.jsonl:2, session-metrics.jsonl:3'
    );
    expect(rec.trigger_keywords).toEqual(['bash', 'timeout']);

    // YAML round-trip: поля переживают запись/чтение стора
    const reread = (await deps.store.get(object.id)) as Record<string, unknown>;
    expect(reread.pattern_key).toBe('bash:timeout');
    expect(reread.constraint_tool).toBe('bash');
    expect(reread.trigger_keywords).toEqual(['bash', 'timeout']);

    // создано через addMemoryObject: событие memory.added с actor
    const events = readFileSync(eventsPath(dir), 'utf-8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { type: string; actor: string; payload: { memory_id: string } });
    const added = events.find((e) => e.type === 'memory.added');
    expect(added?.actor).toBe('steward:archivist');
    expect(added?.payload.memory_id).toBe(object.id);
  });

  it('(б) кастомный DraftGenerator: объект создаётся из генератора (LLM за интерфейсом)', async () => {
    const deps = makeDeps();
    const mock: DraftGenerator = {
      async generate(input) {
        return {
          type: 'rule',
          title: `LLM draft: ${input.patternKey}`,
          body: 'сгенерировано подключаемым генератором',
          triggerKeywords: ['llm', 'kw'],
          mechanical: false,
          polarity: input.polarity,
          constraint: null,
          manifest: {
            predicted_effect: 'эффект от LLM-правила',
            regression_risks: ['риск LLM-генерации'],
            blast_radius: 'low',
            risk_level: 'low',
          },
        };
      },
    };
    const { object } = await proposeDraft(deps, {
      patternKey: 'bash:timeout',
      patterns: patternsFor('bash:timeout', 5),
      actor: 'steward:archivist',
      generator: mock,
    });
    const rec = object as Record<string, unknown>;

    expect(object.type).toBe('rule');
    expect(object.title).toBe('LLM draft: bash:timeout');
    expect(object.body).toBe('сгенерировано подключаемым генератором');
    expect(rec.mechanical).toBe(false);
    expect(rec.scope).toBe('project'); // enum-поле rule заполнено
    expect(rec.pattern_key).toBe('bash:timeout'); // dedup-поля на месте
    expect(rec.pattern_count).toBe(5);
    expect(rec.trigger_keywords).toEqual(['llm', 'kw']);
    // механический генератор не вызывался (текст не из шаблона)
    expect(mechanicalDraftGenerator()).toBeDefined();
  });

  it('(в) неизвестный ключ паттерна → UserFacingError со списком активных', async () => {
    const deps = makeDeps();
    await expect(
      proposeDraft(deps, {
        patternKey: 'bash:auth',
        patterns: patternsFor('bash:timeout', 3),
        actor: 'steward:archivist',
      })
    ).rejects.toThrow(UserFacingError);
    await expect(
      proposeDraft(deps, {
        patternKey: 'bash:auth',
        patterns: patternsFor('bash:timeout', 3),
        actor: 'steward:archivist',
      })
    ).rejects.toThrow('active pattern not found: bash:auth; active: bash:timeout');
  });

  it('(г) дедуп: второй propose того же паттерна при живом draft → UserFacingError', async () => {
    const deps = makeDeps();
    const first = await proposeDraft(deps, {
      patternKey: 'bash:timeout',
      patterns: patternsFor('bash:timeout', 3),
      actor: 'steward:archivist',
    });
    await expect(
      proposeDraft(deps, {
        patternKey: 'bash:timeout',
        patterns: patternsFor('bash:timeout', 4),
        actor: 'steward:archivist',
      })
    ).rejects.toThrow(`a draft for the pattern already exists: ${first.object.id} (proposed)`);
  });

  it('(д) --negative: анти-правило с medium-риском и запретом тула', async () => {
    const deps = makeDeps();
    const { object } = await proposeDraft(deps, {
      patternKey: 'bash:timeout',
      patterns: patternsFor('bash:timeout', 3),
      actor: 'steward:archivist',
      polarity: 'negative',
    });
    const rec = object as Record<string, unknown>;

    expect(rec.polarity).toBe('negative');
    expect(object.body).toContain('ANTI-RULE: do not use bash');
    expect(object.body).toContain('class timeout');
    expect(rec.risk_level).toBe('medium');
    expect(rec.blast_radius).toBe('high: bans the tool entirely');
    expect(rec.regression_risks).toEqual(['blocks legitimate tool uses too — the signal log does not see them']);
  });

  it('(е) complaint-паттерн: rule без механики, scope project', async () => {
    const deps = makeDeps();
    const { object } = await proposeDraft(deps, {
      patternKey: 'complaint:skill:demo',
      patterns: patternsFor('complaint:skill:demo', 3),
      actor: 'steward:archivist',
    });
    const rec = object as Record<string, unknown>;

    expect(object.type).toBe('rule');
    expect(rec.mechanical).toBe(false);
    expect(rec.scope).toBe('project');
    expect(rec.constraint_tool).toBeUndefined();
    expect(rec.trigger_keywords).toEqual(['skill:demo']);
    expect(object.body).toContain('Recurring complaint complaint:skill:demo 3 times');
    expect(object.body).toContain('Analyzer (LLM) or a human');
  });
});
