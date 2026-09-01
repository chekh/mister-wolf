// tests/unit/adapters/render/plugin-injection.test.ts
// Поведенческий тест плагина из harness-шаблона (Task 13.3, спека §9:
// H3 идемпотентность, MAJ-1 повторная инъекция, MAJ-4 усечение L2,
// m13 fail-safe) + контракт загрузчика opencode: ровно один export.
//
// computeInjection приватна (дефект догфудинга фазы C: loader opencode
// вызывает КАЖДЫЫ export файла плагина как фабрику — лишние экспорты
// валили загрузку всего плагина), поэтому тестируем через хуки фабрики.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { execFileMock } = vi.hoisted(() => {
  const execFileMock = vi.fn((_file: unknown, _args: string[], _opts: unknown, cb?: unknown) => {
    const done = (typeof _opts === 'function' ? _opts : cb) as
      | ((err: Error | null, res?: { stdout: string }) => void)
      | undefined;
    if (!done) throw new Error('execFile: callback not found');
    // recap/call не нужны для проверки тел инъекции — тихий stdout
    return done(null, { stdout: '' });
  });
  return { execFileMock };
});
vi.mock('child_process', () => ({ execFile: execFileMock }));

const templatePath = (rel: string) =>
  fileURLToPath(new URL(`../../../../templates/opencode/plugins/${rel}`, import.meta.url));

const { WolfSessionStartPlugin } = await import(templatePath('wolf-session-start.js'));

interface Part {
  type: string;
  text?: string;
}
interface Msg {
  info: { role: string };
  parts: Part[];
}
const msg = (text: string): Msg => ({ info: { role: 'user' }, parts: [{ type: 'text', text }] });
const MARKER = 'Mr.Wolf session bootstrap'; // контракт маркера (стабильная строка)
const withMarker = [msg(`<session_context>\n${MARKER}\n\n## Recap\n…\n</session_context>`), msg('дальше')];
const fresh = [msg('новый вопрос после /clear')];

const GOVERNANCE = ['1%-правило', 'SUBAGENT-STOP', 'Лестница приоритетов', 'process-скиллы', 'rigid', 'flexible'];
const DISPATCH = ['1%', 'SUBAGENT-STOP', 'Лестница приоритетов', 'process-скиллы'];

const hooks = await WolfSessionStartPlugin({});
const transform = hooks['experimental.chat.messages.transform'];
const systemTransform = hooks['experimental.chat.system.transform'];
const setAgent = async (id: string | null) => {
  const system = id ? `рамка агента\n\nagent-id: ${id}\n` : 'просто системный промпт';
  await systemTransform({}, { system: [system] });
};
const textOf = (m: Msg) => m.parts.map((p) => String(p.text ?? '')).join('\n');

describe('wolf-session-start: контракт загрузчика opencode (дефект фазы C)', () => {
  it('шаблоны плагинов содержат РОВНО ОДИН export — фабрику плагина', () => {
    for (const rel of ['wolf-session-start.js', 'wolf-router.ts']) {
      const src = readFileSync(templatePath(rel), 'utf-8');
      const exports = src.match(/^export\b.*$/gm) ?? [];
      expect(exports, rel).toHaveLength(1);
      expect(exports[0], rel).toMatch(/WolfSessionStartPlugin|WolfPlaybookPlugin/);
    }
  });
});

describe('wolf-session-start: инъекция (спека §5.4)', () => {
  it('маркер в транскрипте → инъекции нет (H3: идемпотентность)', async () => {
    await setAgent('mr-wolf');
    const out = { messages: withMarker.map((m) => ({ ...m, parts: [...m.parts] })) };
    await transform({}, out);
    // инъекции нет: исходные части не тронуты (маркер уже был в транскрипте)
    expect(out.messages[0].parts).toHaveLength(1);
  });

  it('маркера нет → инъекция; полный governance-набор для L0/L1 (H2)', async () => {
    await setAgent('executor-lead');
    const out = { messages: fresh.map((m) => ({ ...m, parts: [...m.parts] })) };
    await transform({}, out);
    const injected = textOf(out.messages[0]);
    expect(injected).toContain(MARKER);
    for (const marker of GOVERNANCE) expect(injected, marker).toContain(marker);
    // контракт рендера: только разрешённые плейсхолдеры (manifest.substitute не упадёт)
    expect(injected).not.toMatch(/\{\{tool\.(?!skill\b|task\b|todowrite\b)\w+\}\}/);
  });

  it('agent-id worker-* → усечённое тело: нет диспетчерского контура (MAJ-4, §11.8)', async () => {
    await setAgent('worker-implementer');
    const out = { messages: fresh.map((m) => ({ ...m, parts: [...m.parts] })) };
    execFileMock.mockClear();
    await transform({}, out);
    const injected = textOf(out.messages[0]);
    expect(injected).toContain(MARKER);
    expect(injected).toContain('пассив');
    expect(injected).toContain('rigid');
    for (const marker of DISPATCH) expect(injected, marker).not.toContain(marker);
    // L2 не дергает recap/call вообще
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('MAJ-1: маркер исчез (новая сессия) → инъекция выполняется снова', async () => {
    await setAgent('mr-wolf');
    const stale = { messages: withMarker.map((m) => ({ ...m, parts: [...m.parts] })) };
    await transform({}, stale); // маркер был — ничего
    const anew = { messages: fresh.map((m) => ({ ...m, parts: [...m.parts] })) };
    await transform({}, anew); // чистый транскрипт — снова инъекция
    expect(textOf(anew.messages[0])).toContain(MARKER);
  });

  it('fail-safe (m13): битый вход → не бросает, сессию не роняет', async () => {
    await setAgent('mr-wolf');
    await expect(transform({}, { messages: null })).resolves.toBeUndefined();
    await expect(transform({}, {})).resolves.toBeUndefined();
    await expect(transform(null as never, { messages: [] })).resolves.toBeUndefined();
  });
});
