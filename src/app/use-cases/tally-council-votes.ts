import { MemoryStore } from '../../ports/memory-store.port.js';
import { RelationLog } from '../../ports/relation-log.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';

export interface CouncilTally {
  questionId: string;
  votes: { opinionId: string; voter: string; vote: string }[];
  tallies: Record<string, number>;
  quorumMet: boolean;
  winner: string | null;
}

export async function tallyCouncilVotes(
  deps: { store: MemoryStore; relations: RelationLog },
  input: { questionId: string; quorum: number; consensusThreshold: number }
): Promise<CouncilTally> {
  const rels = await deps.relations.list({ object: input.questionId, predicate: 'answers' });
  const votes: CouncilTally['votes'] = [];
  for (const r of rels) {
    const op = await deps.store.get(r.subject);
    if (!op || op.type !== 'council-opinion') continue;
    votes.push({ opinionId: op.id, voter: op.created_by, vote: extractVote(op) });
  }
  const tallies: Record<string, number> = {};
  for (const v of votes) tallies[v.vote] = (tallies[v.vote] ?? 0) + 1;
  const quorumMet = votes.length >= input.quorum;
  const [top, n] = Object.entries(tallies).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  return {
    questionId: input.questionId,
    votes,
    tallies,
    quorumMet,
    winner: quorumMet && top && n / votes.length >= input.consensusThreshold ? top : null,
  };
}

export function extractVote(op: MemoryObject): string {
  const raw = (op as Record<string, unknown>).vote;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  const m = op.body.match(/^VOTE:\s*(\S+)/m);
  return m ? m[1] : 'TIMEOUT';
}
