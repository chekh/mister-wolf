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
import { recordRelation } from './record-relation.js';

/** Playbook-источник рамки (--from-playbook): лицо — type 'face'; legacy — note+facet howto
 * (старые файлы читаются как note — alias) и старый тип playbook. */
function isPlaybookNote(pb: MemoryObject | null): pb is MemoryObject {
  if (!pb) return false;
  return (
    pb.type === 'face' ||
    pb.type === 'playbook' ||
    (pb.type === 'note' &&
      ((pb as { facet?: string }).facet === 'howto' || (pb as { alias_origin?: string }).alias_origin === 'playbook'))
  );
}

export const SCAFFOLD_KINDS = ['agent', 'skill', 'command', 'artifact'] as const;
export type ScaffoldKind = (typeof SCAFFOLD_KINDS)[number];

export interface ScaffoldFrameInput {
  kind: ScaffoldKind;
  name: string;
  persona?: string;
  model?: string;
  fromPlaybook?: string;
  createdBy: string;
}

export interface ScaffoldFrameResult {
  /** Id playbook-источника (--from-playbook). Без него каркас самодостаточен:
   * объект памяти не создаётся и поле undefined (R-13b). */
  playbookId?: string;
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
  return `You are ${name}. Follow the methodology in this file.`;
}

function frameContent(input: ScaffoldFrameInput): string {
  const playbookId = input.fromPlaybook;
  const description = playbookId
    ? `${input.name} frame: methodology content is in Wolf memory (playbook ${playbookId})`
    : `${input.name} frame: fill in the methodology in this file`;
  if (input.kind === 'agent') {
    const persona =
      input.persona?.trim() !== '' && input.persona !== undefined ? input.persona.trim() : defaultPersona(input.name);
    const model = input.model?.trim() !== '' && input.model !== undefined ? input.model.trim() : undefined;
    return [
      '---',
      `description: ${description}`,
      'mode: all',
      ...(model ? [`model: ${model}`] : []),
      'temperature: 0.2',
      '---',
      '',
      persona,
      '',
    ].join('\n');
  }
  if (input.kind === 'skill') {
    const body = playbookId
      ? `The methodology content is in Wolf memory (playbook ${playbookId}); this file is only a frame.`
      : 'This file is only a frame: fill in the methodology here.';
    return [
      '---',
      `name: ${input.name}`,
      `description: ${description}.`,
      '---',
      '',
      `# ${input.name} — frame skill`,
      '',
      body,
      '',
    ].join('\n');
  }
  const body = playbookId
    ? `The methodology content is in Wolf memory (playbook ${playbookId}).`
    : 'Fill in the methodology in this file.';
  return [
    '---',
    `description: ${description}. Usage: /${input.name} <task>`,
    `agent: ${input.name}`,
    '---',
    'Execute: $ARGUMENTS',
    '',
    body,
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
    // Идемпотентность до любых записей.
    if (await deps.fs.exists(join(deps.baseDir, framePath))) {
      throw new UserFacingError(`${framePath} already exists`);
    }

    let playbookId: string | undefined;
    let ownerSkill: string;
    if (input.fromPlaybook) {
      const pb = await deps.store.get(input.fromPlaybook);
      if (!isPlaybookNote(pb)) {
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
      // R-13b: без --from-playbook объект памяти не создаётся — каркас самодостаточен;
      // живое лицо того же owner_skill не блокирует (штатный контур лица — Стюард, wolf face new).
      ownerSkill = input.name;
    }

    await deps.fs.writeFile(join(deps.baseDir, framePath), frameContent(input));

    // Связывать нечего без playbook-источника.
    if (deps.relations && playbookId !== undefined) {
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
