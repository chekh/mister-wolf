import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { substitute, OPENCODE_MANIFEST } from '../../src/adapters/render/manifest.js';

// 2.32.2 (независимое ревью, F-NEW-01): гард целостности рендера НАСТОЯЩЕГО base-set.
//
// Прецедент провала: прогон prettier по `templates/base/**` превратил
// `model: {{model.primary}}` в `model: { { model.primary } }`. YAML читает это
// как объект, OpenCode требует строку и молча ВЫБРАСЫВАЕТ агента из каталога
// («Agent not found: worker-expert»). Существующие тесты рендера используют
// синтетические строки, поэтому поломка прошла все гейты:
// `npm run check` был зелёным с неработающим профилем. Этот тест рендерит
// реальные шаблоны тем же `substitute()`, что и поставка, и проверяет форму.
//
// Дополнительно: `format:check` не покрывает `templates/`, поэтому prettier
// может снова испортить файл — гард ловит именно результат рендера, а не
// форматирование источника.

const templatesBase = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'base');
const agentsDir = join(templatesBase, 'agents');

const MODEL_CONTEXT = { primary: 'company/fast', worker: 'company/fast' };

function frontmatterOf(rendered: string): Record<string, unknown> {
  const m = rendered.match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw new Error('rendered file lost its frontmatter');
  return yaml.load(m[1]!) as Record<string, unknown>;
}

const agentFiles = readdirSync(agentsDir).filter((f) => f.endsWith('.md'));

describe('render integrity: реальные шаблоны агентов (2.32.2, ревью F-NEW-01)', () => {
  it('набор агентов непустой (не вакуумный проход)', () => {
    expect(agentFiles.length).toBe(9);
  });

  it.each(agentFiles)('%s: в omit-режиме не остаётся ни одного плейсхолдера', (file) => {
    const raw = readFileSync(join(agentsDir, file), 'utf-8');
    const rendered = substitute(raw, OPENCODE_MANIFEST, 'omit');
    // ключевая регрессия: `{ { model.primary } }` не матчится MODEL_LINE_RE и выживает
    expect(rendered).not.toContain('{{');
    expect(rendered).not.toContain('{ {');
    expect(rendered).not.toContain('model:');
  });

  it.each(agentFiles)('%s: в model-режиме model — строка, плейсхолдеров нет', (file) => {
    const raw = readFileSync(join(agentsDir, file), 'utf-8');
    const rendered = substitute(raw, OPENCODE_MANIFEST, MODEL_CONTEXT);
    expect(rendered).not.toContain('{{');
    expect(rendered).not.toContain('{ {');
    const model = frontmatterOf(rendered)['model'];
    expect(typeof model, `${file}: model must be a string after render`).toBe('string');
    expect(model).toBe('company/fast');
  });

  it('без контекста моделей плейсхолдер model остаётся ровно один и корректной формы', () => {
    for (const file of agentFiles) {
      const raw = readFileSync(join(agentsDir, file), 'utf-8');
      const rendered = substitute(raw, OPENCODE_MANIFEST);
      const lines = rendered.match(/^[^\S\n]*model:.*$/gm) ?? [];
      expect(lines, `${file}: exactly one model line`).toHaveLength(1);
      expect(lines[0], `${file}: model line must keep the canonical placeholder`).toMatch(
        /^model: \{\{model\.(primary|worker)\}\}$/
      );
    }
  });

  it('профиль эксперта после рендера несёт рабочий read-канал и границы', () => {
    const raw = readFileSync(join(agentsDir, 'wolf-expert.md'), 'utf-8');
    const rendered = substitute(raw, OPENCODE_MANIFEST, MODEL_CONTEXT);
    const front = frontmatterOf(rendered);
    const rules = front['permissions'] as { action: string; resource: string; effect: string }[];
    const effective = (action: string, resource: string): string => {
      let effect = 'ask';
      for (const r of rules) {
        const pat = new RegExp(
          '^' +
            r.action
              .replace(/[.+^${}()|[\]\\]/g, '\\$&')
              .replace(/\*/g, '.*')
              .replace(/\?/g, '.') +
            '$'
        );
        const resp = new RegExp(
          '^' +
            r.resource
              .replace(/[.+^${}()|[\]\\]/g, '\\$&')
              .replace(/\*/g, '.*')
              .replace(/\?/g, '.') +
            '$'
        );
        if (pat.test(action) && resp.test(resource)) effect = r.effect;
      }
      return effect;
    };
    expect(effective('read', 'src/app/x.ts')).toBe('allow');
    expect(effective('glob', '*')).toBe('allow');
    expect(effective('grep', '*')).toBe('allow');
    expect(effective('read', '.env')).toBe('ask');
    expect(effective('edit', 'src/x.ts')).toBe('deny');
    expect(effective('shell', '*')).toBe('deny');
    expect(effective('external_directory', '*')).toBe('deny');
  });
});
