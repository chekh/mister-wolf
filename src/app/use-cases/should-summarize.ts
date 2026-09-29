import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export function shouldSummarize(objects: MemoryObject[], now: Date): boolean {
  // 2.13 P210(е): wrap-up пишет note+facet history с тегом session-summary —
  // дедуп держится на теге (alias-чтение старых session-summary тоже даёт note)
  const summaries = objects.filter(
    (object) => object.tags.includes('session-summary') && (object.type === 'note' || object.type === 'session-summary')
  );
  if (summaries.length === 0) {
    return true;
  }

  const latest = summaries.reduce((newest, current) => (current.created_at > newest.created_at ? current : newest));

  const ageMs = now.getTime() - new Date(latest.created_at).getTime();
  return ageMs > FIVE_MINUTES_MS;
}
