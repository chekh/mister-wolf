import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export function shouldSummarize(objects: MemoryObject[], now: Date): boolean {
  const summaries = objects.filter((object) => object.type === 'session-summary');
  if (summaries.length === 0) {
    return true;
  }

  const latest = summaries.reduce((newest, current) => (current.created_at > newest.created_at ? current : newest));

  const ageMs = now.getTime() - new Date(latest.created_at).getTime();
  return ageMs > FIVE_MINUTES_MS;
}
