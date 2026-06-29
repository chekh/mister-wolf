import { describe, it, expect } from 'vitest';
import { ProjectSnapshotSchema } from '../../../src/domain/schemas/project-scan-schema.js';

const validSnapshot = {
  projectName: 'mr-wolf',
  root: '/Users/chekh/Development/mister-wolf',
  branch: 'feat/mvp-b',
  commit: 'abc123',
  generatedAt: '2026-06-29T14:00:00Z',
  summary: {
    languages: ['TypeScript'],
    entryPoints: ['src/bootstrap/cli.ts'],
    configFiles: ['package.json', 'tsconfig.json'],
    dependencies: ['zod', 'commander'],
    topLevelDirectories: ['src', 'tests', 'docs'],
    fileCount: 42,
  },
  files: [
    { path: 'src/bootstrap/cli.ts', extension: 'ts', size: 1200 },
    { path: 'README.md', extension: 'md', size: 0 },
  ],
};

describe('ProjectSnapshotSchema', () => {
  it('validates a valid project snapshot', () => {
    const result = ProjectSnapshotSchema.safeParse(validSnapshot);
    expect(result.success).toBe(true);
  });

  it('rejects an invalid project snapshot', () => {
    const invalidSnapshot = {
      ...validSnapshot,
      generatedAt: 'not-a-datetime',
      files: [{ path: 'bad.txt', size: -1 }],
    };
    const result = ProjectSnapshotSchema.safeParse(invalidSnapshot);
    expect(result.success).toBe(false);
  });
});
