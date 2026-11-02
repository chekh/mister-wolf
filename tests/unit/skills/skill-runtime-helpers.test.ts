import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { OpencodeBaseSetRenderer } from '../../../src/adapters/render/opencode/opencode-renderer.js';

const repo = process.cwd();
const dirs: string[] = [];
function temp() {
  const d = mkdtempSync(join(tmpdir(), 'wolf-helper-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function python(script: string, args: string[]) {
  const r = spawnSync('python3', [script, ...args], { encoding: 'utf8', timeout: 15000 });
  return { code: r.status, result: JSON.parse(r.stdout || '{}'), stderr: r.stderr };
}
const reader = resolve(repo, 'templates/base/skills/wolf-feedback/scripts/session-reader.py');
const helper = resolve(repo, 'templates/base/skills/wolf-execute/scripts/workflow-helper.py');
function git(d: string, ...args: string[]) {
  return execFileSync('git', ['-C', d, ...args], { encoding: 'utf8' }).trim();
}
function project() {
  const d = temp();
  git(d, 'init', '-q');
  git(d, 'config', 'user.name', 'Test');
  git(d, 'config', 'user.email', 'test@example.invalid');
  writeFileSync(join(d, 'file.txt'), 'one');
  git(d, 'add', 'file.txt');
  git(d, 'commit', '-qm', 'base');
  return d;
}

describe('delivered skills and runtime helpers', () => {
  it('renders dependencies and Python comments without breaking execution, preserving protect on refresh', async () => {
    const d = temp();
    const render = new OpencodeBaseSetRenderer(resolve(repo, 'templates/base'), { setVersion: '9.9.9' });
    await render.renderBaseSet(d);
    const skills = join(d, '.opencode/skills');
    for (const file of [
      'wolf-feedback/SKILL.md',
      'wolf-feedback/references/complaints.md',
      'using-skills/references/contracts.md',
      'using-skills/references/routes-quality.md',
      'wolf-visual-dialogue/SKILL.md',
    ])
      expect(existsSync(join(skills, file))).toBe(true);
    for (const file of ['wolf-feedback/scripts/session-reader.py', 'wolf-execute/scripts/workflow-helper.py']) {
      const path = join(skills, file);
      expect(readFileSync(path, 'utf8').startsWith('#!/usr/bin/env python3\n# wolf:rendered')).toBe(true);
      const r = spawnSync('python3', [path, '--help'], { encoding: 'utf8' });
      expect(r.status, r.stderr).toBe(0);
    }
    const held = join(skills, 'wolf-feedback/SKILL.md');
    writeFileSync(
      held,
      readFileSync(held, 'utf8').replace('name: wolf-feedback', 'name: wolf-feedback\nprotect: true')
    );
    const content = readFileSync(held, 'utf8');
    const refresh = await render.renderBaseSet(d);
    expect(readFileSync(held, 'utf8')).toBe(content);
    expect(refresh.find((x) => x.file.endsWith('wolf-feedback/SKILL.md'))?.protected).toBe(true);
  });
  it('reads root and child locators in bounded pages without changing the source database', () => {
    const d = temp(),
      path = join(d, 'history.db');
    const db = new Database(path);
    db.exec(
      'CREATE TABLE session_v2(id TEXT PRIMARY KEY,parent_id TEXT,time_created INTEGER); CREATE TABLE session_message(id TEXT PRIMARY KEY,session_id TEXT,type TEXT,time_created INTEGER,data TEXT);'
    );
    const session = db.prepare('INSERT INTO session_v2 VALUES(?,?,?)');
    session.run('parent', null, 1);
    session.run('child', 'parent', 2);
    session.run('other', null, 3);
    const m = db.prepare('INSERT INTO session_message VALUES(?,?,?,?,?)');
    m.run('m1', 'parent', 'user', 1, JSON.stringify({ text: 'question' }));
    m.run('m2', 'child', 'user', 2, JSON.stringify({ text: 'assigned task' }));
    m.run('m3', 'child', 'assistant', 3, JSON.stringify({ text: 'x'.repeat(100000) }));
    m.run('m4', 'other', 'user', 4, JSON.stringify({ text: 'unrelated' }));
    db.close();
    const digest = () => createHash('sha256').update(readFileSync(path)).digest('hex');
    const before = digest();
    const r = python(reader, ['--db', path, '--session', 'parent', '--children', '--limit', '2']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.result.records.map((v: { session_id: string }) => v.session_id)).toEqual(['parent', 'child']);
    expect(r.result.records[1].author_interpretation).toBe('parent_or_injected');
    expect(r.result.next_offset).toBe(2);
    const tail = python(reader, ['--db', path, '--session', 'parent', '--children', '--offset', '2']);
    expect(tail.result.records[0].gaps.join(' ')).toContain('exceeds');
    expect(JSON.stringify(tail.result).length).toBeLessThan(4000);
    expect(digest()).toBe(before);
    expect(python(reader, ['--db', path, '--session', 'missing']).code).toBe(2);
  });
  it('does not create an absent database or guess a schema', () => {
    const path = join(temp(), 'absent.db');
    expect(python(reader, ['--db', path, '--session', 's']).code).toBe(2);
    expect(existsSync(path)).toBe(false);
    const db = new Database(path);
    db.exec('CREATE TABLE unknown(x)');
    db.close();
    expect(python(reader, ['--db', path, '--session', 's']).result.error).toContain('unsupported schema');
  });
  it('returns missing task inputs rather than fabricating a ready assignment', () => {
    const file = join(temp(), 'task.json');
    writeFileSync(file, JSON.stringify({ task_id: 't' }));
    const r = python(helper, ['task-pack', '--input', file]);
    expect(r.code).toBe(2);
    expect(r.result.ready).toBe(false);
    expect(r.result.missing).toContain('method');
  });
  it('records a failed verification honestly and preserves its log', () => {
    const root = project(),
      log = join(temp(), 'run.log');
    const r = python(helper, [
      'check',
      '--repo',
      root,
      '--task',
      't',
      '--claim',
      'criterion',
      '--log',
      log,
      '--',
      'node',
      '-e',
      'console.log("failed");process.exit(3)',
    ]);
    expect(r.code, r.stderr).toBe(1);
    expect(r.result.outcome).toBe('failed');
    expect(r.result.exit).toBe(3);
    expect(readFileSync(log, 'utf8')).toContain('failed');
    expect(r.result).not.toHaveProperty('ACCEPTED');
    expect(
      python(helper, [
        'check',
        '--repo',
        root,
        '--task',
        't',
        '--claim',
        'criterion',
        '--log',
        log,
        '--',
        'node',
        '-e',
        'process.exit(0)',
      ]).code
    ).toBe(2);
  });
  it('creates repeatable review packages and rejects empty or uncovered state', () => {
    const root = project(),
      base = git(root, 'rev-parse', 'HEAD'),
      out = join(temp(), 'review.diff');
    expect(
      python(helper, [
        'review-package',
        '--repo',
        root,
        '--task',
        't',
        '--base',
        base,
        '--head',
        'HEAD',
        '--output',
        out,
      ]).code
    ).toBe(2);
    writeFileSync(join(root, 'file.txt'), 'two');
    git(root, 'add', 'file.txt');
    git(root, 'commit', '-qm', 'change');
    const args = ['review-package', '--repo', root, '--task', 't', '--base', base, '--head', 'HEAD', '--output', out];
    expect(python(helper, args).code).toBe(0);
    const first = readFileSync(out, 'utf8');
    expect(first).toContain('+two');
    expect(python(helper, args).code).toBe(0);
    expect(readFileSync(out, 'utf8')).toBe(first);
    writeFileSync(join(root, 'new.txt'), 'not covered');
    expect(python(helper, args).result.error).toContain('not covered');
  });
});
