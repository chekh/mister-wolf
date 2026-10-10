import { join } from 'path';

export const GITIGNORE_MARKER = '# wolf-gitignore:v1';

/** WP4 (спека §7): игнорировать машинно-локальное, коммитить память —
 * формула переноса 2.14 §8.3 («память коммитится — клонирование переносит»). */
export function buildGitignoreBlock(): string {
  return [
    GITIGNORE_MARKER,
    '# wolf: machine-local state; .wolf/memory is portable — commit it',
    '.wolf/cache/',
    '.wolf/memory/.lock',
    '.wolf/backup/',
    '# end wolf-gitignore',
    '',
  ].join('\n');
}

export type GitignoreOutcome = 'created' | 'appended' | 'kept';

export async function ensureGitignoreBlock(
  deps: {
    exists: (p: string) => Promise<boolean>;
    readFile: (p: string) => Promise<string | null>;
    writeFile: (p: string, c: string) => Promise<void>;
  },
  baseDir: string
): Promise<GitignoreOutcome> {
  const p = join(baseDir, '.gitignore');
  const current = (await deps.exists(p)) ? await deps.readFile(p) : null;
  if (current === null) {
    await deps.writeFile(p, `${buildGitignoreBlock()}\n`);
    return 'created';
  }
  if (current.includes(GITIGNORE_MARKER)) return 'kept';
  const gap = current.endsWith('\n\n') ? '' : current.endsWith('\n') ? '\n' : '\n\n';
  await deps.writeFile(p, `${current}${gap}${buildGitignoreBlock()}`);
  return 'appended';
}
