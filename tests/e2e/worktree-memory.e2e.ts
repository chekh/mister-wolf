import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { rmSync, existsSync, readdirSync, readFileSync } from 'fs';
import { basename, join } from 'path';
import { ensureBuilt, runCli, tmpProject, writeLegacyInjection } from './helpers.js';
import { worktreeScopeToken } from '../../src/adapters/fs/memory-root.js';

// 2.17.1 REQ-02 (R02): запись из ворктрии даёт WT-ID scope worktree:w-<12hex>
// (S-18, ADR-1); promote из main — честный 0 (S-17), из копии — оба токена
// владельца (S-15); legacy-семейство scope сосуществует после обновления.
describe('worktree memory (2.17.1 REQ-02: WT-ID scope, S-15/S-17/S-18)', () => {
  let main: string;
  let wt: string;
  let wtId: string; // WT-ID токен копии: w-<12 hex sha1(realpath(wt))>
  beforeAll(() => {
    ensureBuilt();
    main = tmpProject();
    execSync('git init -b main', { cwd: main });
    execSync('git -c user.email=t@t -c user.name=t commit -m init --allow-empty', { cwd: main });
    wt = join(main, '..', 'wt-e2e');
    execSync(`git worktree add "${wt}" -b wt-branch`, { cwd: main });
    wtId = worktreeScopeToken(wt);
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

  it('S-18: note written in worktree gets WT-ID scope worktree:w-<12hex> in the common store', () => {
    expect(
      runCli(['add', '--type', 'note', '--facet', 'context', '--title', 'wt only', '--created-by', 'user:t'], wt).status
    ).toBe(0);
    // layout v2: note живёт в shared/notes/<id>.md (не плоско в memory/)
    const notesDir = join(main, '.wolf', 'memory', 'shared', 'notes');
    const files = readdirSync(notesDir).filter((f) => f.endsWith('.md'));
    expect(files.length).toBeGreaterThan(0);
    // init-report (из main) scope не имеет — worktree-scope может прийти
    // только из записи, созданной в worktree; токен — детерминированный
    // sha1(realpath(wt))[:12], не basename (отменённый контракт 2.16)
    const raw = files.map((f) => readFileSync(join(notesDir, f), 'utf-8')).join('\n');
    expect(raw).toContain(`scope: worktree:${wtId}`);
  });

  it('S-17/S-15: main hides worktree-scoped; promote from main is honest 0, from the copy — main-visible', () => {
    // Пул доставки — легаси call-injection (wave13-a/P211): plain note из `wolf add`
    // в пул не попадает, поэтому pooled-объект со scope ворктрии сеется в общий
    // .wolf тем же механизмом, что в call-фикстурах.
    writeLegacyInjection(main, {
      id: 'inj_wt_only',
      title: 'wt only',
      body: 'worktree-only fact',
      trigger_keywords: [],
      created_by: 'user:t',
      scope: `worktree:${wtId}`,
    });
    const call1 = runCli(['call'], main);
    expect(call1.stdout).not.toContain('wt only');
    expect(call1.stdout).toContain('scope filter hid');
    expect(call1.stdout).toContain('wolf promote');
    // своя копия видит собственный WT-ID-scoped объект
    expect(runCli(['call'], wt).stdout).toContain('wt only');
    // S-17 (+MINOR-3): promote из main — identity null, честный «Promoted 0»,
    // exit 0 на CLI-уровне, объекты не изменены
    const prMain = runCli(['promote', basename(wt)], main);
    expect(prMain.status).toBe(0);
    expect(prMain.stdout).toContain('Promoted 0');
    const call2 = runCli(['call'], main);
    expect(call2.stdout).not.toContain('wt only');
    expect(call2.stdout).toContain('scope filter hid');
    // S-15: promote из копии — оба WT-ID объекта (пул + plain note из S-18-кейса)
    // становятся main; promote — тип-агностичен
    const pr = runCli(['promote', basename(wt)], wt);
    expect(pr.status).toBe(0);
    expect(pr.stdout).toContain('Promoted 2');
    // «после promote виден»: visibility через get из main И из linked
    // worktree (общий .wolf/). Постпромо call-доставка пула неосуществима по
    // архитектуре: store.update канонизирует алиас (P211) → объект покидает
    // пул доставки (решение диспетчера по блокеру задачи 5, вариант Б).
    expect(runCli(['get', 'inj_wt_only'], main).stdout).toContain('wt only');
    expect(runCli(['get', 'inj_wt_only'], wt).stdout).toContain('wt only');
  });

  it('orphaned scope is a doctor finding (no auto-cleanup, P3); живая WT-ID-копия — не orphan (F-02)', () => {
    // Предсказуемая фикстура: отдельные scope, чьи ворктрии никогда не
    // существовали — гарантированно не промоутированы и не зависят от
    // исхода предыдущих кейсов. Живой WT-ID-токен (формат w-<sha12>) не
    // совпадает с именами каталогов .git/worktrees — раньше репортился
    // ложным orphan'ом; теперь сверяется с токенами живых копий.
    writeLegacyInjection(main, {
      id: 'inj_wt_live_scope',
      title: 'live wt fact',
      body: 'live worktree-scoped fact',
      trigger_keywords: [],
      created_by: 'user:t',
      scope: `worktree:${wtId}`,
    });
    writeLegacyInjection(main, {
      id: 'inj_orphan',
      title: 'orphan fact',
      body: 'legacy scope without a worktree',
      trigger_keywords: [],
      created_by: 'user:t',
      scope: 'worktree:wt-gone',
    });
    const d = runCli(['doctor'], main);
    expect(d.stdout).toContain('Orphaned worktree scopes');
    expect(d.stdout).toContain('worktree:wt-gone');
    expect(d.stdout).not.toContain(`worktree:${wtId}`);
  });
});
