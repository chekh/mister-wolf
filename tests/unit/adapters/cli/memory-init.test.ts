// tests/unit/adapters/cli/memory-init.test.ts
// Тонкий CLI (D12/Q11): чистые помощники + жёсткая ошибка не-TTY без --model.
// process.stdout.isTTY в vitest — undefined → прогон команды идёт по не-TTY ветке.
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  memoryInitCommand,
  modelSuggestions,
  readGlobalOpencodeModel,
  renderNextSteps,
  askModel,
  askPlatformChoice,
} from '../../../../src/adapters/cli/commands/memory-init.js';

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

describe('modelSuggestions (§4.5: ENV известных провайдеров + глобальный конфиг opencode)', () => {
  it('ENV-ключи → предложения; несколько провайдеров', () => {
    expect(modelSuggestions({ ZAI_API_KEY: 'x', ANTHROPIC_API_KEY: 'y' }, null)).toEqual([
      'zai-coding-plan/glm-5.3',
      'anthropic/claude-sonnet-4-5',
    ]);
  });

  it('глобальный конфиг — первым; дубликат схлопывается', () => {
    expect(modelSuggestions({ ZAI_API_KEY: 'x' }, 'my-provider/my-model')).toEqual([
      'my-provider/my-model',
      'zai-coding-plan/glm-5.3',
    ]);
    expect(modelSuggestions({ ZAI_API_KEY: 'x' }, 'zai-coding-plan/glm-5.3')).toEqual(['zai-coding-plan/glm-5.3']);
  });

  it('окружение молчит → предложений нет (детект «по возможности»)', () => {
    expect(modelSuggestions({}, null)).toEqual([]);
  });
});

describe('readGlobalOpencodeModel (только чтение)', () => {
  it('читает model из opencode.json', () => {
    const model = readGlobalOpencodeModel((p) =>
      p.endsWith('opencode.json') ? JSON.stringify({ model: 'prov/model' }) : null
    );
    expect(model).toBe('prov/model');
  });

  it('понимает jsonc с комментариями', () => {
    const model = readGlobalOpencodeModel((p) => (p.endsWith('.jsonc') ? '{ // c\n "model": "a/b" }' : null));
    expect(model).toBe('a/b');
  });

  it('model без provider-префикса или нечитаемый конфиг → null', () => {
    expect(readGlobalOpencodeModel(() => JSON.stringify({ model: 'just-model' }))).toBeNull();
    expect(readGlobalOpencodeModel(() => '{ broken')).toBeNull();
    expect(readGlobalOpencodeModel(() => null)).toBeNull();
  });
});

describe('askModel (§4.5: Enter — первое предложение, свободный ввод, пропустить нельзя)', () => {
  it('Enter → первое предложение', async () => {
    const rl = fakeRl(['']);
    expect(await askModel(rl, ['zai-coding-plan/glm-5.3', 'anthropic/claude-sonnet-4-5'])).toBe(
      'zai-coding-plan/glm-5.3'
    );
  });

  it('номер → соответствующее предложение; свободный ввод принимается как есть', async () => {
    expect(await askModel(fakeRl(['2']), ['a/b', 'c/d'])).toBe('c/d');
    expect(await askModel(fakeRl(['my-prov/my-model']), ['a/b'])).toBe('my-prov/my-model');
  });

  it('без предложений: пустой ответ НЕ пропускает вопрос — переспрашивает', async () => {
    const rl = fakeRl(['', 'prov/model']);
    expect(await askModel(rl, [])).toBe('prov/model');
    expect(rl.questions).toHaveLength(2);
  });
});

describe('askPlatformChoice (§4.4 п.2: opencode дефолт, найденные — в предложении)', () => {
  it('Enter → opencode (дефолт)', async () => {
    expect(await askPlatformChoice(fakeRl(['']), '/tmp')).toEqual(['opencode']);
  });

  it('множественный выбор через запятую; неизвестный id — переспрос', async () => {
    expect(await askPlatformChoice(fakeRl(['opencode,claude']), '/tmp')).toEqual(['opencode', 'claude']);
    const rl = fakeRl(['vscode', 'claude']);
    expect(await askPlatformChoice(rl, '/tmp')).toEqual(['claude']);
    expect(rl.questions).toHaveLength(2);
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

describe('не-TTY без --model — жёсткая ошибка (Q11)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ненулевой контекст: UserFacingError с точной командой', async () => {
    await expect(memoryInitCommand().parseAsync([], { from: 'user' })).rejects.toThrow(
      /non-interactive init requires a model; re-run: wolf init --model <providerID\/modelID> \[--platform <ids>\]/
    );
  });
});
