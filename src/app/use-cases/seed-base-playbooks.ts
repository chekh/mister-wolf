// src/app/use-cases/seed-base-playbooks.ts
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { MemoryTypeDeclaration } from '../../domain/memory-types.js';
import { createFaceVersion, type FaceObject } from './create-face-version.js';

export interface SeedOutcome {
  file: string;
  action: 'created' | 'skipped';
  reason?: string;
}

// Волна 2.17 T-05 (design §«seedBasePlaybooks», ADR-6): посев base-set — лица
// через face-контракт createFaceVersion с initiator='seed' (внутренний путь,
// guard не применяется). Тайтл/теги/owner_skill переносятся из шаблона;
// version назначает команда ('1'), steps face-контрактом не предусмотрен
// (миграция 2.17 переносит ровно так же — design §Миграция).
export interface SeedDeps {
  files: Map<string, string>;
  store: MemoryStore;
  log: EventLog;
  clock: Clock;
  idGen: IdGenerator;
  index?: SearchIndex;
  lock?: MemoryLock;
  declarations?: readonly MemoryTypeDeclaration[];
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([\w-]+):\s*(.+)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return { meta, body: m[2] };
}

/** Посев (спека §7): скип по owner_skill (MAJ-3/C2) — живое лицо (face) или
 * legacy-запись владельца в памяти, не пересечение тегов; дублей нет (REQ-02 AC3). */
export async function seedBasePlaybooks(deps: SeedDeps): Promise<SeedOutcome[]> {
  const outcomes: SeedOutcome[] = [];
  const seededOwners = new Set<string>();
  for (const obj of await deps.store.list({ type: 'face' })) {
    const owner = (obj as FaceObject).owner_skill;
    if (typeof owner === 'string' && owner !== '') seededOwners.add(owner);
  }
  // legacy: note+facet howto c owner_skill (вкл. alias-резолв старого type playbook)
  for (const obj of await deps.store.list({ type: 'note', facet: 'howto' })) {
    const owner = (obj as { owner_skill?: unknown }).owner_skill;
    if (typeof owner === 'string' && owner.trim() !== '') seededOwners.add(owner);
  }
  // ponytail: без .sort() — порядок вставки Map функционально не важен
  for (const [file, raw] of deps.files) {
    const { meta, body } = parseFrontmatter(raw);
    const ownerSkill = meta.owner_skill ?? '';
    if (seededOwners.has(ownerSkill)) {
      outcomes.push({ file, action: 'skipped', reason: `owner_skill=${ownerSkill} already in memory (R2-M3)` });
      continue;
    }
    await createFaceVersion(deps, {
      command: 'seed',
      ownerSkill,
      reason: `base-set seed: ${file}`,
      title: meta.title ?? file,
      body,
      tags: (meta.tags ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });
    outcomes.push({ file, action: 'created' });
    seededOwners.add(ownerSkill); // два шаблона одного владельца — тоже дубль
  }
  return outcomes;
}
