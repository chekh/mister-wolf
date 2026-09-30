import { Command } from 'commander';
import { safeCwd } from '../cli-entry.js';
import { addMemoryObject } from '../../../app/use-cases/add-memory-object.js';
import { recordRelation } from '../../../app/use-cases/record-relation.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { resolveCreatedBy } from '../../../domain/actor.js';
import { appendComplaintSignal } from '../../../adapters/fs/session-metrics-log.js';
import { UserFacingError } from '../../../domain/errors.js';

// Жалобный контур v2 (спека 2026-09-01 §4.2, Q1/Q2): жалоба — структурированный
// объект типа complaint (required: about/rule/evidence/proposal), статус open;
// триаж — диспетчер (executor-lead), Стюарда воркер не вызывает. Прежний
// носитель observation сохранён для семантических наблюдений; продюсеров
// observation кроме этой команды в src/ нет (проверено спекой §3.1).
// Источник известных agent-id — 6 базовых агентов набора (base-sets §5.1).
const BASE_AGENT_IDS = [
  'executor-lead',
  'mr-wolf',
  'steward',
  'worker-implementer',
  'worker-researcher',
  'worker-reviewer',
] as const;

// Волна 2.14 §6.1: классификация жалоб technical/behavioral; дефолт —
// эвристика по about, флаг --kind переопределяет (владелец/лид всегда прав).
const COMPLAINT_KINDS = ['technical', 'behavioral'] as const;
export type ComplaintKind = (typeof COMPLAINT_KINDS)[number];

/** Дефолт-эвристика kind (спека §6.1): about = агент/скилл → behavioral;
 * mem-id → technical; прочее — без kind (явный только через --kind). */
export function inferComplaintKind(about: string): ComplaintKind | undefined {
  if ((BASE_AGENT_IDS as readonly string[]).includes(about) || about.startsWith('skill:')) return 'behavioral';
  if (about.startsWith('mem_')) return 'technical';
  return undefined;
}

// baseDir инъектится для тестов (прецедент: runValidate в memory-validate.ts);
// при обычной регистрации в cli-entry cwd идёт через safeCwd (§2.5).
export function memoryComplainCommand(baseDir: string = safeCwd()): Command {
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
      const kind: ComplaintKind | undefined =
        (options.kind as ComplaintKind | undefined) ?? inferComplaintKind(options.about);
      const { store, log, clock, idGen, index, relations, lock, declarations } = createCliContainer(baseDir);
      const aboutKnown =
        (BASE_AGENT_IDS as readonly string[]).includes(options.about) ||
        options.about.startsWith('skill:') ||
        (await store.get(options.about)) !== null;
      if (!aboutKnown) {
        throw new UserFacingError(
          `Unknown --about target "${options.about}": expected base agent id, skill:<name> or existing mem-id`
        );
      }
      const now = clock.now();
      const shortRule = options.rule.length > 60 ? `${options.rule.slice(0, 60)}…` : options.rule;
      const result = await addMemoryObject(
        { store, log, clock, idGen, index, lock, declarations },
        {
          type: 'complaint',
          title: `Complaint about ${options.about}: ${shortRule}`,
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
