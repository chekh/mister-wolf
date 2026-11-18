// tests/integration/apply-learning-change-recovery.test.ts
// 3.2.0 T-06 (REQ-08/REQ-10, NFR-03, test-plan S-14): multi-file apply и rollback
// с fault injection ПОСЛЕ каждого шага (паттерн FaceFaultPoint /
// AggregateFaultPoint, tests/integration/apply-aggregate-safety.test.ts):
// сбой оставляет подтверждённый журналом частичный след, повтор дозавершает,
// ложного active нет, повтор полного apply/rollback — без второго эффекта.
// Каждая точка сбоя — собственный изолированный tmp-проект.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createCliContainer } from '../../src/bootstrap/container.js';
import { saveLearningCandidate } from '../../src/app/use-cases/save-proposal.js';
import { acceptLearningChange, applyLearningChange } from '../../src/app/use-cases/apply-learning-change.js';
import { rollbackLearningChange } from '../../src/app/use-cases/rollback-learning-change.js';
import { parseLearningChangeEnvelope } from '../../src/domain/schemas/learning-change-schema.js';
import { canonicalActiveHash, sha256Of } from '../../src/domain/schemas/learning-activation-schema.js';
import type { MemoryEvent } from '../../src/domain/schemas/memory-event-schema.js';
import type { LearningCandidateInput } from '../../src/domain/schemas/learning-change-schema.js';
import { validCandidateInput } from '../unit/domain/learning-fixtures.js';

const BASELINE: Record<string, string> = {
  'skills/one/SKILL.md': 'one v1\n',
  'skills/two/SKILL.md': 'two v1\n',
  'skills/three/SKILL.md': 'three v1\n',
};
const APPLIED: Record<string, string> = {
  'skills/one/SKILL.md': 'one v2\n',
  'skills/two/SKILL.md': 'two v2\n',
  'skills/three/SKILL.md': 'three v2\n',
};
const TARGETS = Object.keys(BASELINE);
const BACKUP_REF = '.wolf/learning/operations/recovery-previous.json';
const DIFF_REF = 'patches/recovery.json';

/** Изолированный tmp-проект на каждую точку сбоя: журналы не смешиваются. */
function makeScope(): { dir: string; c: ReturnType<typeof createCliContainer> } {
  const dir = mkdtempSync(join(tmpdir(), 'wolf-learning-recovery-'));
  return { dir, c: createCliContainer(dir) };
}

/** fault(point) бросает на k-м (1-based) вызове данного point'а. */
function failOnNth(point: string, nth: number): (p: string) => void {
  let n = 0;
  return (p: string) => {
    if (p === point && ++n === nth) throw new Error(`injected fault at ${p} #${n}`);
  };
}

async function learningEvents(c: ReturnType<typeof createCliContainer>): Promise<MemoryEvent[]> {
  return (await c.log.readAll()).filter((e) => e.type.startsWith('memory.learning'));
}

async function candidatePhase(c: ReturnType<typeof createCliContainer>, id: string): Promise<string> {
  const obj = await c.store.get(id);
  if (!obj) throw new Error(`candidate ${id} disappeared`);
  return parseLearningChangeEnvelope(obj)!.phase;
}

function bytes(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of TARGETS) out[p] = readFileSync(join(dir, p), 'utf-8');
  return out;
}

