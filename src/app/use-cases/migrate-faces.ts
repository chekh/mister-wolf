// src/app/use-cases/migrate-faces.ts
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { MemoryTypeDeclaration } from '../../domain/memory-types.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { createFaceVersion, type FaceObject } from './create-face-version.js';
import { supersedeMemoryObject } from './supersede-memory-object.js';

/** Волна 2.17 T-05 (design §«Миграция legacy-playbook → face», REQ-02):
 * идемпотентная физическая миграция legacy-записей лица в контракт face.
 * Кандидат — запись, читаемая как note + facet howto + непустой owner_skill
 * (включая legacy-тип playbook: alias-резолв P211 отдаёт его как note+howto);
 * howto без owner_skill не мигрируется (AC4 — не всякий howto есть лицо).
 *
 * Поэтапность (§Отказов): каждый owner_skill — независимая итерация; падение
 * на N-м не откатывает N-1 (supersede каждой записи уже завершён), ошибка
 * попадает в report.failed, обход продолжается. Внешний lock НЕ держим —
 * каждую версию создаёт createFaceVersion под собственным lock (FsMemoryLock
 * не реентерабелен, прецедент tool-librarian.ts:167). */
export interface MigrateFacesDeps {
  store: MemoryStore;
  log: EventLog;
  clock: Clock;
  idGen: IdGenerator;
  index?: SearchIndex;
  lock?: MemoryLock;
  declarations?: readonly MemoryTypeDeclaration[];
  env?: NodeJS.ProcessEnv;
}

export interface MigrateOutcome {
  ownerSkill: string;
  action: 'migrated' | 'skipped';
  faceId?: string;
  headId?: string;
  reason: string;
}

export interface MigrateFacesReport {
  outcomes: MigrateOutcome[];
  /** REQ-02 AC4: howto-записи без owner_skill — не кандидаты (skip с отчётом). */
  skippedHowtoIds: string[];
  /** §Отказов: ошибки по владельцам; уже мигрированные N-1 остаются на месте. */
  failed: { ownerSkill: string; error: string }[];
}

async function facesOfOwner(store: MemoryStore, ownerSkill: string): Promise<FaceObject[]> {
  return (await store.list({ type: 'face' }))
    .filter((o) => (o as FaceObject).owner_skill === ownerSkill)
    .map((o) => o as FaceObject);
}

export async function migrateFaces(deps: MigrateFacesDeps): Promise<MigrateFacesReport> {
  const skippedHowtoIds: string[] = [];
  const byOwner = new Map<string, MemoryObject[]>();
  for (const obj of await deps.store.list({ type: 'note', facet: 'howto' })) {
    const owner = (obj as { owner_skill?: unknown }).owner_skill;
    if (typeof owner !== 'string' || owner.trim() === '') {
      skippedHowtoIds.push(obj.id);
      continue;
    }
    const records = byOwner.get(owner) ?? [];
    records.push(obj);
    byOwner.set(owner, records);
  }

  const outcomes: MigrateOutcome[] = [];
  const failed: { ownerSkill: string; error: string }[] = [];
  for (const [ownerSkill, records] of [...byOwner.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    try {
      if ((await facesOfOwner(deps.store, ownerSkill)).length > 0) {
        outcomes.push({
          ownerSkill,
          action: 'skipped',
          reason: 'face already exists — re-run is safe (idempotent)',
        });
        continue;
      }
      // head — активная (non-superseded) playbook-запись; дубль активных — территория doctor
      const head = records
        .filter((r) => r.status !== 'superseded')
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
      if (!head) {
        outcomes.push({
          ownerSkill,
          action: 'skipped',
          reason: 'no active playbook note — superseded chain stays legacy and reads as before',
        });
        continue;
      }
      const reason = `migrated from playbook note ${head.id} (2.17)`;
      const { face } = await createFaceVersion(deps, {
        command: 'migrate',
        ownerSkill,
        reason,
        // дословный перенос (ADR-4: совместимость FTS-поиска router, NFR-01)
        title: head.title,
        body: head.body,
        tags: head.tags,
      });
      // head скрыт (hide-superseded); superseded-цепочка предков не трогается
      await supersedeMemoryObject(deps, head.id, face.id);
      outcomes.push({ ownerSkill, action: 'migrated', faceId: face.id, headId: head.id, reason });
    } catch (err) {
      failed.push({ ownerSkill, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { outcomes, skippedHowtoIds, failed };
}
