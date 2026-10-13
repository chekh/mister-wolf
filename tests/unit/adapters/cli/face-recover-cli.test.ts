import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createCliContainer } from '../../../../src/bootstrap/container.js';
import { createFaceVersion, type FaceObject } from '../../../../src/app/use-cases/create-face-version.js';
import type { FaceFaultInjector } from '../../../../src/app/use-cases/face-operation.js';

// 2.17.1 REQ-03 (R04): CLI-поверхность операции лица — `wolf face new --op-id`,
// `wolf face recover <opId> [--abort]`, candidate скрыт из `face list`
// (design §3.3). Паттерн face-cli.test.ts: мок cwd, атрибуция env.

const STEWARD_ENV: NodeJS.ProcessEnv = { WOLF_ACTOR: 'agent:steward' };
const G17 = {
  minimalChange: 'triage wording only',
  boundaries: 'essence and frame are out',
  exampleHelps: 'faster doc sorting',
  exampleKeep: 'agent never edits rules',
  verification: 'wolf face history',
  rollback: 'wolf face restore',
};
const OWNER = 'skill:demo';

describe('wolf face: --op-id и recover (REQ-03)', () => {
  let dir: string;
  let cwdMock: ReturnType<typeof vi.spyOn>;
  let logs: string[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-face-rec-'));
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

  async function runFace(args: string[]): Promise<string> {
    const { faceCommand } = await import('../../../../src/adapters/cli/commands/face.js');
    await faceCommand().exitOverride().parseAsync(args, { from: 'user' });
    return logs.join('\n');
  }

  async function faces(owner = OWNER): Promise<FaceObject[]> {
    return (await createCliContainer(dir).store.list({ type: 'face' }))
      .filter((o) => (o as FaceObject).owner_skill === owner)
      .map((o) => o as FaceObject);
  }

  function newArgs(opId?: string): string[] {
    return [
      'new',
      OWNER,
      '--reason',
      'clarify triage',
      '--body',
      'body-v2',
      '--minimal-change',
      G17.minimalChange,
      '--boundaries',
      G17.boundaries,
      '--example-helps',
      G17.exampleHelps,
      '--example-keep',
      G17.exampleKeep,
      '--verification',
      G17.verification,
      '--rollback',
      G17.rollback,
      ...(opId ? ['--op-id', opId] : []),
    ];
  }

  /** Незавершённая операция через use-case с fault-seam (CLI seam не экспортирует). */
  async function seedUnfinished(point: string, opId: string): Promise<void> {
    const fault: FaceFaultInjector = (p) => {
      if (p === point) throw new Error(`injected fault at ${p}`);
    };
    vi.stubEnv('WOLF_ACTOR', 'agent:steward');
    await expect(
      createFaceVersion(
        { ...createCliContainer(dir), fault },
        {
          command: 'new',
          ownerSkill: OWNER,
          reason: 'clarify triage',
          body: 'body-v2',
          ...G17,
          opId,
        }
      )
    ).rejects.toThrow(/injected fault/);
  }

  it('face new печатает сгенерированный op id; повтор с тем же --op-id не создаёт вторую версию', async () => {
    vi.stubEnv('WOLF_ACTOR', 'agent:steward');
    const out = await runFace(newArgs());
    expect(out).toMatch(/faceop-\d+-[0-9a-z]{4}/);

    const opId = out.match(/faceop-\d+-[0-9a-z]{4}/)![0]!;
    expect((await faces()).filter((f) => (f as FaceObject).op_id === opId)).toHaveLength(1);

    await runFace(newArgs(opId));
    expect(await faces()).toHaveLength(1); // идемпотентность: одна версия
    const face = (await faces())[0] as FaceObject;
    expect(face.status).toBe('active');
  });

  it('face recover <opId> дозавершает незавершённую операцию', async () => {
    vi.stubEnv('WOLF_ACTOR', 'agent:steward');
    await createFaceVersion(
      { ...createCliContainer(dir) },
      {
        command: 'new',
        ownerSkill: OWNER,
        reason: 'initial',
        body: 'body-v1',
        ...G17,
      }
    );
    await seedUnfinished('g17_record', 'faceop-cli-0001');
    expect((await faces()).find((f) => f.version === '2')!.status).toBe('candidate');

    const out = await runFace(['recover', 'faceop-cli-0001']);
    expect(out).toContain('faceop-cli-0001');
    const v2 = (await faces()).find((f) => f.version === '2')!;
    expect(v2.status).toBe('active');
    expect(await faces()).toHaveLength(2);
  });

  it('face recover <opId> --abort до activation: candidate archived, сообщение', async () => {
    vi.stubEnv('WOLF_ACTOR', 'agent:steward');
    await createFaceVersion(
      { ...createCliContainer(dir) },
      {
        command: 'new',
        ownerSkill: OWNER,
        reason: 'initial',
        body: 'body-v1',
        ...G17,
      }
    );
    await seedUnfinished('add_face', 'faceop-cli-0002');

    const out = await runFace(['recover', 'faceop-cli-0002', '--abort']);
    expect(out).toContain('faceop-cli-0002');
    const candidate = (await faces()).find((f) => f.version === '2')!;
    expect(candidate.status).toBe('archived');
    expect((await faces()).find((f) => f.version === '1')!.status).toBe('active');
  });

  it('face recover --abort после activation отклоняется (только вперёд)', async () => {
    vi.stubEnv('WOLF_ACTOR', 'agent:steward');
    await createFaceVersion(
      { ...createCliContainer(dir) },
      {
        command: 'new',
        ownerSkill: OWNER,
        reason: 'initial',
        body: 'body-v1',
        ...G17,
      }
    );
    await seedUnfinished('activate', 'faceop-cli-0003');

    await expect(runFace(['recover', 'faceop-cli-0003', '--abort'])).rejects.toThrow(/activat|forward|restore/i);
  });

  it('face list: candidate скрыт — головой показывается активный канон', async () => {
    vi.stubEnv('WOLF_ACTOR', 'agent:steward');
    const v1 = await createFaceVersion(
      { ...createCliContainer(dir) },
      {
        command: 'new',
        ownerSkill: OWNER,
        reason: 'initial',
        body: 'body-v1',
        ...G17,
      }
    );
    await seedUnfinished('add_face', 'faceop-cli-0004');

    const out = await runFace(['list']);
    expect(out).toContain(v1.face.id);
    expect(out).toMatch(new RegExp(`${OWNER}\\s+v1\\s+\\S+\\s+\\[active\\]`));
    const candidate = (await faces()).find((f) => f.version === '2')!;
    expect(out).not.toContain(`[candidate]`);
    expect(out).not.toContain(candidate.id);
  });
});
