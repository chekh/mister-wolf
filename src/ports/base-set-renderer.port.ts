// src/ports/base-set-renderer.port.ts
export type RenderAction = 'created' | 'skipped' | 'updated' | 'conflict';

export interface RenderOutcome {
  file: string;
  action: RenderAction;
  reason?: string;
}

export interface BakeResolver {
  /** Вернуть тело playbook'а для вживления (bake-in) или null. Источник — память целевого проекта (§4). */
  (baseName: string): string | null;
}

export interface BaseSetRenderer {
  id: string;
  renderBaseSet(baseDir: string, bake?: BakeResolver): Promise<RenderOutcome[]>;
  /** Sync: ре-рендер; сравнение по контенту; unstamped = conflict; orphaned-отчёт. Память не трогает. */
  syncBaseSet(baseDir: string): Promise<{ outcomes: RenderOutcome[]; orphaned: string[] }>;
}
