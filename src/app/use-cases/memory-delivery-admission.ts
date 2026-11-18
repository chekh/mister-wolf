// src/app/use-cases/memory-delivery-admission.ts
// REQ-321-2 (R-2, patch 3.2.1): ЕДИНАЯ политика допуска объектов памяти в доставку.
// Дефект 3.2.0: legacy-ветки доставки (call-инъекции/правила/уроки/блокеры в
// get-call-injections.ts; accepted-memory/open-questions/blockers в
// generate-agent-brief.ts) пропускали применимость (applies, REQ-09), подавление
// открытым противоречием (S-27) и worktree-scope (2.17.1), а объекты с тегом
// micro-note доставлялись И legacy-веткой, И микро-селектором (двойной путь —
// репродукции владельца: darwin-правило на linux, подавленное правило в call,
// чужой worktree в main). Теперь каждая ветка отбора консультирует один предикат
// admitForDelivery; micro-note доставляется ТОЛЬКО через микро-селектор.
// Детерминировано, без модельных вызовов; семантика бюджетов не меняется
// (AC-2.6: объекты без applies/scope/подавлений/тега допускаются как прежде).
//
// micro-note-delivery.ts экспортирует составные проверки (applicabilityOf/
// appliesToContext/openContradiction), этот модуль — worktree-видимость и сборку
// политики; микро-селектор получает видимость через параметр (import type —
// без цикла значений).
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { learningSignalRevision } from '../../domain/learning-signals.js';
import {
  appliesToContext,
  applicabilityOf,
  MICRO_NOTE_TAG,
  openContradiction,
  type MicroNoteContext,
} from './micro-note-delivery.js';
import type { MicroNoteSuppressionRecord } from '../../ports/micro-note-delivery-log.port.js';
import { resolveWorktreeIdentity, type WorktreeIdentity } from '../../adapters/fs/memory-root.js';

/** Машино-читаемая причина отказа допуска (отчётность и тесты, AC-2.5). */
export type DeliveryRejectionCause =
  | 'micro-note-tag' // AC-2.1: micro-note доставляется только микро-селектором
  | 'not-applicable' // AC-2.2: applies объявлен, но не совпал с контекстом
  | 'contradiction-suppressed' // AC-2.3: открытое противоречие на этой ревизии (S-27)
  | 'foreign-worktree'; // AC-2.4: scope чужой worktree-копии (2.17.1)

export interface DeliveryAdmissionResult {
  admitted: boolean;
  cause: DeliveryRejectionCause | null;
  /** Ревизия содержимого объекта — атрибуция underReview (REQ-09 id@rev). */
  revision: string;
  /** Причина открытого противоречия при отказе по подавлению (S-27). */
  contradictionReason?: string;
}

const WT_PREFIX = 'worktree:';
/** Формат WT-ID-токена (design §3.2). Свой токен сравнивается с текущим напрямую;
 * чужой WT-ID-токен НЕ сравнивается с текущим молча — падает в общий legacy-разбор
 * ниже: каталог, названный `w-<12hex>`, маппится по basename или честно конфликтует
 * (R2-01 fallthrough). */
const WT_ID_TOKEN = /^w-[0-9a-f]{12}$/;

export interface WorktreeVisibilityInput {
  /** 2.17.1: токен текущей копии — WT-ID (`w-<12 hex>`), полный `worktree:…`
   * тоже принят; undefined/'main' — main-вид: worktree-scoped объекты скрыты. */
  currentScope?: string;
  /** База идентичности копии (CLI — process.cwd()); дефолт — cwd. */
  baseDir?: string;
  /** Тестовый seam: резолвер identity (прод-дефолт — resolveWorktreeIdentity). */
  resolveIdentity?: (baseDir: string) => WorktreeIdentity | null;
}

export interface WorktreeVisibility {
  /** Единый scope-предикат (2.17.1 REQ-02 design §3.2) — единственная точка
   * знания о scope; им пользуются и legacy-ветки, и микро-селектор (AC-2.4). */
  isVisible(o: Record<string, unknown>): boolean;
  /** Legacy-токены `worktree:<name>`, не сопоставленные никому (честный конфликт). */
  conflicts(): string[];
  /** null — main-вид (worktree-scoped скрыты); для stderr-подсказок wolf call. */
  readonly currentToken: string | null;
  /** undefined — identity ещё не резолвился; null — git-метаданные недоступны. */
  readonly identity: WorktreeIdentity | null | undefined;
}

