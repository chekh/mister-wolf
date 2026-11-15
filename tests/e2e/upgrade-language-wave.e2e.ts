// e2e language-wave migration (SC-19..SC-23, REQ-08, ADR-5; T-37).
// Simulates a pre-wave 3.0 project (stamped copies with Russian legacy
// content, sync-state aligned) upgrading to the English base set.
// npm is never hit: --here runs the project step against the local dist
// (whose templates are the EN wave), npm_command is pinned to a non-exec
// value because vitest inherits `exec` and init would treat that as an
// npx try-out (spec §7) and skip the base set.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { repoRoot, tmpProject, ensureBuilt } from './helpers.js';
import { insertProtect, normalizeManaged } from '../../src/domain/protect-key.js';
import { sha256 } from '../../src/adapters/render/sync-state.js';

const cli = join(repoRoot, 'dist/bootstrap/cli.js');

/** Legacy pre-wave body inserted into stamped copies (fixture content; RU
 * fixtures in tests are allowed by design §6.1). */
const RU_BLOB =
  '\n<!-- pre-wave 3.0.0 russian content -->\n\n## Русская секция поставки 3.0\n\n' +
  'Сфера прав ревьюера ограничена чтением; плотность задаётся в TASK.\n';

let home = '';
let shimDir = '';

beforeAll(() => {
  ensureBuilt();
  home = mkdtempSync(join(tmpdir(), 'wolf-upgrade-wave-'));
  // npm shim: nothing may hit the real registry; --here skips npm anyway,
  // an accidental call must be loud.
  shimDir = join(home, 'npm-shim');
  mkdirSync(shimDir, { recursive: true });
  const shim = join(shimDir, 'npm');
  writeFileSync(shim, ['#!/bin/sh', 'echo "wolf-e2e npm shim: refusing: $*" >&2', 'exit 1', ''].join('\n'));
  chmodSync(shim, 0o755);
}, 180_000);

afterAll(() => {
  if (home !== '') rmSync(home, { recursive: true, force: true });
});

function runUpgrade(
  args: string[],
  cwd: string
): {
  stdout: string;
  status: number | null;
  json: any;
} {
  const result = execSync(`node ${cli} upgrade ${args.join(' ')} --json`, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, npm_command: 'install', HOME: home, XDG_CONFIG_HOME: join(home, '.config') },
  });
  const json = JSON.parse(result);
  return { stdout: result, status: json.exit, json };
}

/** Fresh installed project (EN base set rendered, sync-state written). */
function installFresh(): string {
  const dir = tmpProject();
  execSync(`node ${cli} init --full --yes --model zai-coding-plan/glm-5.3`, {
    cwd: dir,
    stdio: 'ignore',
    env: { ...process.env, npm_command: 'install', HOME: home, XDG_CONFIG_HOME: join(home, '.config') },
  });
  return dir;
}

/** Overwrite a stamped copy with legacy Russian content and align sync-state
 * so the classifier sees `rewrite` (ours, but ≠ fresh base): the wave case. */
function makeLegacy(dir: string, rel: string): void {
  const abs = rel === 'AGENTS.md' ? join(dir, rel) : rel.startsWith('.') ? join(dir, rel) : join(dir, '.opencode', rel);
  const current = readFileSync(abs, 'utf-8');
  const fmEnd = current.indexOf('\n---\n', 4);
  const rewritten = fmEnd === -1 ? current + RU_BLOB : current.slice(0, fmEnd + 5) + RU_BLOB + current.slice(fmEnd + 5);
  writeFileSync(abs, rewritten);
  // align the witness: hash of the legacy content, rendered on base 3.0.0
  const statePath = join(dir, '.opencode', 'wolf-sync-state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf-8')) as {
    files: Record<string, { hash: string; origin: string; base: string }>;
  };
  const stateKey = rel === 'AGENTS.md' || rel.startsWith('.') ? rel : `.opencode/${rel}`;
  state.files[stateKey] = {
    hash: sha256(normalizeManaged(rewritten)),
    origin: 'render',
    base: '3.0.0',
  };
  writeFileSync(statePath, JSON.stringify(state));
}

/** Local owner edit on top of the stamp (rule 6 §4.3) → mutated. */
function makeMutated(dir: string, rel: string): void {
  const abs = rel.startsWith('.') ? join(dir, rel) : join(dir, '.opencode', rel);
  writeFileSync(abs, `${readFileSync(abs, 'utf-8')}\n<!-- local owner edit -->\n`);
}

