import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const skill = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'templates',
    'base',
    'skills',
    'wolf-skill-intake',
    'SKILL.md'
  ),
  'utf-8'
);

describe('wolf-skill-intake guard', () => {
  it('keeps owner gate and rollback', () => {
    expect(skill).toContain('npx skills find');
    expect(skill).toContain('Гейт владельца');
    expect(skill).toContain('Без явного «да»');
    expect(skill).toContain('npx skills add');
    expect(skill).toContain('npx skills remove');
    expect(skill).toContain('wolf add --type tool');
    expect(skill).toContain('source_url');
  });
});
