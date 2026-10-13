import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { UserFacingError } from '../../domain/errors.js';
import type { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { resolveWorktreeIdentity, type WorktreeIdentity } from '../../adapters/fs/memory-root.js';

export const MAIN_SCOPE = 'main';

const WT_PREFIX = 'worktree:';

export interface PromoteResult {
  promoted: number;
  /** Source-токены владельца (через запятую) — печать CLI. */
  scopeFrom: string;
  /** 2.17.1 REQ-02 (R02), design §3.2: неоднозначные legacy-токены — честный
   * конфликт; объекты этих токенов НЕ переписываются. */
  conflicts: string[];
}

/** WP3 §6.2 (спека 2.16): шаг finishing-a-development-branch — scoped-объекты
 * ворктрии становятся main. Автоудаления нет (P3): только перевод scope.
 * 2.17.1 REQ-02 (R02), design §3.2: резолвит WorktreeIdentity ТЕКУЩЕЙ копии и
 * переводит в main объекты ОБОИХ токенов владельца — WT-ID и однозначное
 * legacy-имя (два семейства scope сосуществуют после обновления, NFR-01);
 * неоднозначное legacy-имя — честный конфликт, объекты не переписываются.
 * Идентичность null (main-чекоут / битые метаданные) — пустое множество токенов
 * владельца: честный отчёт 0 promoted, не ошибка (S-17, решение L0 2026-10-13). */
export async function promoteWorktreeMemory(
  deps: {
    store: MemoryStore;
    log: EventLog;
    clock: Clock;
    idGen: IdGenerator;
    index?: SearchIndex;
    lock?: MemoryLock;
    /** Тестовый seam: идентичность копии; прод-дефолт — resolveWorktreeIdentity(process.cwd()). */
    resolveIdentity?: () => WorktreeIdentity | null;
  },
  worktree: string
): Promise<PromoteResult> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(worktree)) {
    throw new UserFacingError(`Invalid worktree name: "${worktree}" (see: git worktree list)`);
  }
  // Аргумент CLI — имя для валидации/отчёта; владелец определяется текущей копией.
  const identity = (deps.resolveIdentity ?? (() => resolveWorktreeIdentity(process.cwd())))();
  const conflicts: string[] = [];
  const tokens: string[] = [];
  if (identity !== null) {
    tokens.push(identity.id);
    const legacyScope = `${WT_PREFIX}${identity.legacyName}`;
    if (identity.legacyUnique) {
      if (!tokens.includes(legacyScope)) tokens.push(legacyScope);
    } else if (legacyScope !== identity.id) {
      conflicts.push(legacyScope); // неоднозначное имя — никому не присваивается молча
    }
  }
  if (conflicts.length > 0) {
    // stderr-подсказка: CLI-слой печатает только сводку promote (не меняется в T1)
    console.error(
      `[wolf] worktree scope conflict: ${conflicts.join(', ')} — ` +
        'ambiguous legacy worktree name (two live checkouts share the basename); objects left as-is'
    );
  }
  const run = async (): Promise<PromoteResult> => {
    const objects = (await deps.store.list()).filter((o) => {
      const s = (o as { scope?: string }).scope;
      return typeof s === 'string' && tokens.includes(s);
    });
    const now = deps.clock.now();
    let promoted = 0;
    for (const o of objects) {
      const from = (o as { scope?: string }).scope as string;
      await deps.store.update(o.id, { scope: MAIN_SCOPE } as unknown as Partial<MemoryObject>);
      await deps.log.append({
        id: deps.idGen.generateEventId(now),
        type: 'memory.scope_promoted',
        timestamp: now.toISOString(),
        actor: 'system:wolf',
        payload: { memory_id: o.id, from, to: MAIN_SCOPE },
      });
      if (deps.index) await deps.index.indexObject({ ...o, scope: MAIN_SCOPE } as never);
      promoted += 1;
    }
    return { promoted, scopeFrom: tokens.length > 0 ? tokens.join(', ') : `${WT_PREFIX}${worktree}`, conflicts };
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}
