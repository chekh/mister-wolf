import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { rmSync, existsSync, readdirSync, readFileSync } from 'fs';
import { basename, join } from 'path';
import { ensureBuilt, runCli, tmpProject, writeLegacyInjection } from './helpers.js';

describe('worktree memory (спека 2.16 §14.8, часть записи)', () => {
  let main: string;
  let wt: string;
  beforeAll(() => {
    ensureBuilt();
    main = tmpProject();
    execSync('git init -b main', { cwd: main });
    execSync('git -c user.email=t@t -c user.name=t commit -m init --allow-empty', { cwd: main });
    wt = join(main, '..', 'wt-e2e');
    execSync(`git worktree add "${wt}" -b wt-branch`, { cwd: main });
  });
  afterAll(() => {
    rmSync(wt, { recursive: true, force: true });
    rmSync(main, { recursive: true, force: true });
  });

  it('worktree init writes the common .wolf into the main checkout', () => {
    expect(runCli(['init', '--yes'], wt).status).toBe(0);
    expect(existsSync(join(main, '.wolf', 'config.yaml'))).toBe(true);
    expect(existsSync(join(wt, '.wolf'))).toBe(false);
  });

  it('note written in worktree gets scope worktree:<name> in the common store', () => {
    expect(
      runCli(['add', '--type', 'note', '--facet', 'context', '--title', 'wt only', '--created-by', 'user:t'], wt).status
    ).toBe(0);
    // layout v2: note живёт в shared/notes/<id>.md (не плоско в memory/)
    const notesDir = join(main, '.wolf', 'memory', 'shared', 'notes');
    const files = readdirSync(notesDir).filter((f) => f.endsWith('.md'));
    expect(files.length).toBeGreaterThan(0);
    // init-report (из main) scope не имеет — строка worktree:<имя> может прийти
    // только из записи, созданной в worktree
    const raw = files.map((f) => readFileSync(join(notesDir, f), 'utf-8')).join('\n');
    expect(raw).toContain(`scope: worktree:${basename(wt)}`);
  });

  it('main call hides worktree-scoped objects; promote makes them main-visible (§14.8)', () => {
    // Пул доставки — легаси call-injection (wave13-a/P211): plain note из `wolf add`
    // в пул не попадает, поэтому pooled-объект со scope ворктрии сеется в общий
    // .wolf тем же механизмом, что в call-фикстурах.
    writeLegacyInjection(main, {
      id: 'inj_wt_only',
      title: 'wt only',
      body: 'worktree-only fact',
      trigger_keywords: [],
      created_by: 'user:t',
      scope: `worktree:${basename(wt)}`,
    });
    const call1 = runCli(['call'], main);
    expect(call1.stdout).not.toContain('wt only');
    expect(call1.stdout).toContain('scope filter hid');
    expect(call1.stdout).toContain('wolf promote');
    const pr = runCli(['promote', basename(wt)], main);
    expect(pr.status).toBe(0);
    // 2 = pooled-инъекция + plain note 'wt only' из кейса выше (обе получили
    // scope worktree:<имя> при записи из ворктрии); promote — тип-агностичен
    expect(pr.stdout).toContain('Promoted 2');
    // §14.8 «после promote виден»: visibility через get из main И из linked
    // worktree (общий .wolf/). Постпромо call-доставка пула неосуществима по
    // архитектуре: store.update канонизирует алиас (P211) → объект покидает
    // пул доставки (решение диспетчера по блокеру задачи 5, вариант Б).
    expect(runCli(['get', 'inj_wt_only'], main).stdout).toContain('wt only');
    expect(runCli(['get', 'inj_wt_only'], wt).stdout).toContain('wt only');
  });

  it('orphaned scope is a doctor finding (no auto-cleanup, P3)', () => {
    // «wt only» уже promoted (scope: main) предыдущим кейсом — нужен живой worktree-scoped объект
    expect(
      runCli(['add', '--type', 'note', '--facet', 'context', '--title', 'orphan fact', '--created-by', 'user:t'], wt)
        .status
    ).toBe(0);
    rmSync(wt, { recursive: true, force: true });
    // rmSync не снимает метаданные main/.git/worktrees/<имя> — doctor жив по readdir;
    // prune эмулирует реальный сценарий «ворктрия удалена»
    execSync('git worktree prune', { cwd: main });
    const d = runCli(['doctor'], main);
    expect(d.stdout).toContain('Orphaned worktree scopes');
    expect(d.stdout).toContain(`worktree:${basename(wt)}`);
  });
});
