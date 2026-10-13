// src/adapters/cli/commands/claim.ts
import { Command } from 'commander';
import { safeCwd } from '../cli-entry.js';
import {
  acquireArtifactClaim,
  listArtifactClaims,
  releaseArtifactClaim,
} from '../../../app/use-cases/claim-artifact.js';
import { claimFilePath, ClaimHeldError } from '../../fs/claim-registry.js';
import { resolveMemoryRoot } from '../../fs/memory-root.js';
import { UserFacingError } from '../../../domain/errors.js';

/** 2.17.1 REQ-05 (R06), design §3.5: `wolf claim acquire|release|list` —
 * тонкая обёртка use-case-слоя; идентичность — env (WOLF_ACTOR/WOLF_SESSION),
 * как у face-команд (ADR-5: флаг --created-by не экспортируем). */

export function claimCommand(baseDir: string = safeCwd()): Command {
  const cmd = new Command('claim').description(
    'Single-writer claims on shared artifacts (TASK briefs, plans, reports, worktrees)'
  );

  cmd
    .command('acquire')
    .description('Atomically acquire artifact ownership (second concurrent writer is rejected)')
    .argument('<artifact>', 'Artifact id, e.g. "dev:<date>-<slug>" or "worktree:w-<12hex>"')
    .action((artifact: string) => {
      try {
        // FIX-1 (CRITICAL-1, ревью T5): CLI-процесс одноразовый — его pid мёртв
        // сразу после выхода, и claim деградировал в «stale» (owner-lockout
        // scaffold'а и мгновенный перехват конкурентом). Держатель claim'а —
        // агент-сессия (owner+session): пишем pid 0 = liveness неизвестна,
        // владение живёт до TTL или передачи (pidAlive: pid<=0 — жив до TTL).
        const rec = acquireArtifactClaim({ baseDir, pid: 0 }, artifact);
        console.log(`Claim acquired: ${rec.artifact}`);
        console.log(`owner ${rec.owner} (session ${rec.session_id ?? '-'}, pid ${rec.pid})`);
        console.log(`claim file: ${claimFilePath(resolveMemoryRoot(baseDir).root, artifact)}`);
      } catch (err) {
        if (err instanceof ClaimHeldError) {
          throw new UserFacingError(`Claim already held by ${err.owner} — ${err.claimPath} (${err.reason})`);
        }
        throw err;
      }
    });

  cmd
    .command('release')
    .description('Release artifact ownership (owner-only) or transfer it explicitly')
    .argument('<artifact>', 'Artifact id to release')
    .option('--transfer-to <actor>', 'Hand ownership over to another actor instead of dropping the claim')
    .action((artifact: string, options: { transferTo?: string }) => {
      const res = releaseArtifactClaim({ baseDir }, artifact, options.transferTo);
      if (res.action === 'transferred') {
        console.log(`Claim for ${artifact} transferred to ${res.owner}`);
      } else {
        console.log(`Released claim: ${artifact}`);
      }
    });

  cmd
    .command('list')
    .description('List active claims (who/when/what, from the registry files)')
    .action(() => {
      const claims = listArtifactClaims({ baseDir });
      if (claims.length === 0) {
        console.log('No active claims');
        return;
      }
      for (const c of claims) {
        console.log(
          `${c.artifact} — ${c.owner} (session ${c.session_id ?? '-'}, pid ${c.pid}) acquired ${c.acquired_at} in ${c.cwd}`
        );
      }
    });

  return cmd;
}
