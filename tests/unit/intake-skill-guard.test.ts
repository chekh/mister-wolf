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
  it('keeps owner gate, version pinning and rollback', () => {
    expect(skill).toContain('Получи действующее разрешение');
    expect(skill).toContain('только для того же согласованного пакета и scope');
    expect(skill).toContain('закрепления версии');
    expect(skill).toContain('latest молча');
    expect(skill).toContain('trial на изолированной задаче');
    expect(skill).toContain('Откат и обновление');
    expect(skill).toContain('owner_skill');
    expect(skill).toContain('source_url');
  });
});
