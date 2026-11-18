// tests/integration/apply-learning-change.test.ts
// 3.2.0 T-06 (REQ-08, design §8): разрешённое применение и откат одиночного
// кандидата. S-12 — suggest ничего не активирует; apply без acceptance → отказ.
// S-13 — stale baseline → отказ без перезаписи, чужие изменения целы.
// S-15 — повтор apply noop; rollback возвращает точный прежний hash; чужие
// правки после apply → отказ без потери. S-16 — контрактная часть доставки
// (новое поручение получает принятую версию; идущее не меняется).
// Fault injection multi-file apply/rollback — apply-learning-change-recovery.test.ts.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createCliContainer } from '../../src/bootstrap/container.js';
import { saveLearningCandidate } from '../../src/app/use-cases/save-proposal.js';
import { acceptLearningChange, applyLearningChange } from '../../src/app/use-cases/apply-learning-change.js';
import { rollbackLearningChange } from '../../src/app/use-cases/rollback-learning-change.js';
import { resolveActiveLearningVersions } from '../../src/app/use-cases/active-learning-delivery.js';
import { addMemoryObject } from '../../src/app/use-cases/add-memory-object.js';
import { parseLearningChangeEnvelope } from '../../src/domain/schemas/learning-change-schema.js';
import { canonicalActiveHash, sha256Of } from '../../src/domain/schemas/learning-activation-schema.js';
import { eventsPath } from '../../src/adapters/fs/project-paths.js';
import type { MemoryEvent } from '../../src/domain/schemas/memory-event-schema.js';
import type { LearningChangeEnvelope } from '../../src/domain/schemas/learning-change-schema.js';
import { UserFacingError } from '../../src/domain/errors.js';
import { validCandidateInput } from '../unit/domain/learning-fixtures.js';
import type { LearningCandidateInput } from '../../src/domain/schemas/learning-change-schema.js';

const BASELINE_CONTENT: Record<string, string> = {
  'skills/alpha/SKILL.md': 'alpha baseline v1\n',
  'skills/beta/SKILL.md': 'beta baseline v1\n',
};
const APPLIED_CONTENT: Record<string, string> = {
  'skills/alpha/SKILL.md': 'alpha v2: added confirmation gate\n',
  'skills/beta/SKILL.md': 'beta v2: added negative example\n',
};
const BACKUP_REF = '.wolf/learning/operations/demo-previous.json';
const DIFF_REF = 'patches/demo.json';

