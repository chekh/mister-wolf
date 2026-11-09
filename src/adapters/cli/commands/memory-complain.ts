import { Command } from 'commander';
import { safeCwd } from '../cli-entry.js';
import { addMemoryObject } from '../../../app/use-cases/add-memory-object.js';
import { recordRelation } from '../../../app/use-cases/record-relation.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { resolveCreatedBy } from '../../../domain/actor.js';
import { appendComplaintSignal } from '../../../adapters/fs/session-metrics-log.js';
import { UserFacingError } from '../../../domain/errors.js';
import {
  COMPLAINT_KINDS,
  resolveComplaintTarget,
  resolveGlobalConfigDir,
  type ComplaintKind,
} from './complaint-target.js';

// Жалобный контур v2 (спека 2026-09-01 §4.2, Q1/Q2): жалоба — структурированный
// объект типа complaint (required: about/rule/evidence/proposal), статус open;
// триаж — диспетчер (executor-lead), Стюарда воркер не вызывает. Прежний
// носитель observation сохранён для семантических наблюдений; продюсеров
// observation кроме этой команды в src/ нет (проверено спекой §3.1).
// R-13a (3.0.0): цели-агенты резолвятся по актуальному составу интеграции
// OpenCode (complaint-target.ts), не по константному списку: пользовательские
// агенты принимаются без правки кода, существование цели и kind — из одного резолва.
export type { ComplaintKind } from './complaint-target.js';

// baseDir и env инъектятся для тестов (прецедент: runValidate в memory-validate.ts;
// env — изоляция глобальных источников от реального $HOME);
// при обычной регистрации в cli-entry cwd идёт через safeCwd (§2.5).
export function memoryComplainCommand(baseDir: string = safeCwd(), env: NodeJS.ProcessEnv = process.env): Command {
  return new Command('complain')
    .description('File a complaint about a rule/playbook/agent as a memory object (type complaint, status open)')
    .requiredOption('--about <about>', 'Complaint target: agent id, skill:<name> or existing mem-id')
    .requiredOption('--rule <rule>', 'Which rule is bad (pointer + what it requires)')
    .option('--evidence <evidence>', 'Proof: verbatim quote + what happened (file/test/numbers)')
    .option('--text <text>', 'Deprecated alias for --evidence')
    .requiredOption('--proposal <proposal>', 'Proposed change to the rule')
    .option('--kind <kind>', 'Complaint kind: technical | behavioral (default: heuristic by --about)')
    .option('--created-by <actor>', 'Creator actor (default: env WOLF_ACTOR, else user:cli)')
    .action(async (options) => {
      const evidence = options.evidence ?? options.text;
      if (!evidence) {
        throw new UserFacingError('--evidence is required (deprecated alias: --text)');
      }
      if (options.kind !== undefined && !(COMPLAINT_KINDS as readonly string[]).includes(options.kind)) {
        throw new UserFacingError(`Invalid --kind "${options.kind}": expected technical or behavioral`);
      }
      const { store, log, clock, idGen, index, relations, lock, declarations, fs } = createCliContainer(baseDir);
      // ЕДИНЫЙ резолв цели (R-13a): существование и дефолтный kind — из одного результата.
      const resolution = await resolveComplaintTarget(options.about, {
        fs,
        store,
        baseDir,
        globalConfigDir: resolveGlobalConfigDir(env),
      });
      if (!resolution.known) {
        throw new UserFacingError(
          `Unknown --about target "${options.about}": expected an agent of the OpenCode integration ` +
            `(project .opencode/agents, global agents dir, "agent" key in opencode.json(c)), ` +
            `skill:<name> or existing mem-id`
        );
      }
      const kind: ComplaintKind | undefined = (options.kind as ComplaintKind | undefined) ?? resolution.defaultKind;
      const now = clock.now();
      const shortRule = options.rule.length > 60 ? `${options.rule.slice(0, 60)}…` : options.rule;
      const result = await addMemoryObject(
        { store, log, clock, idGen, index, lock, declarations },
        {
          type: 'complaint',
          title: `Complaint about ${options.about}: ${shortRule}`,
          // 2.32.0: заголовок жалобы — производная метка; несколько жалоб на то же
          // правило законны, поэтому id различается по содержанию, а не по title.
          idFingerprint: [options.about, options.rule, evidence, options.proposal, kind ?? ''].join('\u0000'),
          body: evidence,
          createdBy: resolveCreatedBy(options.createdBy),
          tags: ['complaint'],
          extra: {
            about: options.about,
            rule: options.rule,
            evidence,
            proposal: options.proposal,
            ...(kind !== undefined ? { kind } : {}),
          },
        }
      );
      const id = result.object.id;
      // Адресат — agent-id, skill:<имя> или mem-id; обе формы допустимы как object.
      await recordRelation({ relations, idGen, lock }, now, id, 'complain', options.about, 'manual');
      // Ф20 (б): hot-signal Стюарду; текст сигнала — evidence (спека §4.2)
      appendComplaintSignal(baseDir, {
        about: options.about,
        text: evidence,
        actor: resolveCreatedBy(options.createdBy),
        objectId: id,
      });
      // kind — отдельной строкой: существующие парсеры id читают split(': ')[1]
      console.log(`Complaint recorded: ${id}`);
      console.log(`Complaint kind: ${kind ?? '—'}`);
      console.log(`Relation recorded: ${id} -complain-> ${options.about}`);
    });
}
