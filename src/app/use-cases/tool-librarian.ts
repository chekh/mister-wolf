import { join, isAbsolute, relative, resolve, sep } from 'path';
import { createHash } from 'node:crypto';
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
  source_digest?: string;
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
  resourcePaths?: string[];
  update?: string;
}

export interface RegisterToolResult {
  toolId: string;
  /** Project-relative entrypoint; source files stay in the project. */
  scriptPath: string;
  similar: { id: string; name: string; status: string }[];
  /** true, если register --update перегенерировал существующий exposed SKILL.md. */
  exposedSkillRefreshed?: boolean;
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
    if (!obj || obj.type !== 'tool') throw new UserFacingError(`Tool not found: ${nameOrId}`);
    return asTool(obj);
  }
  const matches = (await deps.store.list({ type: 'tool' })).filter((o) => asTool(o).name === nameOrId);
  if (matches.length === 0) throw new UserFacingError(`Tool not found: ${nameOrId}`);
  if (matches.length > 1) {
    throw new UserFacingError(
      `Ambiguous tool name "${nameOrId}" (${matches.length} objects): ${matches.map((m) => m.id).join(', ')}`
    );
  }
  return asTool(matches[0]!);
}

/** Resolve a project reference, including symlinks, without copying it. */
async function projectFile(deps: ToolLibrarianDeps, source: string): Promise<string> {
  const root = resolve(deps.baseDir);
  const absolute = resolve(root, source);
  const inside = (base: string, target: string): boolean => {
    const rel = relative(base, target);
    return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
  };
  if (/[\u0000-\u001f]/.test(source) || !inside(root, absolute)) {
    throw new UserFacingError(`Tool path must be inside the project: ${source}`);
  }
  if (!(await deps.fs.exists(absolute))) throw new UserFacingError(`Script not found: ${source}`);
  if (deps.fs.realPath && !inside(await deps.fs.realPath(root), await deps.fs.realPath(absolute))) {
    throw new UserFacingError(`Tool path escapes the project through a symlink: ${source}`);
  }
  return relative(root, absolute).split(sep).join('/');
}

