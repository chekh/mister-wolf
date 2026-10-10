// tests/unit/adapters/cli/memory-init.test.ts
// Тонкий CLI (WP2 unpin, спека 2.16 §5): чистые помощники + не-TTY init без --model
// доходит до initProject с models = 'omit'. process.stdout.isTTY в vitest — undefined
// → прогон команды идёт по не-TTY ветке. initProject/контейнер мокаются:
// юнит не пишет в рабочее дерево; содержимое профилей покрывают интеграционные юниты
// (init-project-base-set.test.ts) и e2e (unpin-init.e2e.ts).
import { describe, it, expect, vi } from 'vitest';
import { memoryInitCommand, renderNextSteps, askPurpose } from '../../../../src/adapters/cli/commands/memory-init.js';
import { initProject } from '../../../../src/app/use-cases/init-project.js';

vi.mock('../../../../src/app/use-cases/init-project.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/app/use-cases/init-project.js')>();
  return {
    ...actual,
    initProject: vi.fn(async () => ({
      npx: false,
      platformOutcomes: [],
      baseSetOutcomes: [],
      initReport: { action: 'skipped' as const },
    })),
  };
});

vi.mock('../../../../src/bootstrap/container.js', () => ({
  createCliContainer: () => ({
    initializer: {},
    store: { list: async () => [] },
    log: {},
    clock: { now: () => new Date() },
    idGen: {},
    index: undefined,
    lock: undefined,
    declarations: undefined,
  }),
}));

/** Fake readline: заранее заготовленные ответы по порядку. */
function fakeRl(answers: string[]) {
  let i = 0;
  return {
    questions: [] as string[],
    async question(q: string): Promise<string> {
      this.questions.push(q);
      return answers[i++] ?? '';
    },
  };
}

describe('askPurpose (WP1, спека 2.16 §4: единственный вопрос дефолтного интервью)', () => {
  it('Enter → пустая строка (пропуск, note не сеется)', async () => {
    expect(await askPurpose(fakeRl(['']))).toBe('');
  });

  it('ответ обрезается по краям', async () => {
    expect(await askPurpose(fakeRl(['  wolf memory harness  ']))).toBe('wolf memory harness');
  });
});

describe('renderNextSteps (F6/F7: «Дальше»; restart — только при записанном MCP)', () => {
  it('npx try-out — подсказка установки, без блока «Дальше»', () => {
    const lines = renderNextSteps({ npx: true, mcpWritten: false, claudeConnected: false });
    expect(lines.join('\n')).toContain('npm install -g mister-wolf');
    expect(lines.join('\n')).not.toContain('bootstrap');
  });

  it('MCP записан: «Дальше» упоминает bootstrap и перезапуск opencode', () => {
    const text = renderNextSteps({ npx: false, mcpWritten: true, claudeConnected: false }).join('\n');
    expect(text).toContain('wolf bootstrap');
    expect(text).toContain('restart opencode');
  });

  it('MCP не записан в этом прогоне: restart-строки нет, bootstrap есть', () => {
    const text = renderNextSteps({ npx: false, mcpWritten: false, claudeConnected: false }).join('\n');
    expect(text).toContain('wolf bootstrap');
    expect(text).not.toContain('restart opencode');
  });
});

describe('не-TTY без --model — успех (WP2 unpin: omit по умолчанию)', () => {
  it('init доходит до initProject без модельного гейта: models=omit, modelSource undefined', async () => {
    await memoryInitCommand().parseAsync([], { from: 'user' });
    expect(initProject).toHaveBeenCalledTimes(1);
    const input = vi.mocked(initProject).mock.calls[0][2];
    expect(input.models).toBe('omit');
    expect(input.modelSource).toBeUndefined();
  });

  it('явный --model — opt-in: ModelContext (worker = primary), modelSource=flag', async () => {
    await memoryInitCommand().parseAsync(['--model', 'prov/model'], { from: 'user' });
    const input = vi.mocked(initProject).mock.calls.at(-1)![2];
    expect(input.models).toEqual({ primary: 'prov/model', worker: 'prov/model' });
    expect(input.modelSource).toBe('flag');
  });
});
