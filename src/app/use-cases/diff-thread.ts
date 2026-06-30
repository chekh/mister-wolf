import { MemoryStore } from '../../ports/memory-store.port.js';
import { RelationLog } from '../../ports/relation-log.port.js';

export interface ThreadDiff {
  threadId: string;
  sinceCheckpointId: string;
  currentState: {
    before: string;
    after: string;
  };
  added: string[];
  removed: string[];
  relations: string[];
}

export async function diffThread(
  deps: { store: MemoryStore; relations?: RelationLog },
  threadId: string,
  checkpointId: string
): Promise<ThreadDiff> {
  const checkpoint = await deps.store.get(checkpointId);
  if (!checkpoint) throw new Error(`Checkpoint not found: ${checkpointId}`);
  if (checkpoint.type !== 'session-checkpoint') throw new Error(`Memory object is not a checkpoint: ${checkpointId}`);

  const captured = (checkpoint as { captured_state?: { thread_current_state?: string; related_ids?: string[] } })
    .captured_state ?? {
    thread_current_state: '',
    related_ids: [],
  };

  const thread = await deps.store.get(threadId);
  if (!thread) throw new Error(`Thread not found: ${threadId}`);

  const currentRelated = await deps.store.list();
  const currentRelatedIds = currentRelated
    .filter(
      (obj) =>
        (obj.type === 'info-request' && (obj as { thread?: string }).thread === threadId) ||
        (obj.type === 'article' && (obj as { thread?: string }).thread === threadId) ||
        (obj.type === 'decision' && (obj as { thread?: string }).thread === threadId) ||
        (obj.type === 'blocker' && (obj as { thread?: string }).thread === threadId) ||
        (obj.type === 'session-checkpoint' && (obj as { thread?: string }).thread === threadId)
    )
    .map((obj) => obj.id);

  const before = new Set(captured.related_ids ?? []);
  const after = new Set(currentRelatedIds);
  const added = [...after].filter((id) => !before.has(id));
  const removed = [...before].filter((id) => !after.has(id));

  const relationLines: string[] = [];
  if (deps.relations) {
    const relatedRelations = await deps.relations.list({ subject: threadId });
    for (const r of relatedRelations) {
      relationLines.push(`${r.subject} ${r.predicate} ${r.object}`);
    }
  }

  return {
    threadId,
    sinceCheckpointId: checkpointId,
    currentState: {
      before: captured.thread_current_state ?? '',
      after: (thread as { current_state?: string }).current_state ?? '',
    },
    added,
    removed,
    relations: relationLines,
  };
}
