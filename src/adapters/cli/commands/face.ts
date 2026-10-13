// src/adapters/cli/commands/face.ts
import { Command, Option } from 'commander';
import { readFileSync } from 'fs';
import { safeCwd } from '../cli-entry.js';
import { createFaceVersion, type FaceObject } from '../../../app/use-cases/create-face-version.js';
import { abortFaceOperation, resumeFaceOperation } from '../../../app/use-cases/face-operation.js';
import { migrateFaces } from '../../../app/use-cases/migrate-faces.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { MemoryStore } from '../../../ports/memory-store.port.js';
import { UserFacingError } from '../../../domain/errors.js';

/** Волна 2.17 T-04 (design §«CLI: проектируемые команды», REQ-03/04/05/07/10):
 * группа `wolf face` — тонкая обёртка: мутации идут только через use-case
 * createFaceVersion (guard, номер версии, supersede, события и G17-запись —
 * внутри него), наблюдаемость (list/history/show) — через store, без чтения
 * файлов памяти напрямую. Никакой логики версионирования в CLI (план T-04).
 *
 * ADR-5: атрибуция — только env (WOLF_ACTOR / WOLF_SESSION); флаг --created-by
 * не экспортируется — передан → явный отказ с пояснением. */

/** Скрытая ловушка ADR-5: парсится, но не показывается в help; отказ — в action. */
function createdByTrap(sub: Command): Command {
  // commander 12: Option#hide() отсутствует — скрытость через свойство hidden
  const trap = new Option('--created-by <actor>', '');
  trap.hidden = true;
  return sub.addOption(trap);
}

function denyCreatedBy(options: { createdBy?: string }): void {
  if (options.createdBy !== undefined) {
    throw new UserFacingError(
      'face commands do not accept --created-by: attribution is env-only (WOLF_ACTOR / WOLF_SESSION, design ADR-5)'
    );
  }
}

/** Версии владельца через store (REQ-10: без прямого чтения файлов памяти). */
async function facesOfOwner(store: MemoryStore, ownerSkill: string): Promise<FaceObject[]> {
  return (await store.list({ type: 'face' }))
    .filter((o) => (o as FaceObject).owner_skill === ownerSkill)
    .map((o) => o as FaceObject);
}

interface NewOptions {
  reason: string;
  body?: string;
  file?: string;
  title?: string;
  tags?: string;
  minimalChange: string;
  boundaries: string;
  exampleHelps: string;
  exampleKeep: string;
  verification: string;
  rollback: string;
  /** T-09: id предложения, породившего версию (relation proposes; не применение). */
  fromProposal?: string;
  /** 2.17.1 REQ-03: id операции — resume/идемпотентный повтор (design §3.3). */
  opId?: string;
  createdBy?: string;
}

interface RecoverOptions {
  /** abort: candidate → archived + op_aborted; только до activation (§3.3). */
  abort?: boolean;
  createdBy?: string;
}

interface RestoreOptions {
  from: string;
  reason: string;
  createdBy?: string;
}

interface ObserveOptions {
  createdBy?: string;
}

