import { MemoryStore } from '../../ports/memory-store.port.js';
import { checksumBlock } from '../../adapters/fs/session-delivery-registry.js';
import type { FaceObject } from './create-face-version.js';

/**
 * 2.18.4: канонический резолвер лица агента. Строгий запрос к объектам памяти:
 * type=face, status=active, owner_skill === agentId (legacy-префикс `skill:` —
 * тот же гвард, что в wolf-router). Ровно одно активное лицо → тело, версия,
 * hash содержимого. Ноль или больше одного — детерминированный отказ (не выбор
 * «первого попавшегося»): конфликт диагностируется отсортированным списком
 * кандидатов (updated_at, затем версия — стабильный порядок для вывода и тестов).
 */

export interface ResolvedFace {
  id: string;
  body: string;
  version: string;
  /** checksumBlock(body) — контроль целостности доставленного канона. */
  hash: string;
}

export type ResolveFaceError =
  | { kind: 'none'; owner: string }
  | {
      kind: 'multiple';
      owner: string;
      candidates: { id: string; version: string; updated_at: string }[];
    };

export type ResolveFaceResult = { ok: true; face: ResolvedFace } | { ok: false; error: ResolveFaceError };

function ownerMatches(face: FaceObject, agentId: string): boolean {
  return face.owner_skill === agentId || face.owner_skill === `skill:${agentId}`;
}

export async function resolveFace(store: MemoryStore, agentId: string): Promise<ResolveFaceResult> {
  const active = (await store.list({ type: 'face', status: 'active' })).filter((o) =>
    ownerMatches(o as FaceObject, agentId)
  ) as FaceObject[];
  const sorted = [...active].sort(
    (a, b) =>
      String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')) || Number(b.version) - Number(a.version)
  );
  if (sorted.length === 0) return { ok: false, error: { kind: 'none', owner: agentId } };
  if (sorted.length > 1) {
    return {
      ok: false,
      error: {
        kind: 'multiple',
        owner: agentId,
        candidates: sorted.map((f) => ({ id: f.id, version: String(f.version), updated_at: f.updated_at })),
      },
    };
  }
  const f = sorted[0]!;
  const body = typeof f.body === 'string' ? f.body : '';
  return { ok: true, face: { id: f.id, body, version: String(f.version), hash: checksumBlock(body) } };
}
