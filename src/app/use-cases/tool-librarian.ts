import { join, extname, isAbsolute } from 'path';
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { FileSystem } from '../../ports/file-system.port.js';
import { MemoryTypeDeclaration } from '../../domain/memory-types.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { UserFacingError } from '../../domain/errors.js';
import { addMemoryObject } from './add-memory-object.js';
import { transitionMemoryObject } from './transition-memory-object.js';

/** Поля типа tool (extra поверх MemoryObject; см. декларацию в memory-types.ts). */
export interface ToolFields {
  name: string;
  script_path: string;
  language: string;
  contract_input?: string;
  contract_output?: string;
  contract_environment?: string;
  usage_count?: number;
  last_used_at?: string;
  deprecation_reason?: string;
}

export type ToolObject = MemoryObject & ToolFields;

export interface ToolLibrarianDeps {
  store: MemoryStore;
  log: EventLog;
  clock: Clock;
  idGen: IdGenerator;
  index?: SearchIndex;
  lock?: MemoryLock;
  declarations?: readonly MemoryTypeDeclaration[];
  fs: FileSystem;
  baseDir: string;
}

export interface RegisterToolInput {
  scriptPath: string;
  name: string;
  language: string;
  contractIn?: string;
  contractOut?: string;
  contractEnvironment?: string;
  notes?: string;
  force?: boolean;
  createdBy: string;
}

export interface RegisterToolResult {
  toolId: string;
  /** Относительный путь скрипта внутри проекта (.wolf/tools/<name><ext>). */
  scriptPath: string;
  similar: { id: string; name: string; status: string }[];
}

const LIVE_STATUSES = ['candidate', 'active'];

function asTool(obj: MemoryObject): ToolObject {
  return obj as ToolObject;
}

/** Токены для дедупа: lowercase, длина > 3 символов. */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9а-яё_]+/)
      .filter((t) => t.length > 3)
  );
}

async function findSimilar(
  store: MemoryStore,
  input: RegisterToolInput
): Promise<{ id: string; name: string; status: string }[]> {
  const newText = `${input.name} ${input.contractIn ?? ''} ${input.contractOut ?? ''}`;
  const newTokens = tokenize(newText);
  const tools = await store.list({ type: 'tool' });
  const similar: { id: string; name: string; status: string }[] = [];
  for (const obj of tools) {
    if (!LIVE_STATUSES.includes(obj.status)) continue;
    const t = asTool(obj);
    const existingTokens = tokenize(`${t.name} ${t.contract_input ?? ''} ${t.contract_output ?? ''}`);
    const nameMatch = t.name === input.name;
    const tokenMatch = [...newTokens].some((tok) => existingTokens.has(tok));
    if (nameMatch || tokenMatch) similar.push({ id: t.id, name: t.name, status: t.status });
  }
  return similar;
}

/** Валидный идентификатор инструмента (он же имя файла и ключ lookup). */
const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;

/** Резолв ссылки на tool: mem_-id напрямую, иначе уникальное совпадение по полю name. */
async function resolveToolRef(deps: Pick<ToolLibrarianDeps, 'store'>, nameOrId: string): Promise<ToolObject> {
  if (nameOrId.startsWith('mem_')) {
    const obj = await deps.store.get(nameOrId);
    if (!obj || obj.type !== 'tool') throw new UserFacingError(`Tool не найден: ${nameOrId}`);
    return asTool(obj);
  }
  const matches = (await deps.store.list({ type: 'tool' })).filter((o) => asTool(o).name === nameOrId);
  if (matches.length === 0) throw new UserFacingError(`Tool не найден: ${nameOrId}`);
  if (matches.length > 1) {
    throw new UserFacingError(
      `Неоднозначное имя инструмента "${nameOrId}" (${matches.length} объектов): ${matches.map((m) => m.id).join(', ')}`
    );
  }
  return asTool(matches[0]!);
}