async function seedAccepted(scope: { dir: string; c: ReturnType<typeof createCliContainer> }): Promise<string> {
  const { dir, c } = scope;
  for (const [p, content] of Object.entries(BASELINE)) {
    mkdirSync(join(dir, p, '..'), { recursive: true });
    writeFileSync(join(dir, p), content, 'utf-8');
  }
  const patch = { files: Object.entries(APPLIED).map(([path, content]) => ({ path, content })) };
  mkdirSync(join(dir, 'patches'), { recursive: true });
  writeFileSync(join(dir, DIFF_REF), JSON.stringify(patch, null, 2), 'utf-8');
  const input: LearningCandidateInput = {
    ...validCandidateInput(),
    scope: { ...validCandidateInput().scope, target_paths: TARGETS, project_id: 'proj-demo' },
    baseline: {
      files: TARGETS.map((p) => ({ path: p, sha256: sha256Of(BASELINE[p]) })),
      model: 'company/code',
      harness: 'opencode',
    },
    candidate: {
      diff_ref: DIFF_REF,
      sha256: sha256Of(readFileSync(join(dir, DIFF_REF))),
      rationale: 'r',
      negative_cases: ['false trigger'],
    },
    rollback: {
      previous_ref: BACKUP_REF,
      expected_active_sha256: canonicalActiveHash(TARGETS.map((p) => ({ path: p, sha256: sha256Of(APPLIED[p]) }))),
    },
  };
  const saved = await saveLearningCandidate({ ...c, env: {} }, { envelope: input });
  await acceptLearningChange(c, {
    candidateId: saved.object.id,
    acceptedBy: 'user:owner',
    verdictRef: 'trial-result-1',
  });
  return saved.object.id;
}

