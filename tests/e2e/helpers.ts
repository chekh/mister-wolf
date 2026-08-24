import { spawnSync, execSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const cliPath = join(repoRoot, 'dist/bootstrap/cli.js');

export function ensureBuilt(): void {
  try {
    execSync('npm run build', { cwd: repoRoot, stdio: 'inherit' });
  } catch {
    // ponytail: build failed — test will fail on first CLI call anyway
  }
}

export function runCli(args: string[], cwd: string): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync('node', [cliPath, ...args], { cwd, encoding: 'utf-8', timeout: 30_000 });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status };
}

export function tmpProject(): string {
  return mkdtempSync(join(tmpdir(), 'wolf-e2e-'));
}

export function writeRelationScript(
  cwd: string,
  calls: { subject: string; predicate: string; object: string }[]
): void {
  const imports = [
    `import { JsonlRelationLog } from '${join(repoRoot, 'dist/adapters/fs/jsonl-relation-log.js')}';`,
    `import { HashIdGenerator } from '${join(repoRoot, 'dist/adapters/fs/hash-id-generator.js')}';`,
    `import { recordRelation } from '${join(repoRoot, 'dist/app/use-cases/record-relation.js')}';`,
    `import { join } from 'path';`,
  ].join('\n');
  const body = calls
    .map(
      (c) =>
        `await recordRelation({ relations: rel, idGen: idGen }, new Date(), '${c.subject}', '${c.predicate}', '${c.object}');`
    )
    .join('\n');
  const script = `${imports}\nconst rel = new JsonlRelationLog(join(process.cwd(), '.wolf/memory/relations.jsonl'));\nconst idGen = new HashIdGenerator();\n${body};\n`;
  const scriptPath = join(cwd, 'relation.mjs');
  writeFileSync(scriptPath, script);
  spawnSync('node', ['relation.mjs'], { cwd, encoding: 'utf-8', timeout: 10_000 });
}