/** Worktree-видимость, перенесённая из get-call-injections.ts (2.17.1) дословно:
 * WT-ID сравнивается строго (без git); legacy-токен `worktree:<name>` маппится
 * через идентичность копии (лениво, ≤1 git-подпроцесс на процесс — NFR-01);
 * неоднозначное имя — честный конфликт (fail-closed: не видно никому). */
export function createWorktreeVisibility(input: WorktreeVisibilityInput): WorktreeVisibility {
  const current = input.currentScope ?? 'main';
  const currentToken =
    current === 'main' ? null : current.startsWith(WT_PREFIX) ? current.slice(WT_PREFIX.length) : current;
  const scopeOf = (o: Record<string, unknown>): string | null => {
    const s = o.scope;
    return typeof s === 'string' && s.startsWith(WT_PREFIX) ? s : null;
  };
  const conflicts = new Set<string>();
  let identity: WorktreeIdentity | null | undefined; // undefined — ещё не резолвили (лениво)
  const identityOf = (): WorktreeIdentity | null => {
    if (identity === undefined) {
      identity = (input.resolveIdentity ?? resolveWorktreeIdentity)(input.baseDir ?? process.cwd());
    }
    return identity;
  };
  const isVisible = (o: Record<string, unknown>): boolean => {
    const s = scopeOf(o);
    if (s === null) return true; // main/project/global — доставляются везде (как раньше)
    if (currentToken === null) return false; // main-вид: worktree-scoped невидимы
    const token = s.slice(WT_PREFIX.length);
    // Свой WT-ID — прямое сравнение. Чужой WT-ID-токен уходит в общий
    // legacy-разбор (R2-01 fallthrough): маппинг по basename или конфликт.
    if (WT_ID_TOKEN.test(token) && token === currentToken) return true;
    const id = identityOf();
    if (id === null) return false; // сбой git-метаданных — fail-closed (design §5)
    if (token !== id.legacyName) return false;
    if (id.legacyUnique) return true; // однозначное legacy-имя маппится на эту копию
    conflicts.add(s); // неоднозначное — честный конфликт, не тихое присвоение
    return false;
  };
  return {
    isVisible,
    conflicts: () => [...conflicts],
    currentToken,
    get identity() {
      return identity;
    },
  };
}

export interface DeliveryAdmissionInput {
  /** Контекст применимости (REQ-09); environment не передан — process.platform. */
  context?: MicroNoteContext;
  /** Открытые подавления противоречиями из журнала доставки (S-27). */
  suppressions?: readonly MicroNoteSuppressionRecord[];
  /** Worktree-видимость; не передана — scope-фильтр не применяется. */
  worktree?: WorktreeVisibility;
}

export interface DeliveryAdmission {
  /** Допуск legacy-ветки доставки: проверяет тег micro-note (AC-2.1), применимость
   * (AC-2.2), подавление противоречием (AC-2.3) и worktree-scope (AC-2.4). */
  admitted(o: Record<string, unknown>): DeliveryAdmissionResult;
}

/** Сборка единой политики допуска для канала доставки (call/brief). */
export function createDeliveryAdmission(input: DeliveryAdmissionInput): DeliveryAdmission {
  const context: MicroNoteContext = { environment: process.platform, ...input.context };
  const suppressions = input.suppressions ?? [];
  const worktree = input.worktree;
  return {
    admitted(o: Record<string, unknown>): DeliveryAdmissionResult {
      const revision = learningSignalRevision(o as MemoryObject);
      // AC-2.1: micro-note — единственный путь доставки, микро-селектор.
      if (((o.tags as string[] | undefined) ?? []).includes(MICRO_NOTE_TAG)) {
        return { admitted: false, cause: 'micro-note-tag', revision };
      }
      // AC-2.2: applies объявлен и не совпал — не доставляется (fail-closed
      // на некорректном applies — applicability unknown, как в селекторе REQ-09).
      if (!appliesToContext(applicabilityOf(o as MemoryObject), context)) {
        return { admitted: false, cause: 'not-applicable', revision };
      }
      // AC-2.3: открытое противоречие, привязанное к текущей ревизии (S-27);
      // правка факта — исход пересмотра, запись возвращается в доставку.
      const conflict = openContradiction(o as MemoryObject, suppressions);
      if (conflict !== null) {
        return { admitted: false, cause: 'contradiction-suppressed', revision, contradictionReason: conflict.reason };
      }
      // AC-2.4: scope чужой worktree-копии.
      if (worktree && !worktree.isVisible(o)) {
        return { admitted: false, cause: 'foreign-worktree', revision };
      }
      return { admitted: true, cause: null, revision };
    },
  };
}