describe('S-14/NFR-03: recovery multi-file apply/rollback (fault injection)', () => {
  describe('apply: сбой после каждого шага → повтор дозавершает по журналу', () => {
    it('сбой после каждого write_file: частичный след в журнале, повтор дозавершает, ложного active нет', async () => {
      for (let k = 1; k <= TARGETS.length; k++) {
        const scope = makeScope();
        try {
          const id = await seedAccepted(scope);
          const { dir, c } = scope;
          await expect(
            applyLearningChange({ ...c, baseDir: dir, mode: 'apply-approved', fault: failOnNth('write_file', k) }, id)
          ).rejects.toThrow(/injected fault at write_file/);

          // ложного active нет: фаза всё ещё approved; записано ровно k файлов
          expect(await candidatePhase(c, id)).toBe('approved');
          const partial = bytes(dir);
          TARGETS.forEach((p, i) => expect(partial[p]).toBe(i < k ? APPLIED[p] : BASELINE[p]));
          expect((await learningEvents(c)).filter((e) => e.type === 'memory.learning.applied')).toHaveLength(0);
          // частичный шаг подтверждён журналом: k записей write_file
          const writtenSteps = (await learningEvents(c)).filter(
            (e) => e.type === 'memory.learning.op_step' && e.payload['step'] === 'write_file'
          );
          expect(writtenSteps).toHaveLength(k);

          // повтор без сбоя: дозавершение, записанные файлы не перезаписываются
          const done = await applyLearningChange({ ...c, baseDir: dir, mode: 'apply-approved' }, id);
          expect(done).toMatchObject({
            applied: TARGETS.slice(k),
            recovered: TARGETS.slice(0, k),
            activated: true,
            noop: false,
          });
          expect(bytes(dir)).toEqual(APPLIED);
          expect(await candidatePhase(c, id)).toBe('active');
          // каждый файл записан фактически ровно один раз (recovered-шаги не пишут)
          const realWrites = (await learningEvents(c)).filter(
            (e) => e.type === 'memory.learning.op_step' && e.payload['step'] === 'write_file' && !e.payload['recovered']
          );
          expect(realWrites).toHaveLength(TARGETS.length);
          expect((await learningEvents(c)).filter((e) => e.type === 'memory.learning.applied')).toHaveLength(1);

          // третий вызов — чистый noop
          const noop = await applyLearningChange({ ...c, baseDir: dir, mode: 'apply-approved' }, id);
          expect(noop).toMatchObject({ noop: true, applied: [], recovered: [] });
        } finally {
          rmSync(scope.dir, { recursive: true, force: true });
        }
      }
    });

    it('сбой на op_started/backup: ничего целевого не записано, повтор завершает', async () => {
      for (const point of ['op_started', 'backup']) {
        const scope = makeScope();
        try {
          const id = await seedAccepted(scope);
          const { dir, c } = scope;
          await expect(
            applyLearningChange({ ...c, baseDir: dir, mode: 'apply-approved', fault: failOnNth(point, 1) }, id)
          ).rejects.toThrow(new RegExp(`injected fault at ${point}`));
          expect(await candidatePhase(c, id)).toBe('approved');
          expect(bytes(dir)).toEqual(BASELINE);

          const done = await applyLearningChange({ ...c, baseDir: dir, mode: 'apply-approved' }, id);
          expect(done).toMatchObject({ applied: TARGETS, recovered: [], activated: true });
          expect(bytes(dir)).toEqual(APPLIED);
          expect((await learningEvents(c)).filter((e) => e.type === 'memory.learning.applied')).toHaveLength(1);
        } finally {
          rmSync(scope.dir, { recursive: true, force: true });
        }
      }
    });

    it('сбой на verify/activate: verify — фазы active ещё нет; activate — фаза active, финала нет; повтор закрывает без перезаписи', async () => {
      for (const point of ['verify', 'activate']) {
        const scope = makeScope();
        try {
          const id = await seedAccepted(scope);
          const { dir, c } = scope;
          await expect(
            applyLearningChange({ ...c, baseDir: dir, mode: 'apply-approved', fault: failOnNth(point, 1) }, id)
          ).rejects.toThrow(new RegExp(`injected fault at ${point}`));
          // verify-шаг завершён до activate: фазы active ещё нет; fault на
          // activate срабатывает ПОСЛЕ шага (паттерн AggregateFaultPoint) —
          // конверт уже active, но финального события нет (ложного следа нет)
          expect(await candidatePhase(c, id)).toBe(point === 'verify' ? 'approved' : 'active');
          expect(bytes(dir)).toEqual(APPLIED);
          expect((await learningEvents(c)).filter((e) => e.type === 'memory.learning.applied')).toHaveLength(0);

          const done = await applyLearningChange({ ...c, baseDir: dir, mode: 'apply-approved' }, id);
          if (point === 'verify') {
            // обычное дозавершение: записанные файлы не перезаписываются
            expect(done).toMatchObject({ applied: [], recovered: TARGETS, activated: true, noop: false });
          } else {
            // активация уже завершена (fault после шага): повтор только закрывает след
            expect(done).toMatchObject({ applied: [], recovered: [], activated: false, noop: false });
          }
          expect(bytes(dir)).toEqual(APPLIED); // перезаписи не было
          expect(await candidatePhase(c, id)).toBe('active');
          expect((await learningEvents(c)).filter((e) => e.type === 'memory.learning.applied')).toHaveLength(1);
        } finally {
          rmSync(scope.dir, { recursive: true, force: true });
        }
      }
    });

    it('сбой на финальном applied: финал уже записан (seam после шага), повтор — чистый noop', async () => {
      const scope = makeScope();
      try {
        const id = await seedAccepted(scope);
        const { dir, c } = scope;
        await expect(
          applyLearningChange({ ...c, baseDir: dir, mode: 'apply-approved', fault: failOnNth('applied', 1) }, id)
        ).rejects.toThrow(/injected fault at applied/);
        expect(await candidatePhase(c, id)).toBe('active');
        expect((await learningEvents(c)).filter((e) => e.type === 'memory.learning.applied')).toHaveLength(1); // финал записан до seam

        const noop = await applyLearningChange({ ...c, baseDir: dir, mode: 'apply-approved' }, id);
        expect(noop).toMatchObject({ noop: true, applied: [], activated: false });
        expect((await learningEvents(c)).filter((e) => e.type === 'memory.learning.applied')).toHaveLength(1); // второй эффект не записан
      } finally {
        rmSync(scope.dir, { recursive: true, force: true });
      }
    });
  });

  describe('rollback: сбой после каждого шага → повтор дозавершает (NFR-03)', () => {
    it('сбой после каждого restore_file: восстановленное точно baseline, повтор дозавершает', async () => {
      for (let k = 1; k <= TARGETS.length; k++) {
        const scope = makeScope();
        try {
          const id = await seedAccepted(scope);
          const { dir, c } = scope;
          await applyLearningChange({ ...c, baseDir: dir, mode: 'apply-approved' }, id);
          await expect(
            rollbackLearningChange({ ...c, baseDir: dir, fault: failOnNth('restore_file', k) }, id)
          ).rejects.toThrow(/injected fault at restore_file/);

          // частичный откат: k файлов точно baseline, остальные ещё применённые; фаза active
          const partial = bytes(dir);
          TARGETS.forEach((p, i) => expect(partial[p]).toBe(i < k ? BASELINE[p] : APPLIED[p]));
          expect(await candidatePhase(c, id)).toBe('active');
          expect((await learningEvents(c)).filter((e) => e.type === 'memory.learning.rolled_back')).toHaveLength(0);

          const done = await rollbackLearningChange({ ...c, baseDir: dir }, id);
          expect(done).toMatchObject({
            restored: TARGETS.slice(k),
            already_restored: TARGETS.slice(0, k),
            deactivated: true,
            noop: false,
          });
          expect(bytes(dir)).toEqual(BASELINE); // точные прежние байты
          expect(await candidatePhase(c, id)).toBe('rolled_back');
          const restores = (await learningEvents(c)).filter(
            (e) =>
              e.type === 'memory.learning.op_step' && e.payload['step'] === 'restore_file' && !e.payload['recovered']
          );
          expect(restores).toHaveLength(TARGETS.length); // каждая запись — один факт отката
          expect((await learningEvents(c)).filter((e) => e.type === 'memory.learning.rolled_back')).toHaveLength(1);

          const noop = await rollbackLearningChange({ ...c, baseDir: dir }, id);
          expect(noop).toMatchObject({ noop: true, restored: [] });
        } finally {
          rmSync(scope.dir, { recursive: true, force: true });
        }
      }
    });

    it('сбой на verify/deactivate: содержимое уже baseline, повтор закрывает след без перезаписи', async () => {
      for (const point of ['verify', 'deactivate']) {
        const scope = makeScope();
        try {
          const id = await seedAccepted(scope);
          const { dir, c } = scope;
          await applyLearningChange({ ...c, baseDir: dir, mode: 'apply-approved' }, id);
          await expect(rollbackLearningChange({ ...c, baseDir: dir, fault: failOnNth(point, 1) }, id)).rejects.toThrow(
            new RegExp(`injected fault at ${point}`)
          );

          expect(bytes(dir)).toEqual(BASELINE);
          // verify-шаг до deactivate: фаза ещё active; fault на deactivate
          // срабатывает ПОСЛЕ шага — конверт уже rolled_back, финала ещё нет
          expect(await candidatePhase(c, id)).toBe(point === 'verify' ? 'active' : 'rolled_back');
          expect((await learningEvents(c)).filter((e) => e.type === 'memory.learning.rolled_back')).toHaveLength(0);

          const done = await rollbackLearningChange({ ...c, baseDir: dir }, id);
          if (point === 'verify') {
            // обычное дозавершение: восстановленные файлы не перезаписываются
            expect(done).toMatchObject({ restored: [], already_restored: TARGETS, deactivated: true, noop: false });
          } else {
            // deactivate уже завершён (fault после шага): повтор дозаписывает финал
            expect(done).toMatchObject({ restored: [], already_restored: [], deactivated: false, noop: false });
          }
          expect(bytes(dir)).toEqual(BASELINE);
          expect(await candidatePhase(c, id)).toBe('rolled_back');
          expect((await learningEvents(c)).filter((e) => e.type === 'memory.learning.rolled_back')).toHaveLength(1);
          // следующий повтор — чистый noop
          const noop = await rollbackLearningChange({ ...c, baseDir: dir }, id);
          expect(noop).toMatchObject({ noop: true, restored: [] });
          expect((await learningEvents(c)).filter((e) => e.type === 'memory.learning.rolled_back')).toHaveLength(1);
        } finally {
          rmSync(scope.dir, { recursive: true, force: true });
        }
      }
    });
  });
});
