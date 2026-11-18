// tests/integration/learning-candidate-workflow.test.ts
// 3.2.0 T-04 (S-05/S-08/S-09, REQ-05/12): сквозной сценарий контракта кандидата
// через CLI `wolf propose candidate` + реальный store/event-log.
// Путь детерминированный: ни одного модельного вызова по построению (NFR-01).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createCliContainer } from '../../src/bootstrap/container.js';
import { addMemoryObject } from '../../src/app/use-cases/add-memory-object.js';
import { JsonlEventLog } from '../../src/adapters/fs/jsonl-event-log.js';
import { eventsPath } from '../../src/adapters/fs/project-paths.js';
import { UserFacingError } from '../../src/domain/errors.js';
import { LEARNING_CHANGE_TAG } from '../../src/domain/schemas/learning-change-schema.js';
import type { MemoryObject } from '../../src/domain/schemas/memory-object-schema.js';
import { validCandidateInput } from '../unit/domain/learning-fixtures.js';

describe('learning candidate workflow (CLI → store → events)', () => {
  let dir: string;
  let logs: string[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-learning-workflow-'));
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  async function runPropose(args: string[]): Promise<string> {
    const { proposeCommand } = await import('../../src/adapters/cli/commands/propose.js');
    const cmd = proposeCommand(dir);
    for (const sub of [cmd, ...cmd.commands]) sub.exitOverride();
    logs = [];
    await cmd.parseAsync(args, { from: 'user' });
    return logs.join('\n');
  }

  function envelopeFile(name: string, envelope: unknown): string {
    const path = join(dir, name);
    writeFileSync(path, JSON.stringify(envelope), 'utf-8');
    return path;
  }

  async function taggedCandidates(): Promise<MemoryObject[]> {
    const all = (await createCliContainer(dir).store.list({ facet: 'proposal' })) as MemoryObject[];
    return all.filter((o) => (o.tags ?? []).includes(LEARNING_CHANGE_TAG));
  }

  async function addedEvents(): Promise<number> {
    return (await new JsonlEventLog(eventsPath(dir)).readAll()).filter((e) => e.type === 'memory.added').length;
  }

  it('S-05: повтор принятого пакета → тот же кандидат, 0 новых кандидатов, ровно один memory.added', async () => {
    vi.stubEnv('WOLF_ACTOR', 'agent:steward');
    const file = envelopeFile('candidate.json', validCandidateInput());

    const first = await runPropose(['candidate', '--file', file]);
    expect(first).toContain('Learning candidate saved');
    expect(await taggedCandidates()).toHaveLength(1);
    expect(await addedEvents()).toBe(1);

    // повтор той же revision (тот же файл) — дедуп, новых кандидатов нет
    const repeat = await runPropose(['candidate', '--file', file]);
    expect(repeat).toContain('Existing learning candidate returned');
    expect(await taggedCandidates()).toHaveLength(1);
    expect(await addedEvents()).toBe(1);
    // путь детерминированный: никаких событий кроме memory.added (NFR-01)
    const types = (await new JsonlEventLog(eventsPath(dir)).readAll()).map((e) => e.type);
    expect([...new Set(types)]).toEqual(['memory.added']);
  });

  it('S-05: пустая память — кандидатов нет, ничего не создано без явного propose', async () => {
    expect(await taggedCandidates()).toHaveLength(0);
    expect(await addedEvents()).toBe(0);
    // propose list по пустой памяти — пустой результат без создания записей
    const out = await runPropose(['list']);
    expect(out).toContain('No proposals.');
    expect(await taggedCandidates()).toHaveLength(0);
    expect(await addedEvents()).toBe(0);
  });

  it('S-08: конверт без baseline — отказ CLI без записи', async () => {
    vi.stubEnv('WOLF_ACTOR', 'agent:steward');
    const { baseline: _missing, ...withoutBaseline } = validCandidateInput();
    const file = envelopeFile('no-baseline.json', withoutBaseline);

    await expect(runPropose(['candidate', '--file', file])).rejects.toThrow(/baseline/);
    expect(await taggedCandidates()).toHaveLength(0);
    expect(await addedEvents()).toBe(0);
  });

  it('S-08: конверт без applicability/sources — отказ без записи', async () => {
    vi.stubEnv('WOLF_ACTOR', 'agent:steward');
    const noBounds = validCandidateInput();
    noBounds.scope = { ...noBounds.scope, applicability: [] };
    await expect(runPropose(['candidate', '--file', envelopeFile('no-bounds.json', noBounds)])).rejects.toThrow(
      /applicability/
    );

    const noSources = validCandidateInput();
    noSources.sources = [];
    await expect(runPropose(['candidate', '--file', envelopeFile('no-sources.json', noSources)])).rejects.toThrow(
      /sources/
    );
    expect(await taggedCandidates()).toHaveLength(0);
    expect(await addedEvents()).toBe(0);
  });

  it('S-09: повтор revision → прежний candidate; изменённое содержимое с тем же ключом → конфликт', async () => {
    vi.stubEnv('WOLF_ACTOR', 'agent:steward');
    const file = envelopeFile('candidate.json', validCandidateInput());
    await runPropose(['candidate', '--file', file]);
    const firstId = (await taggedCandidates())[0]!.id;

    const repeat = await runPropose(['candidate', '--file', file]);
    expect(repeat).toContain(firstId);

    // тот же request_key (problem/targets/источники не менялись), другой diff
    const changed = validCandidateInput();
    changed.candidate = { ...changed.candidate, sha256: 'e'.repeat(64) };
    await expect(runPropose(['candidate', '--file', envelopeFile('changed.json', changed)])).rejects.toThrow(
      /different content/
    );
    expect(await taggedCandidates()).toHaveLength(1);
    expect((await taggedCandidates())[0]!.id).toBe(firstId);
  });

  it('REQ-12: WOLF_LEARNING_MODE=off → CLI отказывается, работы не создано', async () => {
    vi.stubEnv('WOLF_ACTOR', 'agent:steward');
    vi.stubEnv('WOLF_LEARNING_MODE', 'off');
    const file = envelopeFile('candidate.json', validCandidateInput());

    await expect(runPropose(['candidate', '--file', file])).rejects.toThrow(/learning mode is "off"/);
    expect(await taggedCandidates()).toHaveLength(0);
    expect(await addedEvents()).toBe(0);
  });

  it('REQ-05: поля конверта не проходят через generic add (--set-guard): unknown field отклоняется', async () => {
    vi.stubEnv('WOLF_ACTOR', 'agent:steward');
    const { store, log, clock, idGen } = createCliContainer(dir);
    await expect(
      addMemoryObject(
        { store, log, clock, idGen },
        {
          type: 'note',
          title: 'sneaky envelope',
          createdBy: 'agent:steward',
          facet: 'proposal',
          extra: { phase: 'approved', trial_id: 't1' },
        }
      )
    ).rejects.toThrow(/Unknown field "phase"/);
    expect(await taggedCandidates()).toHaveLength(0);
  });

  it('S-08: битый JSON-файл — читаемая ошибка без записи', async () => {
    vi.stubEnv('WOLF_ACTOR', 'agent:steward');
    const file = join(dir, 'broken.json');
    writeFileSync(file, '{not json', 'utf-8');
    await expect(runPropose(['candidate', '--file', file])).rejects.toThrow(/Cannot read candidate envelope/);
    expect(await taggedCandidates()).toHaveLength(0);
    // UserFacingError — контракт CLI-ошибки
    await expect(runPropose(['candidate', '--file', join(dir, 'missing.json')])).rejects.toThrow(UserFacingError);
  });
});
