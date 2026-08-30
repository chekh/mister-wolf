import { Command } from 'commander';
import { addMemoryObject } from '../../../app/use-cases/add-memory-object.js';
import { recordRelation } from '../../../app/use-cases/record-relation.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { resolveCreatedBy } from '../../../domain/actor.js';
import { appendComplaintSignal } from '../../../adapters/fs/session-metrics-log.js';

// Тип объекта — observation, не lesson: жалоба фиксирует факт поведения
// агента/методики (наблюдение «что случилось»), а не извлечённую рекомендацию
// («как надо» — это lesson с trigger_keywords, продукт расследования Стюарда).
// Жалоба — вход в цикл наставничества, урок — его выход.
// baseDir инъектится для тестов (прецедент: runValidate в memory-validate.ts);
// при обычной регистрации в cli-entry используется process.cwd().
export function memoryComplainCommand(baseDir: string = process.cwd()): Command {
  return new Command('complain')
    .description('Record a complaint about agent/methodology behavior (hot-signal for the Steward)')
    .requiredOption('--about <about>', 'Complaint target: playbook id, agent id or skill name (e.g. skill:apprentice)')
    .requiredOption('--text <text>', 'Complaint text')
    .option('--created-by <actor>', 'Creator actor (default: env WOLF_ACTOR, else user:cli)')
    .action(async (options) => {
      const { store, log, clock, idGen, index, relations, lock, declarations } = createCliContainer(baseDir);
      const now = clock.now();
      const short = options.text.length > 60 ? `${options.text.slice(0, 60)}…` : options.text;
      const result = await addMemoryObject(
        { store, log, clock, idGen, index, lock, declarations },
        {
          type: 'observation',
          title: `Complaint about ${options.about}: ${short}`,
          body: options.text,
          createdBy: resolveCreatedBy(options.createdBy),
          tags: ['complaint'],
          extra: {
            about: options.about,
            complaint: options.text,
            semantic: 'жалоба на поведение агента/методики',
            trigger: true,
          },
        }
      );
      const id = result.object.id;
      // Адресат — mem-id или внешняя строка (skill:apprentice); обе допустимы как object.
      await recordRelation({ relations, idGen, lock }, now, id, 'complain', options.about, 'manual');
      // Ф20 (б): сигнал жалобы в сигнальный лог (hot-signal Стюарда)
      appendComplaintSignal(baseDir, {
        about: options.about,
        text: options.text,
        actor: resolveCreatedBy(options.createdBy),
        objectId: id,
      });
      console.log(`Complaint recorded: ${id}`);
      console.log(`Relation recorded: ${id} -complain-> ${options.about}`);
    });
}
