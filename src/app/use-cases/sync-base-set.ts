// src/app/use-cases/sync-base-set.ts
import { BaseSetRenderer, ModelContext, SyncBaseSetOptions } from '../../ports/base-set-renderer.port.js';

/**
 * Sync (спека §7): только штампованные файлы; orphaned — в отчёт;
 * память (.wolf/, seeded playbook'и) НЕ трогается никогда (мутации — зона Стюарда, D4).
 * Bake-in при sync не используется: opencode = plugin-inject; bake-in — механизм
 * минимальных платформ (вызывается адаптером с BakeResolver, Task 4).
 * models — контекст routing-объекта (§4.5); без него рендер сам применяет omit.
 * opts — режим прохода (§4.12): `takeMutated` (правило 6′) доходит до рендерера
 * как есть, включая `AGENTS.md`: один механизм take/бэкап на все цели (§4.5).
 */
export async function syncBaseSet(
  renderer: BaseSetRenderer,
  baseDir: string,
  models?: ModelContext | 'omit',
  opts?: SyncBaseSetOptions
) {
  return renderer.syncBaseSet(baseDir, models, opts);
}