async function sourceVersion(deps: ToolLibrarianDeps, files: string[]): Promise<string> {
  const hash = createHash('sha256');
  for (const file of [...new Set(files)].sort()) {
    const rel = await projectFile(deps, file);
    const absolute = resolve(deps.baseDir, rel);
    let digest: string;
    try {
      if (deps.fs.fileDigest) digest = await deps.fs.fileDigest(absolute);
      else {
        const content = await deps.fs.readSmallTextFile(absolute);
        if (content === null) throw new Error('file cannot be fingerprinted');
        digest = createHash('sha256').update(content).digest('hex');
      }
    } catch (error) {
      throw new UserFacingError(`Cannot fingerprint tool file ${rel}: ${(error as Error).message}`);
    }
    hash.update(rel).update('\0').update(digest).update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

async function checkSource(deps: ToolLibrarianDeps, tool: ToolObject): Promise<void> {
  await projectFile(deps, tool.script_path);
  const version = tool.source_digest;
  if (version?.startsWith('sha256:')) {
    const files = [tool.script_path, ...(tool.related?.files ?? [])];
    if ((await sourceVersion(deps, files)) !== version) {
      throw new UserFacingError(`Tool source changed: ${tool.name}; verify it and update its card explicitly`);
    }
  }
}

export async function registerTool(deps: ToolLibrarianDeps, input: RegisterToolInput): Promise<RegisterToolResult> {
  const run = async (): Promise<RegisterToolResult> => {
    // Имя — стабильный ключ карточки и `tool use <name>`; не путь к исходнику.
    if (!NAME_RE.test(input.name)) {
      throw new UserFacingError(`Invalid tool name "${input.name}": only [a-z0-9-_], starting with a digit/letter`);
    }
    const relDest = await projectFile(deps, input.scriptPath);
    const current = input.update ? await resolveToolRef(deps, input.update) : undefined;
    if (current && current.name !== input.name) throw new UserFacingError('Updating a tool cannot rename its identity');
    const resourceInputs =
      input.resourcePaths ?? (current?.related.files ?? []).filter((p) => p !== current?.script_path);
    const files = [relDest];
    for (const resource of resourceInputs) files.push(await projectFile(deps, resource));
    const uniqueFiles = [...new Set(files)].sort();
    const version = await sourceVersion(deps, uniqueFiles);
    // Коллизия имени — всегда отказ (даже с --force): name — ключ lookup'а,
    // два активных объекта сделали бы адресное использование неоднозначным.
    const taken = (await deps.store.list({ type: 'tool' })).filter(
      (o) => LIVE_STATUSES.includes(o.status) && asTool(o).name === input.name && o.id !== current?.id
    );
    if (taken.length > 0) {
      const list = taken.map((o) => `${o.id} [${o.status}]`).join('; ');
      throw new UserFacingError(`Name "${input.name}" is already taken: ${list}. Choose another name`);
    }

    // Dedup-подсказка (search-before-write): похожие по контракту — только предупреждение.
    const similar = await findSimilar(deps.store, input);
    if (similar.length > 0 && !input.force && !current) {
      const list = similar.map((s) => `${s.name} (${s.id}) [${s.status}]`).join('; ');
      throw new UserFacingError(`Similar tools found: ${list}. Confirm the intent with --force`);
    }

    const extra: Record<string, unknown> = {
      name: input.name,
      script_path: relDest,
      source_digest: version,
      language: input.language,
      // store.save не применяет zod-дефолты — usage_count задаём явно.
      usage_count: 0,
    };
    if (input.contractIn !== undefined) extra.contract_input = input.contractIn;
    if (input.contractOut !== undefined) extra.contract_output = input.contractOut;
    if (input.contractEnvironment !== undefined) extra.contract_environment = input.contractEnvironment;

    if (current) {
      const patch = {
        script_path: relDest,
        language: input.language,
        source_digest: version,
        related: { ...current.related, files: uniqueFiles },
        ...(input.contractIn !== undefined ? { contract_input: input.contractIn } : {}),
        ...(input.contractOut !== undefined ? { contract_output: input.contractOut } : {}),
        ...(input.contractEnvironment !== undefined ? { contract_environment: input.contractEnvironment } : {}),
        ...(input.notes !== undefined ? { body: input.notes } : {}),
      };
      const updated = await deps.store.update(current.id, patch as Partial<MemoryObject>);
      // 2.25.1 (defect 1): exposed SKILL.md не должен расходиться с карточкой после
      // register --update. Перегенерируем только файл с нашим маркером; пользовательский
      // файл без маркера не трогаем. Источник истины — обновлённая карточка.
      const skillPath = join(deps.baseDir, '.opencode', 'skills', asTool(updated).name, 'SKILL.md');
      const exposed = await deps.fs.readSmallTextFile(skillPath);
      let exposedSkillRefreshed: true | undefined;
      if (exposed !== null && exposed.includes(`generated from tool:${updated.id}`)) {
        await deps.fs.writeFile(skillPath, toolSkillContent(asTool(updated)));
        exposedSkillRefreshed = true;
      }
      if (deps.index) await deps.index.indexObject(updated);
      const now = deps.clock.now();
      await deps.log.append({
        id: deps.idGen.generateEventId(now),
        type: 'memory.updated',
        timestamp: now.toISOString(),
        actor: input.createdBy,
        payload: { memory_id: current.id, kind: 'tool.reference.updated' },
      });
      return {
        toolId: current.id,
        scriptPath: relDest,
        similar: similar.filter((s) => s.id !== current.id),
        exposedSkillRefreshed,
      };
    }

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
        related: { files: uniqueFiles, docs: [], decisions: [] },
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

export async function useTool(
  deps: ToolLibrarianDeps,
  input: { nameOrId: string; actor: string }
): Promise<ToolObject> {
  const run = async (): Promise<ToolObject> => {
    const tool = await resolveToolRef(deps, input.nameOrId);
    await checkSource(deps, tool);
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
  const description = tool.contract_output ?? 'script from Wolf memory';
  // 6.5 (аудит opencode v2): frontmatter обязан быть первой строкой файла — маркер
  // генерации идёт после блока, иначе `name`/`description` скилла не парсятся.
  return [
    '---',
    `name: ${tool.name}`,
    `description: ${JSON.stringify(`Tool ${tool.name} — ${description}.`)}`,
    '---',
    `<!-- generated from tool:${tool.id} -->`,
    '',
    `# Tool ${tool.name}`,
    '',
    `- Input: ${tool.contract_input ?? '—'}`,
    `- Output: ${tool.contract_output ?? '—'}`,
    `- Environment: ${tool.contract_environment ?? '—'}`,
    `- Script: \`${tool.script_path}\` (canonical file; Wolf does not execute it)`,
    '',
    '## Instruction',
    '',
    `Before running the script, verify the source is current: \`wolf tool expose ${tool.name}\` (idempotent; fails with "Tool source changed" if the script drifted from the card). Run the script and account for its output, then record the use: \`wolf tool use ${tool.name}\`.`,
    '',
  ].join('\n');
}

export async function exposeTool(
  deps: ToolLibrarianDeps,
  input: { nameOrId: string; actor?: string }
): Promise<{ path: string; content: string }> {
  const tool = await resolveToolRef(deps, input.nameOrId);
  if (!NAME_RE.test(tool.name)) throw new UserFacingError('Invalid tool name for exposure');
  await checkSource(deps, tool);
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
    throw new UserFacingError('Deprecation reason is required (--reason)');
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
