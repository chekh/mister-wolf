// src/adapters/render/manifest.ts
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

export function substitute(text: string, manifest: HarnessManifest): string {
  return text.replace(/\{\{tool\.(\w+)\}\}/g, (_m, name: string) => {
    const v = manifest.tools[name];
    if (v === undefined) throw new Error(`Unknown tool placeholder: {{tool.${name}}}`);
    return v;
  });
}
