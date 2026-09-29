import { spawnSync, execSync } from 'child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
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

export function runCli(
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv
): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync('node', [cliPath, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 30_000,
    env: env && { ...process.env, ...env },
  });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status };
}

export function tmpProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wolf-e2e-'));
  // маркер корня проекта: init вне проекта честно отказывает (спека §6 дистрибуции)
  writeFileSync(join(dir, 'package.json'), '{ "name": "wolf-e2e" }');
  return dir;
}

export interface LegacyInjectionSeed {
  id: string;
  title: string;
  body: string;
  trigger_keywords: string[];
  created_by: string;
  related_objects?: string[];
}

/**
 * 2.13 (P211 §5.4): тип call-injection удалён — store.save({type:
 * 'call-injection'}) падает. Сид-фикстура пишется легаси-md файлом в
 * shared/calls/: frontmatter type: call-injection читается стором как
 * note (facet howto) + transient alias_origin и попадает в call-пул
 * (get-call-injections.ts). Даты обязаны быть в кавычках: непрокавыченный
 * ISO-timestamp js-yaml парсит в Date → zod-фейл → файл молча выпадает из list.
 */
export function writeLegacyInjection(dir: string, seed: LegacyInjectionSeed): string {
  const q = (s: string) => JSON.stringify(s);
  const now = new Date().toISOString();
  const frontmatter = [
    '---',
    `id: ${seed.id}`,
    'type: call-injection',
    `title: ${q(seed.title)}`,
    'status: active',
    'review_state: accepted',
    'confidence: high',
    'importance: 0.8',
    `created_at: ${q(now)}`,
    `updated_at: ${q(now)}`,
    `created_by: ${q(seed.created_by)}`,
    'schema_version: 1',
    'source:',
    '  kind: manual',
    'related:',
    '  files: []',
    '  docs: []',
    '  decisions: []',
    'tags: []',
    'superseded_by: null',
    `trigger_keywords: [${seed.trigger_keywords.map(q).join(', ')}]`,
    ...(seed.related_objects?.length ? [`related_objects: [${seed.related_objects.map(q).join(', ')}]`] : []),
    '---',
  ].join('\n');
  const callsDir = join(dir, '.wolf', 'memory', 'shared', 'calls');
  mkdirSync(callsDir, { recursive: true });
  const path = join(callsDir, `${seed.id}.md`);
  writeFileSync(path, `${frontmatter}\n\n${seed.body}\n`);
  return path;
}
