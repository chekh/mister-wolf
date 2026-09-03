import { describe, it, expect } from 'vitest';
import { READ_ONLY_ZONES, assertLearnWriteAllowed } from '../../../src/domain/policies/read-only-zones.js';
import { UserFacingError } from '../../../src/domain/errors.js';

const MUTATIONS: ('write' | 'rewrite' | 'unlink')[] = ['write', 'rewrite', 'unlink'];

describe('read-only зоны контура (Ф23, спека §5)', () => {
  it('каждая зона блокирует write/rewrite/unlink', () => {
    expect(READ_ONLY_ZONES.length).toBeGreaterThanOrEqual(8);
    for (const zone of READ_ONLY_ZONES) {
      for (const op of MUTATIONS) {
        expect(() => assertLearnWriteAllowed(zone.path, op)).toThrow(UserFacingError);
        expect(() => assertLearnWriteAllowed(zone.path, op)).toThrow('loop read-only zone');
      }
    }
  });

  it('append-signal разрешён только сигнальным логам', () => {
    expect(() => assertLearnWriteAllowed('.wolf/metrics/session-metrics.jsonl', 'append-signal')).not.toThrow();
    expect(() => assertLearnWriteAllowed('.wolf/metrics/patterns.jsonl', 'append-signal')).not.toThrow();
    // events/relations append идёт через штатные writer'ы вне guard'а — здесь запрещён
    expect(() => assertLearnWriteAllowed('.wolf/events.jsonl', 'append-signal')).toThrow(UserFacingError);
    expect(() => assertLearnWriteAllowed('.wolf/relations.jsonl', 'append-signal')).toThrow(UserFacingError);
    expect(() => assertLearnWriteAllowed('.wolf/memory/events.jsonl', 'append-signal')).toThrow(UserFacingError);
    // не-логи: append-signal не бывает
    expect(() => assertLearnWriteAllowed('AGENTS.md', 'append-signal')).toThrow(UserFacingError);
    expect(() => assertLearnWriteAllowed('.opencode/plugins/x.js', 'append-signal')).toThrow(UserFacingError);
  });

  it('каталог-префикс блокирует содержимое (src/domain/gates, policies, .opencode)', () => {
    expect(() => assertLearnWriteAllowed('src/domain/gates/foo.ts', 'write')).toThrow(UserFacingError);
    expect(() => assertLearnWriteAllowed('src/domain/gates/stop-gate.ts', 'rewrite')).toThrow(UserFacingError);
    expect(() => assertLearnWriteAllowed('src/domain/policies/read-only-zones.ts', 'unlink')).toThrow(UserFacingError);
    expect(() => assertLearnWriteAllowed('src/domain/policies/sub/deep/x.ts', 'write')).toThrow(UserFacingError);
    expect(() => assertLearnWriteAllowed('.opencode/plugins/wolf-session-start.js', 'write')).toThrow(UserFacingError);
    expect(() => assertLearnWriteAllowed('.opencode/agents/apprentice.md', 'rewrite')).toThrow(UserFacingError);
  });

  it('память и шаблоны разрешены', () => {
    expect(() => assertLearnWriteAllowed('.wolf/memory/threads/t1/WORK-THREAD.md', 'write')).not.toThrow();
    expect(() => assertLearnWriteAllowed('.wolf/memory/shared/lessons/mem_x.md', 'rewrite')).not.toThrow();
    expect(() => assertLearnWriteAllowed('.wolf/templates/foo.md', 'write')).not.toThrow();
    expect(() => assertLearnWriteAllowed('src/app/use-cases/x.ts', 'write')).not.toThrow();
  });

  it('нормализация путей: ./, backslash, ведущий /', () => {
    expect(() => assertLearnWriteAllowed('./.wolf/events.jsonl', 'write')).toThrow(UserFacingError);
    expect(() => assertLearnWriteAllowed('.wolf\\events.jsonl', 'write')).toThrow(UserFacingError);
    expect(() => assertLearnWriteAllowed('/.wolf/events.jsonl', 'write')).toThrow(UserFacingError);
    expect(() => assertLearnWriteAllowed('.wolf//metrics/./session-metrics.jsonl', 'unlink')).toThrow(UserFacingError);
  });
});
