// src/adapters/render/manifest.ts
import { ModelContext } from '../../ports/base-set-renderer.port.js';

export interface HarnessManifest {
  id: string;
  tools: Record<string, string>;
  /** Каталог нейтральных шаблонов → каталог целевого проекта. Плагины — вне (harness-specific). */
  layout: { agents: string; skills: string; commands: string };
}

export const OPENCODE_MANIFEST: HarnessManifest = {
  id: 'opencode',
  tools: { task: 'task', skill: 'skill', todowrite: 'todowrite' },
  layout: { agents: '.opencode/agents', skills: '.opencode/skills', commands: '.opencode/command' },
};

/** Строка `model: {{model.primary|worker}}` — цель omit-режима (sync-легаси, §4.5). */
const MODEL_LINE_RE = /^[^\S\n]*model:[^\S\n]*\{\{model\.(?:primary|worker)\}\}[^\S\n]*$\n?/gm;

export function substitute(text: string, manifest: HarnessManifest, models?: ModelContext | 'omit'): string {
  let out = text.replace(/\{\{tool\.(\w+)\}\}/g, (_m, name: string) => {
    const v = manifest.tools[name];
    if (v === undefined) throw new Error(`Unknown tool placeholder: {{tool.${name}}}`);
    return v;
  });
  if (models === 'omit') {
    // ponytail: построчный omit только model-строк; остальной контент не трогаем
    out = out.replace(MODEL_LINE_RE, '');
  } else if (models) {
    out = out.replace(/\{\{model\.primary\}\}/g, models.primary).replace(/\{\{model\.worker\}\}/g, models.worker);
  }
  // без контекста {{model.*}} остаются как есть — словарь неизвестных {{…}} не валидирует (§4.5)
  return out;
}
