import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  TEMPLATE_CHAR_LIMIT,
  POOL_MAX,
  buildExamplePool,
  reflectorConstraints,
  scoreTemplate,
  compareTemplates,
  validateTemplateLength,
  evolveTemplate,
  mechanicalReflector,
  type EvolveExample,
  type TemplateReflector,
} from '../../../src/app/use-cases/template-evolve.js';
import { metricsLogPath, type SignalEvent } from '../../../src/adapters/fs/session-metrics-log.js';

let n = 0;

function ex(tool: string, i: number): EvolveExample {
  n += 1;
  return {
    ts: `2026-08-30T10:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.00${n % 10}Z`,
    tool_name: tool,
    error_class_id: 'cls',
    message: 'stub',
  };
}

function toolError(tool: string, i: number): SignalEvent {
  return {
    ...ex(tool, i),
    event: 'tool_error',
    session_id: null,
    gen_ai: { modelID: null, agent: null },
    orchestration: { task: null, actor: 'user:cli' },
    outcome: 'error',
    detail: { message: 'stub' },
  } as SignalEvent;
}

describe('buildExamplePool (M24-02: 20–100)', () => {
  it('< 20 tool_error → UserFacingError', () => {
    expect(() => buildExamplePool([toolError('bash', 1), toolError('bash', 2)])).toThrowError(/пул примеров 2 < 20/);
  });

  it('> 100 → обрезка до последних 100, порядок сохранён', () => {
    const signals = Array.from({ length: 120 }, (_, i) => toolError(`tool${i}`, i));
    const pool = buildExamplePool(signals);
    expect(pool).toHaveLength(POOL_MAX);
    // первые 20 отброшены, пул начинается с tool20 и идёт в исходном порядке
    expect(pool[0].tool_name).toBe('tool20');
    expect(pool[99].tool_name).toBe('tool119');
    expect(pool[1].ts <= pool[2].ts).toBe(true);
  });
});

describe('validateTemplateLength (M24-03: 1500)', () => {
  it('1501 символ → UserFacingError', () => {
    expect(() => validateTemplateLength('x'.repeat(1501), 'candidate')).toThrowError(/1501 символов > лимита 1500/);
  });

  it('ровно 1500 — ок', () => {
    expect(() => validateTemplateLength('x'.repeat(TEMPLATE_CHAR_LIMIT), 'current')).not.toThrow();
  });
});

describe('scoreTemplate — детерминированная метрика', () => {
  const examples = [...Array.from({ length: 3 }, (_, i) => ex('bash', i)), ex('grep', 3)];

  it("шаблон 'avoid: bash' предотвращает bash-ошибки, не предотвращает grep-ошибки", () => {
    const r = scoreTemplate('avoid: bash', examples);
    expect(r).toEqual({ prevented: 3, total: 4, score: 0.75 });
  });

  it('подстрока case-insensitive', () => {
    expect(scoreTemplate('AVOID: Bash!', [ex('bash', 0)]).score).toBe(1);
  });

  it('дробный score округляется до 4 знаков', () => {
    const three = [ex('bash', 0), ex('grep', 1), ex('rtk', 2)];
    expect(scoreTemplate('avoid: bash; avoid: grep', three).score).toBe(0.6667);
  });
});

describe('compareTemplates — Парето по инстансам (S24-05)', () => {
  it('кандидат покрывает строго больше без проигрышей → candidate_better', () => {
    const examples = [ex('bash', 0), ex('bash', 1), ex('grep', 2), ex('grep', 3)];
    const r = compareTemplates('avoid: bash', 'avoid: bash; avoid: grep', examples);
    expect(r.verdict).toBe('candidate_better');
    expect(r.winsCandidate).toBe(2);
    expect(r.winsCurrent).toBe(0);
    expect(r.candidateScore.score).toBe(1);
  });

  it('кандидат выигрывает 3, проигрывает 1 → no_gain', () => {
    const examples = [ex('bash', 0), ex('grep', 1), ex('grep', 2), ex('grep', 3)];
    const r = compareTemplates('avoid: bash', 'avoid: grep', examples);
    expect(r.winsCandidate).toBe(3);
    expect(r.winsCurrent).toBe(1);
    expect(r.verdict).toBe('no_gain');
  });

  it('текущий строго лучше без проигрышей → current_better', () => {
    const examples = [ex('bash', 0), ex('grep', 1)];
    const r = compareTemplates('avoid: bash; avoid: grep', 'avoid: bash', examples);
    expect(r.verdict).toBe('current_better');
    expect(r.winsCurrent).toBe(1);
    expect(r.winsCandidate).toBe(0);
  });
});

describe('reflectorConstraints (M24-04)', () => {
  it('содержит запрет дословного копирования примеров и лимит', () => {
    const text = reflectorConstraints().join('\n').toLowerCase();
    expect(text).toContain('дословн');
    expect(text).toContain('1500');
    expect(text).toContain('avoid');
  });
});

