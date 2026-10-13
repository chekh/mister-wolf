// src/app/use-cases/seed-base-playbooks.ts
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { MemoryTypeDeclaration } from '../../domain/memory-types.js';
import { createFaceVersion } from './create-face-version.js';
import { activeFace } from './face-operation.js';

export interface SeedOutcome {
  file: string;
  action: 'created' | 'updated' | 'skipped' | 'diverged';
  reason?: string;
}

// Волна 2.17 T-05: посев base-set — лица через face-контракт createFaceVersion
// с initiator='seed' (внутренний путь, guard не применяется). Тайтл/теги/
// owner_skill переносятся из шаблона; version назначает команда ('1').
//
// 2.17.1 T4 (REQ-01 (R01), design §3.6/ADR-6): re-init — шаблонно-управляемое
// версионное обновление live-лиц: body совпал → skip; дрейф при initiator
// seed/migration → template update через общий журналируемый механизм §3.3
// (reason "template update: <файл> (2.17.1)"); steward/owner/breakglass →
// diverged-отчёт, лицо не трогаем (мутации Стюарда старше шаблона, D4).
// Популяция 2.16.3 (нет лица + активный legacy howto) — посев телом ШАБЛОНА +
// поглощение legacy-head: ОДНА журналируемая операция seed с legacyHeadId
// (шаг supersede_legacy внутри операции, между supersede_prev и announce —
// design §3.4/§3.6, «тот же, что у migrate»); атомарность обеспечивает журнал.
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

/** Активный legacy howto-head владельца (прецедент migrate-faces.ts: не
 * superseded, свежий по updated_at); null — активной записи нет. */
async function activeLegacyHead(store: MemoryStore, ownerSkill: string): Promise<{ id: string } | null> {
  const records = (await store.list({ type: 'note', facet: 'howto' })).filter(
    (o) => (o as { owner_skill?: unknown }).owner_skill === ownerSkill
  );
  const head = records
    .filter((r) => r.status !== 'superseded')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  return head ? { id: head.id } : null;
}

/** Посев + шаблонное обновление live-лиц (§3.6): одна точка решения о записи
 * для каждого шаблона base-set с owner_skill. */
export async function seedBasePlaybooks(deps: SeedDeps): Promise<SeedOutcome[]> {
  const outcomes: SeedOutcome[] = [];
  const processedOwners = new Set<string>();
  // ponytail: без .sort() — порядок вставки Map функционально не важен
  for (const [file, raw] of deps.files) {
    const { meta, body } = parseFrontmatter(raw);
    const ownerSkill = meta.owner_skill ?? '';
    if (processedOwners.has(ownerSkill)) {
      outcomes.push({
        file,
        action: 'skipped',
        reason: `owner_skill=${ownerSkill} already seeded from another template in this run`,
      });
      continue;
    }
    processedOwners.add(ownerSkill);
    const active = await activeFace(deps.store, ownerSkill);

    // лица нет: свежий посев, либо популяция 2.16.3 (legacy howto → поглощение)
    if (active === null) {
      const legacyHead = await activeLegacyHead(deps.store, ownerSkill);
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
        legacyHeadId: legacyHead?.id,
      });
      outcomes.push(
        legacyHead !== null
          ? {
              file,
              action: 'created',
              reason: `seeded from template; superseded legacy howto ${legacyHead.id}`,
            }
          : { file, action: 'created' }
      );
      continue;
    }

    // лицо есть: идемпотентный skip либо решение о шаблонном обновлении
    if (active.body === body) {
      outcomes.push({ file, action: 'skipped', reason: `active face v${active.version} matches template` });
      continue;
    }
    if (active.initiator === 'seed' || active.initiator === 'migration') {
      await createFaceVersion(deps, {
        command: 'seed',
        ownerSkill,
        reason: `template update: ${file} (2.17.1)`,
        title: meta.title ?? file,
        body,
        tags: (meta.tags ?? '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      outcomes.push({
        file,
        action: 'updated',
        reason: `template update from v${active.version} (initiator ${active.initiator})`,
      });
    } else {
      outcomes.push({
        file,
        action: 'diverged',
        reason: `diverged: face v${active.version} initiator=${active.initiator} — left untouched (steward zone, D4)`,
      });
    }
  }
  return outcomes;
}
