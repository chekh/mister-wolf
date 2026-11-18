import { Command } from 'commander';
import { scanProjectCached } from '../../../app/use-cases/scan-project.js';
import { projectTreeSignature } from '../../fs/heuristic-project-scanner.js';
import { openScanSnapshotCache } from '../../fs/scan-snapshot-cache.js';
import { generateAgentBrief } from '../../../app/use-cases/generate-agent-brief.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { JsonlMicroNoteDeliveryLog } from '../../../adapters/fs/jsonl-micro-note-delivery-log.js';
import { appendMemoryStageSignal } from '../../fs/session-metrics-log.js';
import { resolveCreatedBy, resolveSessionId } from '../../../domain/actor.js';
import { getWolfVersion } from '../../version.js';
import { withCliCall } from './with-cli-call.js';

export function memoryBriefCommand(): Command {
  return new Command('brief').description('Generate the agent brief from the latest scan and memory').action(
    withCliCall('brief', async () => {
      const { store, log, clock, idGen, scanner, fs, index, memoryRoot } = createCliContainer(process.cwd());
      // T013 → P105: инкрементальный скан; кэш персистный (.wolf/cache/scan-snapshot.json),
      // hit по сигнатуре дерева → ноль обходов и ноль записей в памяти
      const scanResult = await scanProjectCached(
        {
          store,
          log,
          clock,
          idGen,
          scanner,
          index,
          treeSignature: projectTreeSignature,
          snapshotCache: openScanSnapshotCache(process.cwd()),
        },
        process.cwd()
      );
      // 3.2.0 T-10/F-2 (REQ-09): the brief is the lead's route for project
      // knowledge — deliver addressed micro-notes under the same real context
      // as `wolf call`: project = the wolf memory root, version = the wolf
      // version (brief has no topic, so no target). 3.3.1 (REQ-331-2): the log
      // is the persistent JSONL journal (outside .wolf/cache); S-27 suppressions
      // are read from it, so a contradicted note stays out of the brief until
      // resolved.
      const brief = await generateAgentBrief(
        { store, fs, clock, noteLog: new JsonlMicroNoteDeliveryLog(process.cwd()) },
        process.cwd(),
        scanResult.snapshot,
        {
          microNotes: { context: { projectId: memoryRoot, version: getWolfVersion() } },
        }
      );
      // P2 D1: бриф инъекцировал объекты → injected; пусто → событие НЕ пишется
      if (brief.injectedIds.length > 0) {
        try {
          appendMemoryStageSignal(process.cwd(), {
            stage: 'injected',
            memoryIds: brief.injectedIds,
            actor: resolveCreatedBy(undefined),
            sessionId: resolveSessionId(),
          });
        } catch {
          // телеметрия не должна ломать основной поток
        }
      }
      console.log(brief.content);
      console.error(`Brief saved to ${brief.path}`);
    })
  );
}