// baseDir инъектится для тестов (прецедент: memory-relation.ts).
export function faceCommand(baseDir: string = safeCwd()): Command {
  const cmd = new Command('face').description('Manage faces (versioned agent playbooks)');

  const g17 = (sub: Command): Command =>
    sub
      .requiredOption('--minimal-change <t>', 'G17: what exactly changes (REQ-06)')
      .requiredOption('--boundaries <t>', 'G17: what does NOT change (essence/frame)')
      .requiredOption('--example-helps <t>', 'G17: example that benefits from the change')
      .requiredOption('--example-keep <t>', 'G17: example that must keep working')
      .requiredOption('--verification <t>', 'G17: how to verify the mutation')
      .requiredOption('--rollback <t>', 'G17: how to roll back');

  g17(
    createdByTrap(
      cmd
        .command('new')
        .description('Create a new face version (steward-only; guard inside the use-case)')
        .argument('<owner_skill>', 'Owner skill, e.g. skill:my-agent')
        .requiredOption('--reason <t>', 'Why this version exists (REQ-04)')
        .option('--body <md>', 'Face body markdown')
        .option('--file <path>', 'Read face body from a file (alternative to --body)')
        .option('--title <title>', 'Face title (default: "Face: <owner_skill>")')
        .option('--tags <tags>', 'Comma-separated tags')
        .option('--from-proposal <id>', 'Link the new version to a proposal (relation: proposes)')
        .option('--op-id <id>', 'Operation id: resume an interrupted mutation (default: generated faceop-<ts>-<rand4>)')
    )
  ).action(async (ownerSkill: string, options: NewOptions) => {
    denyCreatedBy(options);
    let body = options.body;
    if (options.file !== undefined) {
      if (body !== undefined) throw new UserFacingError('face new: use either --body or --file, not both');
      try {
        body = readFileSync(options.file, 'utf8');
      } catch {
        throw new UserFacingError(`face new: cannot read body file: ${options.file}`);
      }
    }
    const result = await createFaceVersion(createCliContainer(baseDir), {
      command: 'new',
      ownerSkill,
      reason: options.reason,
      body,
      title: options.title,
      tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : undefined,
      minimalChange: options.minimalChange,
      boundaries: options.boundaries,
      exampleHelps: options.exampleHelps,
      exampleKeep: options.exampleKeep,
      verification: options.verification,
      rollback: options.rollback,
      fromProposal: options.fromProposal,
      opId: options.opId,
    });
    const superseded = result.supersededId ? ` (superseded ${result.supersededId})` : '';
    const mutation = result.mutationRecordId ? `; mutation record ${result.mutationRecordId}` : '';
    console.log(`Created face ${ownerSkill} v${result.face.version} ${result.face.id}${superseded}${mutation}`);
    console.log(`operation ${result.opId}`); // REQ-03: печатается для wolf face recover
  });

  // restore и breakglass — один и тот же версионирующий путь (REQ-05: новая
  // версия с based_on); разница — initiator и журнал breakglass (REQ-07 AC2),
  // оба решает use-case. CLI не вызывает Стюарда ни в одном пути.
  const restoreLike = (name: 'restore' | 'breakglass', description: string): void => {
    createdByTrap(
      cmd
        .command(name)
        .description(description)
        .argument('<owner_skill>', 'Owner skill, e.g. skill:my-agent')
        .requiredOption('--from <id|vN>', 'Base version: memory id or version number (v2|2)')
        .requiredOption('--reason <t>', 'Why this version exists (REQ-04)')
    ).action(async (ownerSkill: string, options: RestoreOptions) => {
      denyCreatedBy(options);
      const result = await createFaceVersion(createCliContainer(baseDir), {
        command: name,
        ownerSkill,
        reason: options.reason,
        from: options.from,
      });
      console.log(
        `Created face ${ownerSkill} v${result.face.version} ${result.face.id} from ${options.from}` +
          ` (initiator: ${result.face.initiator})`
      );
    });
  };
  restoreLike('restore', 'Restore an old version as a NEW one (owner; linear history, REQ-05)');
  restoreLike('breakglass', 'Emergency rollback by the owner (steward not involved; logged, REQ-07)');

  // 2.17.1 REQ-03 (design §3.3): восстановление операции по opId. Без флага —
  // дозавершение оставшихся шагов (идемпотентно); --abort — только до
  // activation: candidate → archived + op_aborted, история не уничтожается.
  createdByTrap(
    cmd
      .command('recover')
      .description(
        'Resume an interrupted face operation by op id (--abort: archive the candidate, pre-activation only)'
      )
      .argument('<op_id>', 'Operation id (printed by face new; also wolf doctor)')
      .option('--abort', 'Abort the operation instead of resuming (only before activation)')
  ).action(async (opId: string, options: RecoverOptions) => {
    denyCreatedBy(options);
    const container = createCliContainer(baseDir);
    if (options.abort) {
      const result = await abortFaceOperation(container, opId);
      const face = result.archivedFaceId ? ` (candidate ${result.archivedFaceId} archived)` : '';
      console.log(`Aborted face operation ${opId}${face}`);
      return;
    }
    const result = await resumeFaceOperation(container, opId);
    console.log(
      `Recovered face operation ${opId}: ${result.face.owner_skill} v${result.face.version} ${result.face.id}`
    );
  });

  // T-05 (REQ-02, design §Миграция): идемпотентная физическая миграция
  // legacy-playbook → face; вся механика (поэтапность, skip, отчёт) — в
  // use-case migrateFaces, CLI только печатает отчёт.
  createdByTrap(
    cmd.command('migrate').description('Migrate legacy playbook notes to faces (idempotent, REQ-02)')
  ).action(async (options: ObserveOptions) => {
    denyCreatedBy(options);
    const report = await migrateFaces(createCliContainer(baseDir));
    for (const o of report.outcomes) {
      if (o.action === 'migrated') {
        console.log(`Migrated ${o.ownerSkill} -> ${o.faceId} (superseded legacy head ${o.headId})`);
      } else {
        console.log(`Skipped ${o.ownerSkill}: ${o.reason}`);
      }
    }
    if (report.skippedHowtoIds.length > 0) {
      console.log(
        `Skipped ${report.skippedHowtoIds.length} howto note(s) without owner_skill (not every howto is a face): ` +
          report.skippedHowtoIds.join(', ')
      );
    }
    // §Отказов: падение на N-м не откатывает N-1 — честный ненулевой exit
    for (const f of report.failed) {
      console.error(`! ${f.ownerSkill}: ${f.error}`);
    }
    if (report.failed.length > 0) process.exitCode = 1;
    if (report.outcomes.length === 0 && report.skippedHowtoIds.length === 0 && report.failed.length === 0) {
      console.log('Nothing to migrate.');
    }
  });

  createdByTrap(cmd.command('list').description('List faces: owner_skill, current version, id, status')).action(
    async (options: ObserveOptions) => {
      denyCreatedBy(options);
      const { store } = createCliContainer(baseDir);
      const heads = new Map<string, FaceObject>();
      for (const obj of await store.list({ type: 'face' })) {
        const f = obj as FaceObject;
        const cur = heads.get(f.owner_skill);
        // REQ-03: candidate (неполный канон) скрыт из головы — активная версия
        // канона; дубль активных — территория doctor (NFR-02), здесь старшая.
        const fActive = f.status === 'active';
        const cActive = cur?.status === 'active';
        const better =
          !cur || (fActive && !cActive) || (fActive === cActive && Number(f.version) > Number(cur.version));
        if (better) heads.set(f.owner_skill, f);
      }
      if (heads.size === 0) {
        console.log('No faces.');
        return;
      }
      for (const [owner, f] of [...heads.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        console.log(`${owner}  v${f.version}  ${f.id}  [${f.status}]`);
      }
    }
  );

  createdByTrap(
    cmd
      .command('history')
      .description('Show version history of a face (newest first)')
      .argument('<owner_skill>', 'Owner skill')
  ).action(async (ownerSkill: string, options: ObserveOptions) => {
    denyCreatedBy(options);
    const { store } = createCliContainer(baseDir);
    const versions = (await facesOfOwner(store, ownerSkill)).sort((a, b) => Number(b.version) - Number(a.version));
    if (versions.length === 0) throw new UserFacingError(`No face found for ${ownerSkill}`);
    for (const f of versions) {
      const based = f.based_on ? `based_on=${f.based_on}  ` : '';
      console.log(
        `v${f.version}  ${f.id}  [${f.status}]  initiator=${f.initiator}  ${based}at=${f.created_at}  ${f.reason}`
      );
    }
  });

  createdByTrap(
    cmd
      .command('show')
      .description('Show the current face version: metadata and body')
      .argument('<owner_skill>', 'Owner skill')
  ).action(async (ownerSkill: string, options: ObserveOptions) => {
    denyCreatedBy(options);
    const { store } = createCliContainer(baseDir);
    const active = (await facesOfOwner(store, ownerSkill))
      .filter((f) => f.status === 'active')
      .sort((a, b) => Number(b.version) - Number(a.version))[0];
    if (!active) throw new UserFacingError(`No active face for ${ownerSkill}`);
    console.log(`${active.owner_skill}  v${active.version}  ${active.id}  [${active.status}]`);
    console.log(`initiator: ${active.initiator}`);
    console.log(`reason: ${active.reason}`);
    console.log(`based_on: ${active.based_on ?? '—'}`);
    console.log(`title: ${active.title}`);
    if (active.tags && active.tags.length > 0) console.log(`tags: ${active.tags.join(', ')}`);
    console.log(`created: ${active.created_at}`);
    console.log('---');
    console.log(active.body ?? '');
  });

  return cmd;
}
