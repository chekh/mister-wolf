import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { resolveWorktreeIdentity } from '../../src/adapters/fs/memory-root.js';

// patch 3.4.5 review (P2): кэш identity-пути хранит ТОЛЬКО успешные полные
// перечисления `git worktree list`. Отказ (refusals → fail-closed null) НЕ
// кэшируется: временная недоступность (EACCES на родителе зарегистрированного
// wt) не должна оставать заметку скрытой до перезапуска процесса — после
// возврата прав identity резолвится В ТОЙ ЖЕ сессии (приёмка владельца).
// Успешное перечисление кэшируется как раньше (NFR-01: ≤1 git-спавн на процесс).
// chmod-тест значим только для не-root (прецедент F-1 ревью ef61bfaf).

const RUN_AS_NON_ROOT = process.getuid?.() !== 0;
const itNonRoot = RUN_AS_NON_ROOT ? it : it.skip;

const cleanupDirs: string[] = [];
afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

function makeRepo(name: string): { root: string; wt: string; wtParent: string } {
  const root = mkdtempSync(join(tmpdir(), `wolf-p2-${name}-`));
  cleanupDirs.push(root);
  mkdirSync(join(root, 'main'));
  const main = join(root, 'main');
  const git = (args: string[]): void => execFileSync('git', args, { cwd: main, stdio: 'pipe' });
  git(['init', '-q', '.']);
  git(['config', 'user.email', 't@t.local']);
  git(['config', 'user.name', 't']);
  writeFileSync(join(main, 'f.txt'), 'x\n');
  git(['add', '.']);
  git(['commit', '-qm', 'init']);
  const wt = join(root, 'wt');
  git(['worktree', 'add', '-q', wt, '-b', 'wtb']);
  // второй wt в ОТДЕЛЬНОМ родителе (сценарий владельца: закрывается РОДИТЕЛЬ)
  const wtParent = join(root, 'wt-parent');
  mkdirSync(wtParent);
  git(['worktree', 'add', '-q', join(wtParent, 'wt-ext'), '-b', 'wtb2']);
  return { root, wt, wtParent };
}

describe('patch 3.4.5 review P2/F-B: refusals are not cached on the identity path', () => {
  itNonRoot(
    'a refused enumeration is not cached: identity resolves again in the same process after rights return; a successful enumeration stays cached',
    () => {
      const { root, wt, wtParent } = makeRepo('eacces');
      // «при отказе»: ПЕРВОЕ перечисление этой сессии попадает в отказ (wt-ext
      // за закрытым родителем) → fail-closed null
      chmodSync(wtParent, 0o000);
      let refusedIdentity: ReturnType<typeof resolveWorktreeIdentity>;
      try {
        refusedIdentity = resolveWorktreeIdentity(wt);
      } finally {
        chmodSync(wtParent, 0o755);
      }
      expect(refusedIdentity).toBeNull();

      // возврат прав В ТОЙ ЖЕ СЕССИИ (процесс не перезапускался): отказ не
      // кэширован — перечисление повторяется и identity резолвится
      const recovered = resolveWorktreeIdentity(wt);
      expect(recovered).not.toBeNull();
      expect(recovered!.legacyUnique).toBe(true);

      // успех кэшируется как раньше: дубль basename, появившийся ПОСЛЕ
      // кэширования, не виден (свежее перечисление дало бы legacyUnique false)
      mkdirSync(join(root, 'copy'));
      execFileSync('git', ['worktree', 'add', '-q', join(root, 'copy', 'wt'), '-b', 'wtb3'], {
        cwd: wt,
        stdio: 'pipe',
      });
      expect(resolveWorktreeIdentity(wt)!.legacyUnique).toBe(true);
    },
    120_000
  );

  itNonRoot(
    'F-B: a NEW refusal is detected despite a WARM success cache (the cache must not shield it): identity hides again and recovers after rights return in the same session',
    () => {
      const { wt, wtParent } = makeRepo('warm');
      // прогрев: первое перечисление успешно и закэшировано
      const warm = resolveWorktreeIdentity(wt);
      expect(warm).not.toBeNull();
      expect(warm!.legacyUnique).toBe(true);

      // наступивший отказ при ПРОГРЕТОМ кэше: тёплый успех не экранирует его —
      // перечисление устарело (путь wt2 стал недостижим) → fail-closed
      chmodSync(wtParent, 0o000);
      let during: ReturnType<typeof resolveWorktreeIdentity>;
      try {
        during = resolveWorktreeIdentity(wt);
      } finally {
        chmodSync(wtParent, 0o755);
      }
      expect(during).toBeNull(); // «при неполном списке заметка скрыта»

      // возврат прав В ТОЙ ЖЕ сессии: отказ не кэширован → перечисление
      // повторяется, identity снова резолвится («снова выдаётся»)
      const recovered = resolveWorktreeIdentity(wt);
      expect(recovered).not.toBeNull();
      expect(recovered!.legacyUnique).toBe(true);
    },
    120_000
  );
});
