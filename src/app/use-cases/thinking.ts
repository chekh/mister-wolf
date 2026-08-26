import { appendFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { thinkingDir } from '../../adapters/fs/project-paths.js';

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