describe('evolveTemplate — dry-run и кандидат-файл', () => {
  let dir: string;
  let files: Map<string, string>;
  let written: { path: string; content: string }[];
  let reflectorInput: unknown;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-gepa-'));
    const signals = Array.from({ length: 20 }, (_, i) => toolError('bash', i));
    mkdirSync(join(dir, '.wolf', 'metrics'), { recursive: true });
    writeFileSync(metricsLogPath(dir), signals.map((s) => JSON.stringify(s)).join('\n') + '\n');
    files = new Map([
      [`${dir}/.wolf/templates/brief.md`.replace(/\\/g, '/'), 'Текущий шаблон брифа. avoid: nothing else.'],
    ]);
    written = [];
    reflectorInput = null;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function makeDeps() {
    return {
      readFile: async (path: string) => {
        const norm = path.replace(/\\/g, '/');
        if (!files.has(norm)) throw new Error(`ENOENT: ${norm}`);
        return files.get(norm)!;
      },
      writeFile: async (path: string, content: string) => {
        written.push({ path: path.replace(/\\/g, '/'), content });
        files.set(path.replace(/\\/g, '/'), content);
      },
    };
  }

  // фронтир-рефлектор за интерфейсом — в тестах чистая функция-мок, LLM нет
  const reflector: TemplateReflector = {
    reflect: async (input) => {
      reflectorInput = input;
      return { candidate: 'Шаблон брифа v2. avoid: bash — проверять таймаут.', notes: 'mock' };
    },
  };

  it('dryRun: writeFile не вызван, wrote=false, сравнение и пул возвращены', async () => {
    const r = await evolveTemplate(makeDeps(), dir, { templateId: 'brief', reflector, dryRun: true });
    expect(written).toHaveLength(0);
    expect(r.wrote).toBe(false);
    expect(r.poolSize).toBe(20);
    expect(r.comparison.verdict).toBe('candidate_better'); // кандидат добавил 'avoid: bash'
    expect(r.current).not.toContain('avoid: bash');
    expect(r.candidate).toContain('avoid: bash');
    expect((reflectorInput as { constraints: string[] }).constraints).toEqual(reflectorConstraints());
  });

  it('не dry-run: кандидат записан отдельным файлом, текущий не тронут, wrote=true', async () => {
    const r = await evolveTemplate(makeDeps(), dir, { templateId: 'brief', reflector, dryRun: false });
    expect(r.wrote).toBe(true);
    expect(written).toHaveLength(1);
    expect(written[0].path.endsWith('.wolf/templates/brief.candidate.md')).toBe(true);
    expect(written[0].content).toBe(r.candidate);
    // активации нет: исходный шаблон не перезаписан
    expect(files.get(`${dir}/.wolf/templates/brief.md`)).toBe('Текущий шаблон брифа. avoid: nothing else.');
  });

  it('нет файла шаблона → UserFacingError с подсказкой', async () => {
    files.clear();
    await expect(
      evolveTemplate(makeDeps(), dir, { templateId: 'brief', reflector, dryRun: true })
    ).rejects.toThrowError(/создайте файл шаблона/);
  });
});

describe('mechanicalReflector — детерминированный дефолт CLI (LLM за интерфейсом)', () => {
  it('добавляет avoid-указания по топ-тулам пула, не дублируя существующие', async () => {
    const examples: EvolveExample[] = [];
    for (let i = 0; i < 10; i++)
      examples.push({
        ts: `2026-01-0${(i % 9) + 1}T00:00:00Z`,
        tool_name: 'bash',
        error_class_id: 'timeout',
        message: 'x',
      });
    for (let i = 0; i < 5; i++)
      examples.push({
        ts: `2026-01-0${(i % 9) + 1}T00:00:00Z`,
        tool_name: 'grep',
        error_class_id: 'not_found',
        message: 'x',
      });
    const r = await mechanicalReflector().reflect({
      templateId: 'brief',
      current: 'Шаблон. avoid: bash',
      examples,
      constraints: reflectorConstraints(),
    });
    expect(r.candidate).toContain('Шаблон. avoid: bash');
    expect(r.candidate).toContain('avoid: grep');
    expect(r.candidate).not.toContain('avoid: bash\navoid: bash');
  });

  it('не превышает лимит 1500 символов', async () => {
    const examples: EvolveExample[] = Array.from({ length: 20 }, (_, i) => ({
      ts: '2026-01-01T00:00:00Z',
      tool_name: `tool-with-long-name-${i}`,
      error_class_id: 'misc',
      message: 'x',
    }));
    const current = 'т'.repeat(1490);
    const r = await mechanicalReflector().reflect({ templateId: 'b', current, examples, constraints: [] });
    expect(r.candidate.length).toBeLessThanOrEqual(TEMPLATE_CHAR_LIMIT);
  });
});
