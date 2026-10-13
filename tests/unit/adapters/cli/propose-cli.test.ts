// tests/unit/adapters/cli/propose-cli.test.ts
// Волна 2.17 T-09 (test-plan §REQ-08 AC1/AC3, §REQ-09): CLI-группа
// `wolf propose` (add/deliver/list) — тонкая обёртка над saveProposal/
// deliverProposal; ADR-5: --created-by не экспортируется (скрытая ловушка);
// generic list показывает признак предложения (фасет); `face new
// --from-proposal` пишет relation proposes. Паттерн D12/Q11 (face-cli.test.ts):
// vitest-воркеры не умеют process.chdir — мокаем cwd.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createCliContainer } from '../../../../src/bootstrap/container.js';
import { JsonlRelationLog } from '../../../../src/adapters/fs/jsonl-relation-log.js';
import { relationsPath } from '../../../../src/adapters/fs/project-paths.js';
import type { MemoryObject } from '../../../../src/domain/schemas/memory-object-schema.js';
import { UserFacingError } from '../../../../src/domain/errors.js';

const STEWARD_ENV: NodeJS.ProcessEnv = { WOLF_ACTOR: 'agent:steward' };

const ADD = [
  '--addressee',
  'user:owner',
  '--basis',
  'ideas filed as complaints',
  '--change',
  'use the proposal signal instead',
  '--benefit',
  'clean complaint funnel',
  '--bounds',
  'core types only',
];

interface ProposalNote extends MemoryObject {
  facet: string;
  addressee: string;
  delivered_at?: string;
}

