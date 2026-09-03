import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { scaffoldFrame } from '../../../src/app/use-cases/scaffold-agent.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { JsonlRelationLog } from '../../../src/adapters/fs/jsonl-relation-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { FsFileSystem } from '../../../src/adapters/fs/fs-file-system.js';
import { eventsPath, relationsPath } from '../../../src/adapters/fs/project-paths.js';
import { UserFacingError } from '../../../src/domain/errors.js';

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

  it('scaffold agent: создаёт playbook + рамку с маркером agent-id и frontmatter', async () => {
    const result = await scaffoldFrame(makeDeps(), { kind: 'agent', name: 'demo-agent', createdBy: 'user:test' });
    expect(result.playbookId).toMatch(/^mem_/);
    expect(result.ownerSkill).toBe('demo-agent');
    expect(result.framePath).toBe(join('.opencode', 'agents', 'demo-agent.md'));

    const pb = await store.get(result.playbookId);
    expect(pb?.type).toBe('playbook');
    const extra = pb as { owner_skill?: string; version?: string; steps?: string[] };
    expect(extra.owner_skill).toBe('demo-agent');
    expect(extra.version).toBe('v1');
    expect(extra.steps).toHaveLength(1);

    const frame = readFileSync(join(dir, result.framePath), 'utf-8');
    expect(frame).toContain('agent-id: demo-agent');
    expect(frame).toContain('mode: all');
    expect(frame).toContain('model: zai-coding-plan/glm-5.3');
    expect(frame).toContain('temperature: 0.2');
    expect(frame).toContain('You are demo-agent. Work strictly by the playbook');

    const rels = await relations.list({ subject: result.playbookId });
    expect(rels.map((r) => `${r.predicate}:${r.object}`)).toContain('owner_skill:agent:demo-agent');
  });

  it('--persona и --model попадают в рамку', async () => {
    const result = await scaffoldFrame(makeDeps(), {
      kind: 'agent',
      name: 'p-agent',
      persona: 'Персона Х',
      model: 'test/model-x',
      createdBy: 'user:test',
    });
    const frame = readFileSync(join(dir, result.framePath), 'utf-8');
    expect(frame).toContain('Персона Х');
    expect(frame).toContain('model: test/model-x');
  });

  it('идемпотентность: существующая рамка → UserFacingError, playbook не дублируется', async () => {
    const deps = makeDeps();
    const first = await scaffoldFrame(deps, { kind: 'agent', name: 'demo-agent', createdBy: 'user:test' });
    await expect(scaffoldFrame(deps, { kind: 'agent', name: 'demo-agent', createdBy: 'user:test' })).rejects.toThrow(
      UserFacingError
    );
    await expect(scaffoldFrame(deps, { kind: 'agent', name: 'demo-agent', createdBy: 'user:test' })).rejects.toThrow(
      /already exists/
    );
    const playbooks = await store.list({ type: 'playbook' });
    expect(playbooks).toHaveLength(1);
    expect(playbooks[0]?.id).toBe(first.playbookId);
  });

  it('--from-playbook: использует существующий playbook, новый не создаётся, маркер = owner_skill', async () => {
    const deps = makeDeps();
    const first = await scaffoldFrame(deps, { kind: 'agent', name: 'orig-agent', createdBy: 'user:test' });
    const second = await scaffoldFrame(deps, {
      kind: 'agent',
      name: 'new-frame',
      fromPlaybook: first.playbookId,
      createdBy: 'user:test',
    });
    expect(second.playbookId).toBe(first.playbookId);
    expect(second.ownerSkill).toBe('orig-agent');
    const frame = readFileSync(join(dir, second.framePath), 'utf-8');
    expect(frame).toContain('agent-id: orig-agent');
    expect(await store.list({ type: 'playbook' })).toHaveLength(1);
    const rels = await relations.list({ subject: first.playbookId, predicate: 'owner_skill' });
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
    expect(await store.list({ type: 'playbook' })).toHaveLength(0);
  });

  it('skill и command пишутся в правильные каталоги', async () => {
    const deps = makeDeps();
    const skill = await scaffoldFrame(deps, { kind: 'skill', name: 'demo-skill', createdBy: 'user:test' });
    expect(skill.framePath).toBe(join('.opencode', 'skills', 'demo-skill', 'SKILL.md'));
    const skillText = readFileSync(join(dir, skill.framePath), 'utf-8');
    expect(skillText).toContain('name: demo-skill');
    expect(skillText).toContain('description:');

    const command = await scaffoldFrame(deps, { kind: 'command', name: 'demo-command', createdBy: 'user:test' });
    expect(command.framePath).toBe(join('.opencode', 'command', 'demo-command.md'));
    expect(existsSync(join(dir, '.opencode', 'command', 'demo-command.md'))).toBe(true);
  });
});