/** RU face object in the project memory (seed origin, out of wave scope). */
function makeRuFace(dir: string): string {
  const faceDir = join(dir, '.wolf', 'memory', 'shared', 'faces');
  mkdirSync(faceDir, { recursive: true });
  const facePath = join(faceDir, 'mem_20261115_face_test.md');
  writeFileSync(
    facePath,
    [
      '---',
      'id: mem_20261115_face_test',
      'type: face',
      "title: 'wolf-reviewer playbook (legacy ru)'",
      'status: active',
      "version: '1'",
      'owner_skill: wolf-reviewer',
      'reason: seed legacy copy before the language wave',
      'initiator: seed',
      "created_at: '2026-11-15T00:00:00.000Z'",
      'schema_version: 1',
      '---',
      '',
      '# Актуальный playbook',
      '',
      '1. Контекст → 2. План → 3. Проверка (legacy russian body).',
      '',
    ].join('\n')
  );
  return facePath;
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(abs));
    else out.push(abs);
  }
  return out;
}

const CYR = /[\u0400-\u04FF]/;

describe('upgrade language wave (SC-19..SC-23, REQ-08)', () => {
  it('SC-19: clean legacy project migrates without questions (replaced, backups)', () => {
    const dir = installFresh();
    try {
      const targets = [
        '.opencode/agents/wolf-reviewer.md',
        '.opencode/skills/wolf-git/SKILL.md',
        '.opencode/command/complain.md',
      ];
      for (const rel of targets) makeLegacy(dir, rel);

      const r = runUpgrade(['--here', '--yes'], dir);
      expect(r.status).toBe(0);
      expect(r.json.mode).toBe('here');
      const project = r.json.projects[0];
      expect(project.status).toBe('updated');
      // every legacy copy migrated ('updated'), no questions asked
      const byPath = new Map((project.files as Array<{ path: string; code: string }>).map((f) => [f.path, f.code]));
      for (const rel of targets) {
        expect(byPath.get(rel), `migrated: ${rel}`).toBe('updated');
        const abs = rel.startsWith('.') ? join(dir, rel) : join(dir, '.opencode', rel);
        expect(readFileSync(abs, 'utf-8')).not.toContain('pre-wave 3.0.0');
        expect(CYR.test(readFileSync(abs, 'utf-8'))).toBe(false);
      }
      expect(r.json.decisions.length).toBe(0); // clean project: nothing deferred
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it('SC-20: mutated → decision; take applies EN with backup; protect untouched; legacy rewritten', () => {
    const dir = installFresh();
    try {
      const legacyRel = '.opencode/skills/wolf-git/SKILL.md';
      const mutatedRel = '.opencode/agents/wolf-architect.md';
      const protectedRel = '.opencode/agents/wolf-reviewer.md';
      makeLegacy(dir, legacyRel);
      makeMutated(dir, mutatedRel);
      const protectedAbs = join(dir, protectedRel);
      writeFileSync(protectedAbs, insertProtect(readFileSync(protectedAbs, 'utf-8'), 'true').content);
      const protectedBefore = readFileSync(protectedAbs, 'utf-8');

      // phase 1 (no --yes): plan only — decisions reported, nothing touched
      const first = runUpgrade(['--here'], dir);
      expect(first.status).toBe(0);
      expect(first.json.projects[0].status).toBe('skipped');
      const decision = first.json.decisions.find((d: { path: string }) => d.path === mutatedRel);
      expect(decision, 'architect mutated in decisions').toBeTruthy();
      expect(decision.code).toBe('mutated');
      expect(first.json.backups.length).toBe(0);
      expect(readFileSync(join(dir, mutatedRel), 'utf-8')).toContain('local owner edit');
      expect(readFileSync(protectedAbs, 'utf-8')).toBe(protectedBefore);
      expect(readFileSync(join(dir, legacyRel), 'utf-8')).toContain('pre-wave 3.0.0');

      // phase 2: owner take → EN written, the edit preserved in backup
      const second = runUpgrade(['--here', '--resolve', `${decision.n}=take`], dir);
      expect(second.status).toBe(0);
      const architect = readFileSync(join(dir, mutatedRel), 'utf-8');
      expect(architect).not.toContain('local owner edit'); // EN base applied
      const backup = second.json.backups.find((b: { file: string }) => b.file === mutatedRel);
      expect(backup, 'backup for taken file').toBeTruthy();
      expect(readFileSync(join(dir, backup.backup), 'utf-8')).toContain('local owner edit');
      expect(readFileSync(protectedAbs, 'utf-8')).toBe(protectedBefore);

      // phase 3: apply the rest of the plan (legacy rewrite), protect still intact
      const third = runUpgrade(['--here', '--yes'], dir);
      expect(third.status).toBe(0);
      expect(readFileSync(join(dir, legacyRel), 'utf-8')).not.toContain('pre-wave 3.0.0');
      expect(readFileSync(protectedAbs, 'utf-8')).toBe(protectedBefore);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it('SC-21: RU face survives the wave (diverged before === after, content intact)', () => {
    const dir = installFresh();
    try {
      const facePath = makeRuFace(dir);
      makeLegacy(dir, '.opencode/agents/wolf-reviewer.md');

      const before = readFileSync(facePath, 'utf-8');
      const first = runUpgrade(['--here'], dir);
      const afterCount = first.json.diverged.length;
      const afterFace = readFileSync(facePath, 'utf-8');

      const second = runUpgrade(['--here', '--yes'], dir);
      expect(second.json.diverged.length).toBe(afterCount);
      // the wave never touches faces (steward zone): byte-identical, still RU
      expect(readFileSync(facePath, 'utf-8')).toBe(afterFace);
      expect(readFileSync(facePath, 'utf-8')).toBe(before);
      expect(CYR.test(afterFace)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it('SC-22: AC-3 — 0 Cyrillic in delivered files after migration', () => {
    const dir = installFresh();
    try {
      for (const rel of [
        '.opencode/agents/wolf-architect.md',
        '.opencode/skills/wolf-plan/SKILL.md',
        '.opencode/command/doc-review.md',
        'AGENTS.md',
      ]) {
        makeLegacy(dir, rel);
      }
      const r = runUpgrade(['--here', '--yes'], dir);
      expect(r.status).toBe(0);
      const deliveredRoot = join(dir, '.opencode');
      for (const abs of walkFiles(deliveredRoot)) {
        if (!abs.endsWith('.md') && !abs.endsWith('.ts') && !abs.endsWith('.js')) continue;
        if (abs.includes('wolf-sync-state')) continue;
        const text = readFileSync(abs, 'utf-8');
        expect(CYR.test(text), `cyrillic in ${abs}`).toBe(false);
      }
      expect(CYR.test(readFileSync(join(dir, 'AGENTS.md'), 'utf-8'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it('SC-23: plan-only passes keep everything deferred; apply migrates; backup rollback', () => {
    const dir = installFresh();
    try {
      const mutatedRel = '.opencode/agents/wolf-editor.md';
      const legacyA = '.opencode/skills/wolf-brainstorm/SKILL.md';
      const legacyB = '.opencode/command/analyze-doc.md';
      makeMutated(dir, mutatedRel);
      makeLegacy(dir, legacyA);
      makeLegacy(dir, legacyB);
      const mutatedBefore = readFileSync(join(dir, mutatedRel), 'utf-8');
      const legacyABefore = readFileSync(join(dir, legacyA), 'utf-8');

      // phase 1 (plan only): mutated deferred, legacy untouched, zero writes
      const first = runUpgrade(['--here'], dir);
      expect(first.status).toBe(0);
      expect(first.json.projects[0].status).toBe('skipped');
      expect(first.json.projects[0].files.length).toBe(0);
      expect(first.json.decisions.some((d: { path: string }) => d.path === mutatedRel)).toBe(true);
      expect(first.json.backups.length).toBe(0);
      expect(readFileSync(join(dir, mutatedRel), 'utf-8')).toBe(mutatedBefore);
      expect(readFileSync(join(dir, legacyA), 'utf-8')).toBe(legacyABefore);

      // phase 2 (repeat plan only): same decisions again, still nothing written
      const second = runUpgrade(['--here'], dir);
      expect(second.json.decisions.some((d: { path: string }) => d.path === mutatedRel)).toBe(true);
      expect(second.json.backups.length).toBe(0);
      expect(readFileSync(join(dir, mutatedRel), 'utf-8')).toBe(mutatedBefore);
      expect(readFileSync(join(dir, legacyA), 'utf-8')).toBe(legacyABefore);

      // phase 3 (--yes apply): legacy migrated with backups, mutated taken with backup
      const third = runUpgrade(['--here', '--yes'], dir);
      expect(third.status).toBe(0);
      expect(readFileSync(join(dir, legacyA), 'utf-8')).not.toContain('pre-wave 3.0.0');
      expect(readFileSync(join(dir, mutatedRel), 'utf-8')).not.toContain('local owner edit');
      const takenBackup = third.json.backups.find((b: { file: string }) => b.file === mutatedRel);
      expect(takenBackup, 'mutated backed up on take').toBeTruthy();
      expect(readFileSync(join(dir, takenBackup.backup), 'utf-8')).toContain('local owner edit');

      // rollback (release-note procedure): the owner's edit is preserved in
      // backup — copy back restores it (legacy base versions roll back by
      // reinstalling the 3.0.0 package, outside e2e scope)
      copyFileSync(join(dir, takenBackup.backup), join(dir, mutatedRel));
      expect(readFileSync(join(dir, mutatedRel), 'utf-8')).toContain('local owner edit');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180_000);
});
