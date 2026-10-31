import { join } from 'path';

export const GITIGNORE_MARKER = '# wolf-gitignore:v1';

/** WP4 (спека §7): состояние Wolf машинно-локальное — память (.wolf/memory)
 * не коммитится и на другой машине не восстанавливается. */
export function buildGitignoreBlock(): string {
  return [
    GITIGNORE_MARKER,
    '# wolf: machine-local state; .wolf/memory is NOT committed and is not restored on another machine',
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
