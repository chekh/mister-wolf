import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { scaffoldFrame } from '../../../src/app/use-cases/scaffold-agent.js';
import { createFaceVersion } from '../../../src/app/use-cases/create-face-version.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { JsonlRelationLog } from '../../../src/adapters/fs/jsonl-relation-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { FsFileSystem } from '../../../src/adapters/fs/fs-file-system.js';
import { eventsPath, relationsPath } from '../../../src/adapters/fs/project-paths.js';
import { UserFacingError } from '../../../src/domain/errors.js';

// R-13b: обычный scaffold — самодостаточный каркас без объекта памяти;
// --from-playbook сохраняет прежнее поведение (id, связь owner_skill, ссылка в тексте).
describe('scaffoldFrame', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let relations: JsonlRelationLog;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-scaffold-'));
    store = new MarkdownMemoryStore(dir);
    relations = new JsonlRelationLog(relationsPath(dir));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function makeDeps() {
    return {
      store,
      log: new JsonlEventLog(eventsPath(dir)),
      clock: new SystemClock(),
      idGen: new HashIdGenerator(),
      relations,
      fs: new FsFileSystem(),
      baseDir: dir,
    };
  }

  /** Самодостаточность каркаса: без agent-id-маркера и router/plugin-текстов. */
  function expectSelfSufficient(framePath: string): string {
    const frame = readFileSync(join(dir, framePath), 'utf-8');
    expect(frame).not.toContain('agent-id:');
    expect(frame).not.toContain('wolf-router');
    expect(frame).not.toContain('plugin');
    return frame;
  }

  function liveFace(deps: ReturnType<typeof makeDeps>, ownerSkill: string) {
    return createFaceVersion(
      { store, log: deps.log, clock: deps.clock, idGen: deps.idGen, env: { WOLF_ACTOR: 'agent:steward' } },
      {
        command: 'new',
        ownerSkill,
        reason: 'live face',
        body: 'Live body.',
        minimalChange: 'w',
        boundaries: 'b',
        exampleHelps: 'h',
        exampleKeep: 'k',
        verification: 'v',
        rollback: 'r',
      }
    );
  }

  it('agent без --from-playbook: самодостаточная рамка, объекты памяти не создаются', async () => {
    const result = await scaffoldFrame(makeDeps(), { kind: 'agent', name: 'demo-agent', createdBy: 'user:test' });
    expect(result.playbookId).toBeUndefined();
    expect(result.ownerSkill).toBe('demo-agent');
    expect(result.framePath).toBe(join('.opencode', 'agents', 'demo-agent.md'));

    const frame = expectSelfSufficient(result.framePath);
    expect(frame).toContain('mode: all');
    expect(frame).toContain('temperature: 0.2');
    expect(frame).not.toContain('model:'); // модель не задана — строки нет
    expect(frame).toContain('You are demo-agent');

    // store пуст: ни face, ни note-заглушки
    expect(await store.list({ type: 'face' })).toHaveLength(0);
    expect(await store.list({ type: 'note' })).toHaveLength(0);
    expect(existsSync(relationsPath(dir))).toBe(false); // связывать нечего

    // идемпотентность
    await expect(
      scaffoldFrame(makeDeps(), { kind: 'agent', name: 'demo-agent', createdBy: 'user:test' })
    ).rejects.toThrow(UserFacingError);
    await expect(
      scaffoldFrame(makeDeps(), { kind: 'agent', name: 'demo-agent', createdBy: 'user:test' })
    ).rejects.toThrow(/already exists/);
  });

  it('agent: явные --persona/--model попадают в рамку', async () => {
    const result = await scaffoldFrame(makeDeps(), {
      kind: 'agent',
      name: 'p-agent',
      persona: 'Персона Х',
      model: 'test/model-x',
      createdBy: 'user:test',
    });
    const frame = expectSelfSufficient(result.framePath);
    expect(frame).toContain('Персона Х');
    expect(frame).toContain('model: test/model-x');
  });

  it('живое лицо того же owner_skill не блокирует scaffold (D-B4)', async () => {
    const deps = makeDeps();
    const live = await liveFace(deps, 'demo-agent');

    const result = await scaffoldFrame(deps, { kind: 'agent', name: 'demo-agent', createdBy: 'user:test' });
    expect(result.playbookId).toBeUndefined();
    expectSelfSufficient(result.framePath);

    const faces = await store.list({ type: 'face' });
    expect(faces).toHaveLength(1);
    expect(faces[0]?.id).toBe(live.face.id);
    expect(faces[0]?.body).toBe('Live body.');
  });

  it('--from-playbook: face-источник — id переиспользуется, связь owner_skill и ссылка в тексте', async () => {
    const deps = makeDeps();
    const created = await liveFace(deps, 'skill:migrated');

    const result = await scaffoldFrame(deps, {
      kind: 'agent',
      name: 'new-frame',
      fromPlaybook: created.face.id,
      createdBy: 'user:test',
    });
    expect(result.playbookId).toBe(created.face.id);
    expect(result.ownerSkill).toBe('skill:migrated');

    const frame = expectSelfSufficient(result.framePath);
    expect(frame).toContain(created.face.id);
    expect(await store.list({ type: 'face' })).toHaveLength(1);

    const rels = await relations.list({ subject: created.face.id, predicate: 'owner_skill' });
    expect(rels.map((r) => r.object)).toContain('agent:new-frame');
  });

  it('--from-playbook: несуществующий id → UserFacingError без побочных эффектов', async () => {
    const deps = makeDeps();
    await expect(
      scaffoldFrame(deps, {
        kind: 'agent',
        name: 'x',
        fromPlaybook: 'mem_20260829_nope_000000',
        createdBy: 'user:test',
      })
    ).rejects.toThrow(/Playbook not found/);
    expect(await store.list({ type: 'face' })).toHaveLength(0);
    expect(existsSync(join(dir, '.opencode', 'agents', 'x.md'))).toBe(false);
  });

  it('skill/command без --from-playbook: самодостаточные тексты; с --from-playbook — id в результате и тексте', async () => {
    const deps = makeDeps();
    const skill = await scaffoldFrame(deps, { kind: 'skill', name: 'demo-skill', createdBy: 'user:test' });
    expect(skill.playbookId).toBeUndefined();
    expect(skill.framePath).toBe(join('.opencode', 'skills', 'demo-skill', 'SKILL.md'));
    const skillText = expectSelfSufficient(skill.framePath);
    expect(skillText).toContain('name: demo-skill');
    expect(skillText).toContain('fill in the methodology');

    const command = await scaffoldFrame(deps, { kind: 'command', name: 'demo-command', createdBy: 'user:test' });
    expect(command.playbookId).toBeUndefined();
    expect(command.framePath).toBe(join('.opencode', 'command', 'demo-command.md'));
    const commandText = expectSelfSufficient(command.framePath);
    expect(commandText).toContain('Execute: $ARGUMENTS');

    const created = await liveFace(deps, 'skill:legacy');
    const legacy = await scaffoldFrame(deps, {
      kind: 'skill',
      name: 'legacy-frame',
      fromPlaybook: created.face.id,
      createdBy: 'user:test',
    });
    expect(legacy.playbookId).toBe(created.face.id);
    expect(expectSelfSufficient(legacy.framePath)).toContain(created.face.id);
  });
});
