import { describe, it, expect } from 'vitest';
import { ensureGitignoreBlock, GITIGNORE_MARKER } from '../../../src/app/use-cases/gitignore-block.js';

function mapFs(initial: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(initial));
  return {
    deps: {
      exists: async (p: string) => files.has(p),
      readFile: async (p: string) => files.get(p) ?? null,
      writeFile: async (p: string, c: string) => void files.set(p, c),
    },
    files,
  };
}

describe('ensureGitignoreBlock (WP4)', () => {
  it('creates .gitignore when absent', async () => {
    const { deps, files } = mapFs();
    await expect(ensureGitignoreBlock(deps, '/p')).resolves.toBe('created');
    expect(files.get('/p/.gitignore')).toContain(GITIGNORE_MARKER);
    expect(files.get('/p/.gitignore')).toContain('.wolf/cache/');
  });

  it('appends the block to a foreign .gitignore exactly once', async () => {
    const { deps, files } = mapFs({ '/p/.gitignore': 'node_modules/\n' });
    await expect(ensureGitignoreBlock(deps, '/p')).resolves.toBe('appended');
    expect(files.get('/p/.gitignore')).toContain('node_modules/');
    await expect(ensureGitignoreBlock(deps, '/p')).resolves.toBe('kept');
    expect((files.get('/p/.gitignore')?.match(new RegExp(GITIGNORE_MARKER, 'g')) ?? []).length).toBe(1);
  });
});
