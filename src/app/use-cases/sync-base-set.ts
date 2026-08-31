// src/app/use-cases/sync-base-set.ts
import { BaseSetRenderer } from '../../ports/base-set-renderer.port.js';

/**
 * Sync (спека §7): только штампованные файлы; orphaned — в отчёт;
 * память (.wolf/, seeded playbook'и) НЕ трогается никогда (мутации — зона Стюарда, D4).
 * Bake-in при sync не используется: opencode = plugin-inject; bake-in — механизм
 * минимальных платформ (вызывается адаптером с BakeResolver, Task 4).
 */
export async function syncBaseSet(renderer: BaseSetRenderer, baseDir: string) {
  return renderer.syncBaseSet(baseDir);
}
