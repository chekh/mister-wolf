import { appendFile, mkdir, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { thinkingDir } from '../../adapters/fs/project-paths.js';
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { RelationLog } from '../../ports/relation-log.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { createDecision, CreateDecisionResult } from './create-decision.js';

export const THOUGHT_TYPES = ['hypothesis', 'reasoning', 'evidence', 'concern'] as const;

export type ThoughtType = (typeof THOUGHT_TYPES)[number];

export interface SequenceMeta {
  kind: 'sequence';
  id: string;
  goal: string;
  thread: string | null;
  created_at: string;
}

export interface Thought {
  kind: 'thought';
  tid: string;
  n: number;
  type: ThoughtType;
  text: string;
  created_at: string;
}

interface ThinkingDeps {
  baseDir: string;
  clock: Clock;
  idGen: IdGenerator;
}

// ponytail: без лока — одна последовательность = один файл, сценарий single-agent;
// многописательность потребует файловый лок на scratch (D8)
function scratchPath(baseDir: string, sequenceId: string): string {
  return join(thinkingDir(baseDir), `${sequenceId}.jsonl`);
}

async function appendRecord(baseDir: string, sequenceId: string, record: SequenceMeta | Thought): Promise<void> {
  await mkdir(thinkingDir(baseDir), { recursive: true });
  await appendFile(scratchPath(baseDir, sequenceId), `${JSON.stringify(record)}\n`, 'utf-8');
}

export async function startThinking(
  deps: ThinkingDeps,
  input: { goal: string; thread?: string }
): Promise<SequenceMeta> {
  const now = deps.clock.now();
  const meta: SequenceMeta = {
    kind: 'sequence',
    id: deps.idGen.generateMemoryId(now, input.goal),
    goal: input.goal,
    thread: input.thread ?? null,
    created_at: now.toISOString(),
  };
  await appendRecord(deps.baseDir, meta.id, meta);
  return meta;
}

function parseLine<T>(line: string, sequenceId: string, lineNumber: number): T {
  try {
    return JSON.parse(line) as T;
  } catch {
    throw new Error(`Corrupted thinking sequence "${sequenceId}": line ${lineNumber} is not valid JSON`);
  }
}

async function readScratch(baseDir: string, sequenceId: string): Promise<{ meta: SequenceMeta; thoughts: Thought[] }> {
  let raw: string;
  try {
    raw = await readFile(scratchPath(baseDir, sequenceId), 'utf-8');
  } catch {
    throw new Error(`Thinking sequence not found: ${sequenceId}`);
  }
  const lines = raw.split('\n').filter((line) => line.trim() !== '');
  if (lines.length === 0) {
    throw new Error(`Corrupted thinking sequence "${sequenceId}": file is empty`);
  }
  const meta = parseLine<SequenceMeta>(lines[0], sequenceId, 1);
  if (meta.kind !== 'sequence') {
    throw new Error(`Corrupted thinking sequence "${sequenceId}": line 1 must be kind:"sequence"`);
  }
  if (meta.id !== sequenceId) {
    throw new Error(`Corrupted thinking sequence "${sequenceId}": meta id mismatch ("${meta.id}")`);
  }
  const thoughts: Thought[] = [];
  for (let i = 1; i < lines.length; i++) {
    const thought = parseLine<Thought>(lines[i], sequenceId, i + 1);
    if (thought.kind !== 'thought') {
      throw new Error(`Corrupted thinking sequence "${sequenceId}": line ${i + 1} must be kind:"thought"`);
    }
    if (!THOUGHT_TYPES.includes(thought.type)) {
      throw new Error(
        `Unknown thought type "${String(thought.type)}" in sequence "${sequenceId}". Allowed: ${THOUGHT_TYPES.join(', ')}`
      );
    }
    thoughts.push(thought);
  }
  return { meta, thoughts };
}

export async function addThought(
  deps: ThinkingDeps,
  input: { sequenceId: string; type: ThoughtType; text: string }
): Promise<Thought> {
  if (!THOUGHT_TYPES.includes(input.type)) {
    throw new Error(`Invalid thought type "${String(input.type)}". Allowed: ${THOUGHT_TYPES.join(', ')}`);
  }
  const { thoughts } = await readScratch(deps.baseDir, input.sequenceId);
  const now = deps.clock.now();
  const thought: Thought = {
    kind: 'thought',
    tid: deps.idGen.generateMemoryId(now, `${input.type}: ${input.text}`),
    n: (thoughts[thoughts.length - 1]?.n ?? 0) + 1,
    type: input.type,
    text: input.text,
    created_at: now.toISOString(),
  };
  await appendRecord(deps.baseDir, input.sequenceId, thought);
  return thought;
}

export async function concludeThinking(
  deps: {
    baseDir: string;
    store: MemoryStore;
    log: EventLog;
    clock: Clock;
    idGen: IdGenerator;
    index?: SearchIndex;
    relations?: RelationLog;
    lock?: MemoryLock;
  },
  input: { sequenceId: string; title: string; body: string; createdBy: string }
): Promise<CreateDecisionResult> {
  const { meta, thoughts } = await readScratch(deps.baseDir, input.sequenceId);
  if (thoughts.length === 0) {
    throw new Error(`Sequence has no thoughts: ${input.sequenceId}`);
  }
  const trace = thoughts.map((t) => `${t.n}. [${t.type}] ${t.text}`).join('\n');
  const body = `${input.body}\n\n## Thinking trace (${meta.id})\n\n${trace}`;
  const result = await createDecision(
    {
      store: deps.store,
      log: deps.log,
      clock: deps.clock,
      idGen: deps.idGen,
      index: deps.index,
      relations: deps.relations,
      lock: deps.lock,
    },
    {
      title: input.title,
      body,
      thread: meta.thread ?? undefined,
      basedOn: thoughts.map((t) => t.tid),
      createdBy: input.createdBy,
    }
  );
  await unlink(scratchPath(deps.baseDir, input.sequenceId)).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== 'ENOENT') throw err;
  });
  return result;
}

export async function abandonThinking(deps: { baseDir: string }, input: { sequenceId: string }): Promise<void> {
  try {
    await unlink(scratchPath(deps.baseDir, input.sequenceId));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Thinking sequence not found: ${input.sequenceId}`);
    }
    throw err;
  }
}