describe('REQ-08: apply/rollback одиночного кандидата (integration)', () => {
  let dir: string;
  type Container = ReturnType<typeof createCliContainer>;
  let container: Container;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-apply-learning-'));
    container = createCliContainer(dir);
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function deps(mode: 'apply-approved' | 'suggest' = 'apply-approved') {
    return { ...container, baseDir: dir, mode, env: {} };
  }

  /** Точные байты целевых файлов + длина журнала (snapshot отказов). */
  function targetBytes(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const p of Object.keys(BASELINE_CONTENT)) out[p] = readFileSync(join(dir, p), 'utf-8');
    return out;
  }

  async function learningEvents(): Promise<MemoryEvent[]> {
    return (await container.log.readAll()).filter((e) => e.type.startsWith('memory.learning'));
  }

  async function envelopeOf(id: string): Promise<LearningChangeEnvelope> {
    const obj = await container.store.get(id);
    if (!obj) throw new Error(`candidate ${id} disappeared`);
    const env = parseLearningChangeEnvelope(obj);
    if (!env) throw new Error(`candidate ${id} lost the learning-change tag`);
    return env;
  }

  /** Реальный путь T-04: кандидат через saveLearningCandidate (suggest, dedup). */
  async function seedCandidate(): Promise<string> {
    for (const [p, c] of Object.entries(BASELINE_CONTENT)) {
      mkdirSync(join(dir, p, '..'), { recursive: true });
      writeFileSync(join(dir, p), c, 'utf-8');
    }
    const patch = {
      files: Object.entries(APPLIED_CONTENT).map(([path, content]) => ({ path, content })),
    };
    mkdirSync(join(dir, 'patches'), { recursive: true });
    writeFileSync(join(dir, DIFF_REF), JSON.stringify(patch, null, 2), 'utf-8');
    const diffBytes = readFileSync(join(dir, DIFF_REF));
    const targets = Object.keys(BASELINE_CONTENT);
    const input: LearningCandidateInput = {
      ...validCandidateInput(),
      scope: {
        ...validCandidateInput().scope,
        target_paths: targets,
        project_id: 'proj-demo',
      },
      baseline: {
        files: targets.map((p) => ({ path: p, sha256: sha256Of(BASELINE_CONTENT[p]) })),
        model: 'company/code',
        harness: 'opencode',
      },
      candidate: {
        diff_ref: DIFF_REF,
        sha256: sha256Of(diffBytes),
        rationale: 'adds a confirmation gate',
        negative_cases: ['false trigger on git status'],
      },
      rollback: {
        previous_ref: BACKUP_REF,
        expected_active_sha256: canonicalActiveHash(
          targets.map((p) => ({ path: p, sha256: sha256Of(APPLIED_CONTENT[p]) }))
        ),
      },
    };
    const saved = await saveLearningCandidate({ ...container, env: {} }, { envelope: input, addressee: 'user:owner' });
    return saved.object.id;
  }

  async function seedAccepted(): Promise<string> {
    const id = await seedCandidate();
    await acceptLearningChange(container, {
      candidateId: id,
      acceptedBy: 'user:owner',
      verdictRef: 'trial-result-1',
    });
    return id;
  }

  describe('S-12: suggest ничего не активирует; apply без acceptance → отказ', () => {
    it('кандидат создан (phase=proposed, acceptance=null), активные файлы не изменились', async () => {
      const id = await seedCandidate();
      const before = targetBytes();

      const env = await envelopeOf(id);
      expect(env.phase).toBe('proposed');
      expect(env.acceptance).toBeNull();
      expect(env.activation).toBeNull();
      expect(targetBytes()).toEqual(before); // байты целевых файлов не тронуты
      expect(await learningEvents()).toHaveLength(0); // propose не пишет apply-журнал
    });

    it('apply в режиме suggest → отказ (mode gate), ничего не записано', async () => {
      const id = await seedCandidate();
      const before = targetBytes();
      const logLength = (await container.log.readAll()).length;

      await expect(applyLearningChange(deps('suggest'), id)).rejects.toThrow(UserFacingError);
      await expect(applyLearningChange(deps('suggest'), id)).rejects.toThrow(/apply-approved/);
      expect(targetBytes()).toEqual(before);
      expect((await container.log.readAll()).length).toBe(logLength);
    });

    it('apply-approved без acceptance → отказ (phase подменён на approved вручную)', async () => {
      const id = await seedCandidate();
      await expect(applyLearningChange(deps(), id)).rejects.toThrow(/requires "approved"/);

      // рукописный phase=approved без acceptance-записи — acceptance-гейт
      const env = await envelopeOf(id);
      await container.store.update(id, { body: JSON.stringify({ ...env, phase: 'approved' }, null, 2) });
      const before = targetBytes();
      const logLength = (await container.log.readAll()).length;
      await expect(applyLearningChange(deps(), id)).rejects.toThrow(/no confirmed acceptance/);

      expect(targetBytes()).toEqual(before);
      expect((await container.log.readAll()).length).toBe(logLength);
    });

    it('accept: phase → approved, acceptance зафиксирована, файлы по-прежнему не тронуты', async () => {
      const id = await seedCandidate();
      const before = targetBytes();
      const result = await acceptLearningChange(container, {
        candidateId: id,
        acceptedBy: 'user:owner',
        verdictRef: 'trial-result-1',
      });
      expect(result.phase).toBe('approved');

      const env = await envelopeOf(id);
      expect(env.phase).toBe('approved');
      expect(env.acceptance).toMatchObject({
        decision: 'accepted',
        accepted_by: 'user:owner',
        verdict_ref: 'trial-result-1',
        accepted_candidate_sha256: env.candidate.sha256,
      });
      expect(targetBytes()).toEqual(before); // приёмка не применяет
      expect((await learningEvents()).map((e) => e.type)).toEqual(['memory.learning.accepted']);

      // повторная приёмка невозможна: acceptance неизменяема
      await expect(
        acceptLearningChange(container, { candidateId: id, acceptedBy: 'user:owner', verdictRef: 'x' })
      ).rejects.toThrow(/already carries an acceptance/);
    });
  });

  describe('S-13: stale baseline → отказ, чужие изменения сохранены', () => {
    it('целевой файл изменён после создания кандидата → отказ без перезаписи', async () => {
      const id = await seedAccepted();
      const foreign = 'foreign edit by another task\n';
      writeFileSync(join(dir, 'skills/alpha/SKILL.md'), foreign, 'utf-8');
      const logLength = (await container.log.readAll()).length;

      await expect(applyLearningChange(deps(), id)).rejects.toThrow(UserFacingError);
      await expect(applyLearningChange(deps(), id)).rejects.toThrow(/stale baseline/);
      // чужая правка цела, применённого содержимого нет
      expect(readFileSync(join(dir, 'skills/alpha/SKILL.md'), 'utf-8')).toBe(foreign);
      expect(readFileSync(join(dir, 'skills/beta/SKILL.md'), 'utf-8')).toBe(BASELINE_CONTENT['skills/beta/SKILL.md']);
      // preflight до первой записи: из learning-событий есть только accept приёмки
      expect((await learningEvents()).map((e) => e.type)).toEqual(['memory.learning.accepted']);
      expect((await container.log.readAll()).length).toBe(logLength);
    });

    it('diff-файл подменён после приёмки (hash mismatch) → отказ', async () => {
      const id = await seedAccepted();
      const before = targetBytes();
      writeFileSync(
        join(dir, DIFF_REF),
        JSON.stringify({ files: [{ path: 'skills/alpha/SKILL.md', content: 'tampered\n' }] }),
        'utf-8'
      );

      await expect(applyLearningChange(deps(), id)).rejects.toThrow(/does not match candidate\.sha256/);
      expect(targetBytes()).toEqual(before);
    });
  });

  describe('multi-file apply: точная применённая версия и журнал', () => {
    it('оба файла получают точное новое содержимое, конверт active, backup записан', async () => {
      const id = await seedAccepted();
      const result = await applyLearningChange(deps(), id);

      expect(result).toEqual({
        change_id: expect.any(String),
        applied: ['skills/alpha/SKILL.md', 'skills/beta/SKILL.md'],
        recovered: [],
        activated: true,
        noop: false,
      });
      expect(targetBytes()).toEqual(APPLIED_CONTENT);

      const env = await envelopeOf(id);
      expect(env.phase).toBe('active');
      expect(env.activation).toMatchObject({
        applied_by: 'system:wolf',
        backup_ref: BACKUP_REF,
        expected_active_sha256: env.rollback.expected_active_sha256,
        files: Object.entries(APPLIED_CONTENT).map(([path, content]) => ({
          path,
          sha256_after: sha256Of(content),
        })),
      });

      // backup держит точное baseline-содержимое (основа отката)
      const backup = JSON.parse(readFileSync(join(dir, BACKUP_REF), 'utf-8')) as {
        files: Array<{ path: string; sha256: string }>;
      };
      expect(backup.files.map((f) => [f.path, f.sha256])).toEqual(
        Object.entries(BASELINE_CONTENT).map(([p, c]) => [p, sha256Of(c)])
      );

      // пошаговый журнал: op_started → backup → write_file×2 → verify → activate → applied
      const steps = (await learningEvents())
        .filter((e) => e.type !== 'memory.learning.accepted')
        .map((e) =>
          e.type === 'memory.learning.op_step' ? `step:${e.payload['step']}` : e.type.replace('memory.learning.', '')
        );
      expect(steps).toEqual([
        'op_started',
        'step:backup',
        'step:write_file',
        'step:write_file',
        'step:verify',
        'step:activate',
        'applied',
      ]);
    });
  });

  describe('S-15: повтор apply — noop; rollback — точный прежний hash; чужие правки → отказ', () => {
    it('повтор apply не повторяет эффект (noop, журнал не растёт)', async () => {
      const id = await seedAccepted();
      await applyLearningChange(deps(), id);
      const after = targetBytes();
      const logLength = (await container.log.readAll()).length;

      const repeat = await applyLearningChange(deps(), id);
      expect(repeat).toMatchObject({ noop: true, applied: [], activated: false });
      expect(targetBytes()).toEqual(after);
      expect((await container.log.readAll()).length).toBe(logLength);
      expect((await learningEvents()).filter((e) => e.type === 'memory.learning.applied')).toHaveLength(1);
    });

    it('rollback возвращает точный прежний hash; повторный rollback — noop', async () => {
      const id = await seedAccepted();
      await applyLearningChange(deps(), id);

      const rolled = await rollbackLearningChange({ ...container, baseDir: dir }, id);
      expect(rolled).toMatchObject({
        restored: ['skills/alpha/SKILL.md', 'skills/beta/SKILL.md'],
        already_restored: [],
        deactivated: true,
        noop: false,
      });
      expect(targetBytes()).toEqual(BASELINE_CONTENT); // точные прежние байты
      expect((await envelopeOf(id)).phase).toBe('rolled_back');
      expect((await learningEvents()).filter((e) => e.type === 'memory.learning.rolled_back')).toHaveLength(1);

      const again = await rollbackLearningChange({ ...container, baseDir: dir }, id);
      expect(again).toMatchObject({ noop: true, restored: [], deactivated: false });
      expect(targetBytes()).toEqual(BASELINE_CONTENT);
    });

    it('чужие правки после apply → rollback отказывается без потери', async () => {
      const id = await seedAccepted();
      await applyLearningChange(deps(), id);
      const foreign = 'foreign edit after apply\n';
      writeFileSync(join(dir, 'skills/alpha/SKILL.md'), foreign, 'utf-8');
      const logLength = (await container.log.readAll()).length;

      const err = await rollbackLearningChange({ ...container, baseDir: dir }, id).catch((e: unknown) => e as Error);
      expect(err).toBeInstanceOf(UserFacingError);
      expect(err.message).toMatch(/changed after apply/);
      expect(err.message).toMatch(/without overwrite/);
      // чужая правка сохранена; остальные файлы не тронуты (отказ до первой записи)
      expect(readFileSync(join(dir, 'skills/alpha/SKILL.md'), 'utf-8')).toBe(foreign);
      expect(readFileSync(join(dir, 'skills/beta/SKILL.md'), 'utf-8')).toBe(APPLIED_CONTENT['skills/beta/SKILL.md']);
      expect((await container.log.readAll()).length).toBe(logLength);
      expect(
        (await learningEvents()).some((e) => e.type === 'memory.learning.op_started' && e.payload['op'] === 'rollback')
      ).toBe(false);
    });

    it('несовпадающий expected_active_sha256 в конверте → отказ до записей', async () => {
      const id = await seedAccepted();
      const obj = await container.store.get(id);
      const env = parseLearningChangeEnvelope(obj!);
      const tampered = {
        ...env,
        rollback: { ...env.rollback, expected_active_sha256: 'f'.repeat(64) },
      };
      await container.store.update(id, { body: JSON.stringify(tampered, null, 2) });

      await expect(applyLearningChange(deps(), id)).rejects.toThrow(/does not match what this diff produces/);
      expect(targetBytes()).toEqual(BASELINE_CONTENT);
    });
  });

  describe('S-16 (контрактная часть): доставка — только новым поручениям', () => {
    it('идущее поручение не меняется; новое получает delivered_ref принятой версии', async () => {
      // «поручение в полёте» — запись со старой привязкой версии (не proposal:
      // фасет предложения требует своих полей и участвует в дедупе кандидатов)
      const { object: inFlight } = await addMemoryObject(container, {
        type: 'note',
        facet: 'context',
        title: 'TASK: fix shell guard (in flight)',
        body: 'assignment bound to learning:lc-old@000000000000',
        createdBy: 'user:test',
      });
      const inFlightBefore = (await container.store.get(inFlight.id))!.body;

      const id = await seedAccepted();
      await applyLearningChange(deps(), id);

      // уже выполняющееся поручение не перечитано и не переписано
      expect((await container.store.get(inFlight.id))!.body).toBe(inFlightBefore);

      // новое поручение резолвит принятую версию
      const versions = await resolveActiveLearningVersions({ store: container.store }, 'proj-demo');
      const env = await envelopeOf(id);
      expect(versions).toHaveLength(1);
      expect(versions[0]).toEqual({
        change_id: env.change_id,
        candidate_sha256: env.candidate.sha256,
        active_sha256: env.rollback.expected_active_sha256,
        activated_at: expect.any(String),
        delivered_ref: `learning:${env.change_id}@${env.rollback.expected_active_sha256.slice(0, 12)}`,
      });
      // другой проект — пустой результат без записей
      expect(await resolveActiveLearningVersions({ store: container.store }, 'proj-other')).toEqual([]);
    });
  });

  describe('patch 3.2.1: REQ-321-1 (содержимое backup до записи) и REQ-321-3 (scope↔baseline↔patch)', () => {
    /** Кандидат с заданным scope.target_paths (baseline/patch трогают skills/alpha|beta). */
    async function seedWithScope(targetPaths: string[]): Promise<string> {
      for (const [p, c] of Object.entries(BASELINE_CONTENT)) {
        mkdirSync(join(dir, p, '..'), { recursive: true });
        writeFileSync(join(dir, p), c, 'utf-8');
      }
      const patch = { files: Object.entries(APPLIED_CONTENT).map(([path, content]) => ({ path, content })) };
      mkdirSync(join(dir, 'patches'), { recursive: true });
      writeFileSync(join(dir, DIFF_REF), JSON.stringify(patch, null, 2), 'utf-8');
      const input: LearningCandidateInput = {
        ...validCandidateInput(),
        scope: { ...validCandidateInput().scope, target_paths: targetPaths, project_id: 'proj-demo' },
        baseline: {
          files: Object.entries(BASELINE_CONTENT).map(([p, c]) => ({ path: p, sha256: sha256Of(c) })),
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
          expected_active_sha256: canonicalActiveHash(
            Object.entries(APPLIED_CONTENT).map(([p, c]) => ({ path: p, sha256: sha256Of(c) }))
          ),
        },
      };
      const saved = await saveLearningCandidate(
        { ...container, env: {} },
        { envelope: input, addressee: 'user:owner' }
      );
      return saved.object.id;
    }

    /** Порча содержимого одной записи backup при интактном поле sha256 (repro владельца R-1). */
    function corruptBackupContent(path: string, content: string): void {
      const backup = JSON.parse(readFileSync(join(dir, BACKUP_REF), 'utf-8')) as {
        files: Array<{ path: string; content: string; sha256: string }>;
      };
      const entry = backup.files.find((f) => f.path === path);
      if (!entry) throw new Error(`backup has no entry for ${path}`);
      entry.content = content;
      writeFileSync(join(dir, BACKUP_REF), JSON.stringify(backup, null, 2) + '\n', 'utf-8');
    }

    it('AC-1.1: испорченный content backup при интактном sha256 → откат отказывает, целевой файл не изменён', async () => {
      const id = await seedAccepted();
      await applyLearningChange(deps(), id);
      corruptBackupContent('skills/alpha/SKILL.md', 'CORRUPTED CONTENT\n');
      const logLength = (await container.log.readAll()).length;

      const err = await rollbackLearningChange({ ...container, baseDir: dir }, id).catch((e: unknown) => e as Error);
      expect(err).toBeInstanceOf(UserFacingError);
      expect(err.message).toMatch(/nothing was written/);
      expect(err.message).toMatch(/skills\/alpha\/SKILL\.md/);
      expect(err.message).toMatch(/does not match its stored sha256/);
      // порча не дошла до целевого файла: применённая версия цела
      expect(targetBytes()).toEqual(APPLIED_CONTENT);
      expect((await container.log.readAll()).length).toBe(logLength);
    });

    it('AC-1.2: испорчена вторая запись → отказ до первой записи, ни один файл не восстановлен', async () => {
      const id = await seedAccepted();
      await applyLearningChange(deps(), id);
      corruptBackupContent('skills/beta/SKILL.md', 'CORRUPTED SECOND\n');

      await expect(rollbackLearningChange({ ...container, baseDir: dir }, id)).rejects.toThrow(
        /skills\/beta\/SKILL\.md/
      );
      // все-или-ничего: alpha (первая запись плана) тоже не восстановлен
      expect(targetBytes()).toEqual(APPLIED_CONTENT);
      expect(
        (await learningEvents()).some((e) => e.type === 'memory.learning.op_started' && e.payload['op'] === 'rollback')
      ).toBe(false);
    });

    it('AC-1.3: повтор apply переиспользует backup — та же проверка содержимого до записи', async () => {
      const id = await seedAccepted();
      let writes = 0;
      await expect(
        applyLearningChange(
          {
            ...deps(),
            fault: (point) => {
              if (point === 'write_file' && ++writes === 1) throw new Error('injected fault at write_file');
            },
          },
          id
        )
      ).rejects.toThrow(/injected fault/);
      // alpha уже несёт применённое содержимое (recovered), backup на диске
      expect(readFileSync(join(dir, 'skills/alpha/SKILL.md'), 'utf-8')).toBe(APPLIED_CONTENT['skills/alpha/SKILL.md']);
      corruptBackupContent('skills/beta/SKILL.md', 'CORRUPTED REUSE\n');

      await expect(applyLearningChange(deps(), id)).rejects.toThrow(/content hash/);
      await expect(applyLearningChange(deps(), id)).rejects.toThrow(/nothing was written/);
      // ничего не дозаписано: beta осталась baseline, alpha без перезаписи
      expect(readFileSync(join(dir, 'skills/beta/SKILL.md'), 'utf-8')).toBe(BASELINE_CONTENT['skills/beta/SKILL.md']);
      expect(readFileSync(join(dir, 'skills/alpha/SKILL.md'), 'utf-8')).toBe(APPLIED_CONTENT['skills/alpha/SKILL.md']);
    });

    it('AC-1.4: валидный нетронутый backup → откат работает как прежде (без регрессии)', async () => {
      const id = await seedAccepted();
      await applyLearningChange(deps(), id);

      const rolled = await rollbackLearningChange({ ...container, baseDir: dir }, id);
      expect(rolled).toMatchObject({
        restored: ['skills/alpha/SKILL.md', 'skills/beta/SKILL.md'],
        already_restored: [],
        deactivated: true,
        noop: false,
      });
      expect(targetBytes()).toEqual(BASELINE_CONTENT);
      expect((await envelopeOf(id)).phase).toBe('rolled_back');
    });

    it('AC-3.1 accept: baseline вне scope.target_paths → приёмка отказывает, phase остаётся proposed', async () => {
      const id = await seedWithScope(['other/approved.md']);
      const before = targetBytes();
      const logLength = (await container.log.readAll()).length;

      await expect(
        acceptLearningChange(container, { candidateId: id, acceptedBy: 'user:owner', verdictRef: 'trial-result-1' })
      ).rejects.toThrow(/outside scope\.target_paths/);
      const env = await envelopeOf(id);
      expect(env.phase).toBe('proposed');
      expect(env.acceptance).toBeNull();
      expect(targetBytes()).toEqual(before);
      expect((await container.log.readAll()).length).toBe(logLength);
    });

    it('AC-3.1 apply: baseline вне scope.target_paths → preflight отказывает, ничего не записано', async () => {
      const id = await seedWithScope(['other/approved.md']);
      // легальная приёмка уже отказала (AC-3.1 accept); до apply добирается только
      // рукописный approved-конверт — preflight обязан отказать и ему
      const env = await envelopeOf(id);
      await container.store.update(id, {
        body: JSON.stringify(
          {
            ...env,
            phase: 'approved',
            acceptance: {
              decision: 'accepted',
              accepted_by: 'user:owner',
              accepted_at: '2026-11-18T00:00:00.000Z',
              accepted_candidate_sha256: env.candidate.sha256,
              verdict_ref: 'trial-result-1',
            },
          },
          null,
          2
        ),
      });
      const before = targetBytes();
      const logLength = (await container.log.readAll()).length;

      await expect(applyLearningChange(deps(), id)).rejects.toThrow(/outside scope\.target_paths/);
      expect(targetBytes()).toEqual(before);
      expect((await container.log.readAll()).length).toBe(logLength);
    });

    it('R-WA-1 (ревью 3.2.1): patch-путь вне scope при baseline внутри — accept проходит, apply отказывает до записи', async () => {
      // Изолированный случай patch-стороны REQ-321-3: baseline (alpha, beta) внутри
      // scope — accept-гейт (конверт, без чтения diff) проходит; patch несёт gamma
      // вне scope — apply-preflight обязан отказать до первой записи.
      const id = await seedWithScope(['skills/alpha/SKILL.md', 'skills/beta/SKILL.md']);
      const env = await envelopeOf(id);
      // Расширяем patch путём вне scope и пересобираем пин candidate.sha256.
      const diffPath = join(dir, env.candidate.diff_ref);
      const patch = JSON.parse(readFileSync(diffPath, 'utf-8')) as { files: Array<{ path: string; content: string }> };
      patch.files.push({ path: 'skills/gamma/SKILL.md', content: 'GAMMA CONTENT' });
      writeFileSync(diffPath, JSON.stringify(patch, null, 2), 'utf-8');
      const newDiffSha = sha256Of(readFileSync(diffPath));
      await container.store.update(id, {
        body: JSON.stringify({ ...env, candidate: { ...env.candidate, sha256: newDiffSha } }, null, 2),
      });
      // Accept-гейт на этом конверте проходит: baseline целиком внутри scope;
      // acceptance пинует новый diff-хэш (accepted_candidate_sha256 = newDiffSha).
      const acc = await acceptLearningChange(container, {
        candidateId: id,
        acceptedBy: 'user:owner',
        verdictRef: 'trial-result-1',
      });
      expect(acc.phase).toBe('approved');

      const before = targetBytes();
      const logLength = (await container.log.readAll()).length;
      await expect(applyLearningChange(deps(), id)).rejects.toThrow(/outside scope\.target_paths/);
      expect(targetBytes()).toEqual(before);
      expect((await container.log.readAll()).length).toBe(logLength);
    });

    it('AC-3.2: один путь в разной записи (./) — ложного отказа нет, приёмка и apply работают', async () => {
      const id = await seedWithScope(['./skills/alpha/SKILL.md', './skills/beta/SKILL.md']);

      const acc = await acceptLearningChange(container, {
        candidateId: id,
        acceptedBy: 'user:owner',
        verdictRef: 'trial-result-1',
      });
      expect(acc.phase).toBe('approved');
      const result = await applyLearningChange(deps(), id);
      expect(result.applied).toEqual(['skills/alpha/SKILL.md', 'skills/beta/SKILL.md']);
      expect(targetBytes()).toEqual(APPLIED_CONTENT);
    });
  });
});