describe('wolf propose (T-09: REQ-08/REQ-09 CLI)', () => {
  let dir: string;
  let cwdMock: ReturnType<typeof vi.spyOn>;
  let logs: string[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-propose-cli-'));
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    cwdMock.mockRestore();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  async function runPropose(args: string[]): Promise<string> {
    const { proposeCommand } = await import('../../../../src/adapters/cli/commands/propose.js');
    const cmd = proposeCommand(dir);
    // exitOverride рекурсивно: requiredOption у subcommand без своего callback
    // уходит в process.exit — в тесте нужен throw (CommanderError)
    for (const sub of [cmd, ...cmd.commands]) sub.exitOverride();
    logs = [];
    await cmd.parseAsync(args, { from: 'user' });
    return logs.join('\n');
  }

  async function runFaceNew(args: string[]): Promise<void> {
    const { faceCommand } = await import('../../../../src/adapters/cli/commands/face.js');
    const cmd = faceCommand(dir);
    for (const sub of [cmd, ...cmd.commands]) sub.exitOverride();
    logs = [];
    await cmd.parseAsync(args, { from: 'user' });
  }

  async function proposals(): Promise<ProposalNote[]> {
    return (await createCliContainer(dir).store.list({ facet: 'proposal' })) as ProposalNote[];
  }

  async function relationsOf(predicate: string) {
    const rels = new JsonlRelationLog(relationsPath(dir));
    return (await rels.list({ predicate })).filter((e) => !e.removed);
  }

  it('propose add: сохраняет note+facet=proposal с контрактом, автор из env (ADR-5)', async () => {
    vi.stubEnv('WOLF_ACTOR', 'agent:worker-implementer');
    const out = await runPropose(['add', ...ADD, 'тело предложения']);

    const list = await proposals();
    expect(list).toHaveLength(1);
    const note = list[0]!;
    expect(note.type).toBe('note');
    expect(note.facet).toBe('proposal');
    expect(note.addressee).toBe('user:owner');
    expect(note.created_by).toBe('agent:worker-implementer');
    expect(note.delivered_at).toBeUndefined();
    expect(out).toContain(note.id);
  });

  it('propose add без --bounds: commander требует опцию (CR-2026-10-13-01)', async () => {
    const noBounds = ADD.filter((_, i) => i < ADD.lastIndexOf('--bounds'));
    await expect(runPropose(['add', ...noBounds])).rejects.toThrow(/--bounds/);
  });

  it('--created-by — скрытая ловушка ADR-5: явный отказ', async () => {
    vi.stubEnv('WOLF_ACTOR', 'agent:worker-implementer');
    await expect(runPropose(['add', ...ADD, '--created-by', 'user:owner'])).rejects.toThrow(/--created-by/);
    expect(await proposals()).toHaveLength(0);
  });

  it('propose deliver + list: pending/delivered маркеры и фильтр --addressee (REQ-08 AC1, REQ-09 AC4)', async () => {
    vi.stubEnv('WOLF_ACTOR', 'agent:worker-implementer');
    await runPropose(['add', ...ADD]);
    const id = (await proposals())[0]!.id;

    let out = await runPropose(['list']);
    expect(out).toContain(id);
    expect(out).toContain('[pending]');
    expect(out).toContain('user:owner');

    await runPropose(['deliver', id]);
    out = await runPropose(['list']);
    expect(out).toContain('[delivered]');
    expect(out).not.toContain('[pending]');

    out = await runPropose(['list', '--pending']);
    expect(out).not.toContain(id);
    out = await runPropose(['list', '--delivered']);
    expect(out).toContain(id);
    // фильтр по адресату: другой адресат — пусто
    out = await runPropose(['list', '--addressee', 'agent:steward']);
    expect(out).not.toContain(id);

    // повторная доставка через CLI — та же семантика отказа
    await expect(runPropose(['deliver', id])).rejects.toThrow(/already delivered/i);
  });

  it('generic list показывает признак предложения: [note] [proposal] (REQ-08 AC1)', async () => {
    vi.stubEnv('WOLF_ACTOR', 'agent:worker-implementer');
    await runPropose(['add', ...ADD]);
    const id = (await proposals())[0]!.id;

    const { runListAction } = await import('../../../../src/adapters/cli/commands/memory-list.js');
    logs = [];
    await runListAction({});
    const line = logs.find((l) => l.startsWith(id)) ?? '';
    expect(line).toContain('[note]');
    expect(line).toContain('[proposal]');
  });

  it('face new --from-proposal: relation (proposes, proposal, faceNew) + инверсия proposed_by', async () => {
    vi.stubEnv('WOLF_ACTOR', 'agent:worker-implementer');
    await runPropose(['add', ...ADD]);
    const proposalId = (await proposals())[0]!.id;

    vi.unstubAllEnvs();
    vi.stubEnv('WOLF_ACTOR', 'agent:steward');
    await runFaceNew([
      'new',
      'skill:demo',
      '--body',
      '# demo face v1',
      '--reason',
      'apply the proposal',
      '--minimal-change',
      'triage wording',
      '--boundaries',
      'essence stays',
      '--example-helps',
      'faster routing',
      '--example-keep',
      'no rule edits',
      '--verification',
      'face history',
      '--rollback',
      'face restore',
      '--from-proposal',
      proposalId,
    ]);

    const { store } = createCliContainer(dir);
    const faces = (await store.list({ type: 'face' })).filter(
      (o) => (o as { owner_skill?: string }).owner_skill === 'skill:demo'
    );
    expect(faces).toHaveLength(1);

    const proposes = await relationsOf('proposes');
    expect(proposes).toContainEqual(
      expect.objectContaining({ subject: proposalId, predicate: 'proposes', object: faces[0]!.id })
    );
    const inverse = await relationsOf('proposed_by');
    expect(inverse).toContainEqual(
      expect.objectContaining({ subject: faces[0]!.id, predicate: 'proposed_by', object: proposalId })
    );
  });

  it('face new --from-proposal с несуществующим id — отказ', async () => {
    vi.stubEnv('WOLF_ACTOR', 'agent:steward');
    await expect(
      runFaceNew([
        'new',
        'skill:demo',
        '--body',
        '# demo face v1',
        '--reason',
        'apply the proposal',
        '--minimal-change',
        'triage wording',
        '--boundaries',
        'essence stays',
        '--example-helps',
        'faster routing',
        '--example-keep',
        'no rule edits',
        '--verification',
        'face history',
        '--rollback',
        'face restore',
        '--from-proposal',
        'mem_20260101_missing_abcdef',
      ])
    ).rejects.toThrow(UserFacingError);
  });
});
