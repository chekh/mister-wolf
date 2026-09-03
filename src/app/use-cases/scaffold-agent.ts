import { join } from 'path';
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { RelationLog } from '../../ports/relation-log.port.js';
import { FileSystem } from '../../ports/file-system.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { MemoryTypeDeclaration } from '../../domain/memory-types.js';
import { UserFacingError } from '../../domain/errors.js';
import { addMemoryObject } from './add-memory-object.js';
import { recordRelation } from './record-relation.js';

export const SCAFFOLD_KINDS = ['agent', 'skill', 'command'] as const;
export type ScaffoldKind = (typeof SCAFFOLD_KINDS)[number];

export const DEFAULT_SCAFFOLD_MODEL = 'zai-coding-plan/glm-5.3';

export interface ScaffoldFrameInput {
  kind: ScaffoldKind;
  name: string;
  persona?: string;
  model?: string;
  fromPlaybook?: string;
  createdBy: string;
}

export interface ScaffoldFrameResult {
  playbookId: string;
  ownerSkill: string;
  /** Путь рамки относительно baseDir. */
  framePath: string;
}

/** Каталог command — единственного числа (.opencode/command/), agents и skills — как в opencode. */
export function frameRelativePath(kind: ScaffoldKind, name: string): string {
  if (kind === 'agent') return join('.opencode', 'agents', `${name}.md`);
  if (kind === 'skill') return join('.opencode', 'skills', name, 'SKILL.md');
  return join('.opencode', 'command', `${name}.md`);
}

function defaultPersona(name: string): string {
  return `You are ${name}. Work strictly by the playbook delivered by the plugin into the system prompt.`;
}

function frameContent(input: ScaffoldFrameInput, ownerSkill: string, playbookId: string): string {
  const description = `${input.name} frame: works by a playbook from Wolf memory (delivered by the wolf-router plugin)`;
  if (input.kind === 'agent') {
    const persona =
      input.persona?.trim() !== '' && input.persona !== undefined ? input.persona.trim() : defaultPersona(input.name);
    const model = input.model?.trim() !== '' && input.model !== undefined ? input.model.trim() : DEFAULT_SCAFFOLD_MODEL;
    // agent-id обязан быть в ТЕЛЕ (frontmatter не попадает в system-промпт) — грабля opencode.
    return [
      '---',
      `description: ${description}`,
      'mode: all',
      `model: ${model}`,
      'temperature: 0.2',
      '---',
      `agent-id: ${ownerSkill}`,
      '',
      persona,
      '',
    ].join('\n');
  }
  if (input.kind === 'skill') {
    return [
      '---',
      `name: ${input.name}`,
      `description: ${description}.`,
      '---',
      '',
      `# ${input.name} — frame skill`,
      '',
      `The methodology content is in Wolf memory (playbook ${playbookId}); this file is only a frame.`,
      'Work strictly by the playbook delivered by the plugin into the system prompt.',
      '',
    ].join('\n');
  }
  return [
    '---',
    `description: ${description}. Usage: /${input.name} <task>`,
    `agent: ${input.name}`,
    '---',
    'Execute: $ARGUMENTS',
    '',
    'Work strictly by the playbook from Wolf memory (delivered by the wolf-router plugin).',
    '',
  ].join('\n');
}

export async function scaffoldFrame(
  deps: {
    store: MemoryStore;
    log: EventLog;
    clock: Clock;
    idGen: IdGenerator;
    index?: SearchIndex;
    relations?: RelationLog;
    lock?: MemoryLock;
    declarations?: readonly MemoryTypeDeclaration[];
    fs: FileSystem;
    baseDir: string;
  },
  input: ScaffoldFrameInput
): Promise<ScaffoldFrameResult> {
  const run = async (): Promise<ScaffoldFrameResult> => {
    const framePath = frameRelativePath(input.kind, input.name);
    // Идемпотентность ДО создания playbook — чтобы не плодить объекты-сироты.
    if (await deps.fs.exists(join(deps.baseDir, framePath))) {
      throw new UserFacingError(`${framePath} already exists`);
    }

    let playbookId: string;
    let ownerSkill: string;
    if (input.fromPlaybook) {
      const pb = await deps.store.get(input.fromPlaybook);
      if (!pb || pb.type !== 'playbook') {
        throw new UserFacingError(`Playbook not found: ${input.fromPlaybook}`);
      }
      playbookId = pb.id;
      const existing = pb as MemoryObject & { owner_skill?: unknown };
      // legacy-формат owner_skill (skill:xxx) разрешён как есть
      ownerSkill =
        typeof existing.owner_skill === 'string' && existing.owner_skill.trim() !== ''
          ? existing.owner_skill
          : input.name;
    } else {
      const { object } = await addMemoryObject(
        {
          store: deps.store,
          log: deps.log,
          clock: deps.clock,
          idGen: deps.idGen,
          index: deps.index,
          declarations: deps.declarations,
        },
        {
          type: 'playbook',
          title: `Playbook: ${input.name}`,
          body: `Scaffold stub for the ${input.kind}:${input.name} frame. Fill in steps and methodology.`,
          createdBy: input.createdBy,
          extra: {
            steps: ['Fill in the playbook steps (scaffold stub)'],
            owner_skill: input.name,
            version: 'v1',
          },
        }
      );
      playbookId = object.id;
      ownerSkill = input.name;
    }

    await deps.fs.writeFile(join(deps.baseDir, framePath), frameContent(input, ownerSkill, playbookId));

    if (deps.relations) {
      await recordRelation(
        { relations: deps.relations, idGen: deps.idGen },
        deps.clock.now(),
        playbookId,
        'owner_skill',
        `${input.kind}:${input.name}`
      );
    }

    return { playbookId, ownerSkill, framePath };
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}