export async function registerTool(deps: ToolLibrarianDeps, input: RegisterToolInput): Promise<RegisterToolResult> {
  const run = async (): Promise<RegisterToolResult> => {
    // имя = имя файла в .wolf/tools/ и ключ `tool use <name>`: без слэшей/точек/путей.
    if (!NAME_RE.test(input.name)) {
      throw new UserFacingError(
        `Недопустимое имя инструмента "${input.name}": только [a-z0-9-_], начинается с цифры/буквы`
      );
    }
    const absSrc = isAbsolute(input.scriptPath) ? input.scriptPath : join(deps.baseDir, input.scriptPath);
    if (!(await deps.fs.exists(absSrc))) {
      throw new UserFacingError(`Скрипт не найден: ${absSrc}`);
    }

    // Коллизия имени — всегда отказ (даже с --force): name — ключ lookup'а,
    // второй объект затёр бы канонический скрипт первого.
    const taken = (await deps.store.list({ type: 'tool' })).filter(
      (o) => LIVE_STATUSES.includes(o.status) && asTool(o).name === input.name
    );
    if (taken.length > 0) {
      const list = taken.map((o) => `${o.id} [${o.status}]`).join('; ');
      throw new UserFacingError(`Имя "${input.name}" уже занято: ${list}. Выбери другое имя`);
    }

    // Dedup-подсказка (search-before-write): похожие по контракту — только предупреждение.
    const similar = await findSimilar(deps.store, input);
    if (similar.length > 0 && !input.force) {
      const list = similar.map((s) => `${s.name} (${s.id}) [${s.status}]`).join('; ');
      throw new UserFacingError(`Найдены похожие инструменты: ${list}. Подтверди намерение флагом --force`);
    }

    const relDest = join('.wolf', 'tools', `${input.name}${extname(absSrc)}`);
    const content = await deps.fs.readSmallTextFile(absSrc);
    if (content === null) throw new UserFacingError(`Скрипт не найден: ${absSrc}`);
    await deps.fs.writeFile(join(deps.baseDir, relDest), content);

    const extra: Record<string, unknown> = {
      name: input.name,
      script_path: relDest,
      language: input.language,
      // store.save не применяет zod-дефолты — usage_count задаём явно.
      usage_count: 0,
    };
    if (input.contractIn !== undefined) extra.contract_input = input.contractIn;
    if (input.contractOut !== undefined) extra.contract_output = input.contractOut;
    if (input.contractEnvironment !== undefined) extra.contract_environment = input.contractEnvironment;

    const { object } = await addMemoryObject(
      {
        store: deps.store,
        log: deps.log,
        clock: deps.clock,
        idGen: deps.idGen,
        index: deps.index,
        // lock не передаём: мы уже внутри deps.lock.withLock (FsMemoryLock не реентерабелен)
        declarations: deps.declarations,
      },
      {
        type: 'tool',
        title: `Tool: ${input.name}`,
        body: input.notes ?? '',
        createdBy: input.createdBy,
        extra,
      }
    );

    return { toolId: object.id, scriptPath: relDest, similar };
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}

export async function listTools(
  deps: Pick<ToolLibrarianDeps, 'store'>,
  filters: { status?: string } = {}
): Promise<ToolObject[]> {
  const tools = await deps.store.list({ type: 'tool', status: filters.status });
  return tools.map(asTool).sort((a, b) => a.name.localeCompare(b.name));
}

type StoreDeps = Omit<ToolLibrarianDeps, 'fs' | 'baseDir'>;

export async function useTool(deps: StoreDeps, input: { nameOrId: string; actor: string }): Promise<ToolObject> {
  const run = async (): Promise<ToolObject> => {
    const tool = await resolveToolRef(deps, input.nameOrId);
    const now = deps.clock.now();
    const usageCount = (tool.usage_count ?? 0) + 1;
    const patch = { usage_count: usageCount, last_used_at: now.toISOString() } as unknown as Partial<MemoryObject>;
    const updated = await deps.store.update(tool.id, patch);
    await deps.log.append({
      id: deps.idGen.generateEventId(now),
      // 'tool.used' не входит в enum MemoryEventSchema (файл вне зоны C2) —
      // маркируем через payload.kind, тип оставляем валидным memory.updated.
      type: 'memory.updated',
      timestamp: now.toISOString(),
      actor: input.actor,
      payload: { memory_id: tool.id, usage_count: usageCount, kind: 'tool.used' },
    });
    if (deps.index) {
      await deps.index.indexObject(updated);
    }
    return asTool(updated);
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}

/** Детерминированный контент SKILL.md из объекта tool — повторная генерация даёт тот же текст. */
export function toolSkillContent(tool: ToolObject): string {
  const description = tool.contract_output ?? 'скрипт из памяти Wolf';
  return [
    `<!-- generated from tool:${tool.id} -->`,
    '---',
    `name: ${tool.name}`,
    `description: Tool ${tool.name} — ${description}.`,
    '---',
    '',
    `# Tool ${tool.name}`,
    '',
    `- Input: ${tool.contract_input ?? '—'}`,
    `- Output: ${tool.contract_output ?? '—'}`,
    `- Environment: ${tool.contract_environment ?? '—'}`,
    `- Script: \`${tool.script_path}\` (каноничный файл; Wolf его не исполняет)`,
    '',
    '## Инструкция',
    '',
    `Вызови скрипт и учти вывод. После использования отметь факт: \`wolf tool use ${tool.name}\`.`,
    '',
  ].join('\n');
}

export async function exposeTool(
  deps: ToolLibrarianDeps,
  input: { nameOrId: string; actor?: string }
): Promise<{ path: string; content: string }> {
  const tool = await resolveToolRef(deps, input.nameOrId);
  const relPath = join('.opencode', 'skills', tool.name, 'SKILL.md');
  const content = toolSkillContent(tool);
  await deps.fs.writeFile(join(deps.baseDir, relPath), content);
  return { path: relPath, content };
}

export async function deprecateTool(
  deps: StoreDeps,
  input: { nameOrId: string; reason: string; actor: string }
): Promise<ToolObject> {
  if (!input.reason || input.reason.trim() === '') {
    throw new UserFacingError('Причина депрекации обязательна (--reason)');
  }
  const tool = await resolveToolRef(deps, input.nameOrId);
  await transitionMemoryObject(deps, tool.id, 'deprecated', input.actor);
  const patch = { deprecation_reason: input.reason } as unknown as Partial<MemoryObject>;
  await deps.store.update(tool.id, patch);
  const final = await deps.store.get(tool.id);
  if (!final) throw new Error(`Tool object disappeared: ${tool.id}`);
  return asTool(final);
}

export async function reviveTool(deps: StoreDeps, input: { nameOrId: string; actor: string }): Promise<ToolObject> {
  const tool = await resolveToolRef(deps, input.nameOrId);
  await transitionMemoryObject(deps, tool.id, 'active', input.actor);
  const final = await deps.store.get(tool.id);
  if (!final) throw new Error(`Tool object disappeared: ${tool.id}`);
  return asTool(final);
}
