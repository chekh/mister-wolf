// src/ports/base-set-renderer.port.ts
export type RenderAction = 'created' | 'appended' | 'skipped' | 'updated' | 'conflict';

export interface RenderOutcome {
  file: string;
  action: RenderAction;
  reason?: string;
  /** 2.19.0 (design §«Сверка»): структурный флаг mutated-skip — сверка
   *  verifyAgainstMap различает skipped-identical / skipped-mutated полем,
   *  не парсингом reason-строки. */
  mutated?: boolean;
}

/** Контекст подстановки моделей (onboarding v2, §4.5): {{model.primary}} / {{model.worker}}. */
export interface ModelContext {
  primary: string;
  worker: string;
}

export interface BakeResolver {
  /** Вернуть тело playbook'а для вживления (bake-in) или null. Источник — память целевого проекта (§4). */
  (baseName: string): string | null;
}

export interface RenderBaseSetOptions {
  bake?: BakeResolver;
  /** ModelContext — явный --model (opt-in); 'omit' — model-строки вырезаются (WP2 unpin, спека 2.16 §5). */
  models?: ModelContext | 'omit';
  /** WP1 (спека 2.16 §4): 'agents-md' — только AGENTS.md (минимальный init);
   * 'full' (дефолт) — весь базовый набор. */
  scope?: 'full' | 'agents-md';
}

export interface BaseSetRenderer {
  id: string;
  /** Init-рендер: create + diff-ветка (§4.5: stamped + diff контента → updated; unstamped → skipped). */
  renderBaseSet(baseDir: string, opts?: RenderBaseSetOptions): Promise<RenderOutcome[]>;
  /**
   * Sync: ре-рендер; сравнение по контенту; unstamped = conflict; orphaned-отчёт. Память не трогает.
   * models — контекст из routing-объекта; 'omit' (и undefined — легаси без routing-объекта) —
   * построчное удаление model:-строки из fresh-контента (§4.5).
   */
  syncBaseSet(
    baseDir: string,
    models?: ModelContext | 'omit'
  ): Promise<{ outcomes: RenderOutcome[]; orphaned: string[] }>;
}
