// REQ-06 (design §4.5): контракты трёх гейтов волны EN-базы.
// Гейт 1 — check-delivery-language.mjs: 0 кириллицы в templates/** (ADR-2).
// Гейт 4 — check-glossary-consistency.mjs: approved-глоссарий §4.3 (уникальность
//          RU/EN-колонок, aliases вне templates/**, status файла = approved).
// Гейт 3 — bench-file-tokens.mjs: ceil(chars/4), сравнение с baseline §4.4 (ADR-3).
// Wiring в npm run check — отдельная задача T-11 (после G0), здесь не проверяется.
// Fixtures — временные каталоги (os.tmpdir + mkdtemp), репозиторий не изменяется.
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const scriptsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'scripts');

interface RunResult {
  status: number;
  out: string;
}

function run(script: string, args: string[]): RunResult {
  const res = spawnSync(process.execPath, [join(scriptsDir, script), ...args], { encoding: 'utf8' });
  return { status: res.status ?? -1, out: `${res.stdout}${res.stderr}` };
}

function makeTmp(): string {
  return mkdtempSync(join(tmpdir(), 'wolf-delivery-gates-'));
}

function write(root: string, rel: string, content: string): string {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
  return abs;
}

// Глоссарий по design §4.3: front-matter со status файла + таблица
// | RU термин | EN термин | Статус | Aliases (запрещено) | Примечание |
function glossaryDoc(opts: { status?: string; rows: string[] }): string {
  return [
    '---',
    'slug: glossary-ru-en',
    'title: Глоссарий перевода Wolf RU→EN',
    `status: ${opts.status ?? 'approved'}`,
    '---',
    '| RU термин | EN термин | Статус | Aliases (запрещено) | Примечание |',
    '|---|---|---|---|---|',
    ...opts.rows,
    '',
  ].join('\n');
}

describe('REQ-06 гейт 1: check-delivery-language.mjs (0 кириллицы в templates/**)', () => {
  it('exit 0 на ASCII-only дереве (включая .ts)', () => {
    const root = makeTmp();
    write(root, 'AGENTS.md', '# Base agent (English only)\n');
    write(root, 'skills/helper.ts', "export const greeting = 'hello';\n");
    const res = run('check-delivery-language.mjs', [root]);
    expect(res.status).toBe(0);
    expect(res.out).toContain('OK');
  });

  it('exit 1 + path:line при кириллице; ASCII-файлы не флагуются', () => {
    const root = makeTmp();
    write(root, 'clean.md', 'English only file.\n');
    write(root, 'nested/ru.ts', "const s = 'ok';\n// привет мир\n");
    const res = run('check-delivery-language.mjs', [root]);
    expect(res.status).toBe(1);
    expect(res.out).toContain('nested/ru.ts:2');
    expect(res.out).not.toContain('clean.md');
  });
});

// Формат глоссария волны (факт. артефакт T-01 = контракт TASK): 4 колонки
// со статусом последней, значения статуса в backticks, маркер утверждения —
// строка «Статус: approved» в теле (front-matter §4.3 тоже принимается).
function glossaryDocWave(rows: string[], fileStatus?: string): string {
  return [
    '# Глоссарий RU→EN — волна перевода поставки',
    '',
    ...(fileStatus ? [`Статус: ${fileStatus}`, ''] : []),
    '| RU-термин | EN-термин | Запрещённые варианты (aliases) | Статус |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

describe('REQ-06 гейт 4: check-glossary-consistency.mjs (§4.3)', () => {
  it('exit 0: approved-глоссарий, уникальные пары, aliases вне templates; candidate игнорируется', () => {
    const tmp = makeTmp();
    const tmpl = join(tmp, 'templates');
    // approved-aliases «lead wolf» и «orchestrator» отсутствуют;
    // alias «worker» из candidate-строки встречается — но candidate игнорируется.
    write(tmpl, 'AGENTS.md', 'The lead routes work to each worker.\n');
    const gl = write(
      tmp,
      'glossary.md',
      glossaryDoc({
        rows: [
          '| ведущий | lead | approved | lead wolf, orchestrator | Wolf term: face |',
          '| исполнитель | performer | candidate | worker | |',
        ],
      })
    );
    const res = run('check-glossary-consistency.mjs', ['--glossary', gl, '--root', tmpl]);
    expect(res.status).toBe(0);
    expect(res.out).toContain('OK');
  });

  it('N-2: alias в templates/** → exit 1 с term → file:line', () => {
    const tmp = makeTmp();
    const tmpl = join(tmp, 'templates');
    write(tmpl, 't.md', 'line one\nline two\nthe orchestrator routes work\n');
    const gl = write(
      tmp,
      'glossary.md',
      glossaryDoc({
        rows: ['| ведущий | lead | approved | lead wolf, orchestrator | |'],
      })
    );
    const res = run('check-glossary-consistency.mjs', ['--glossary', gl, '--root', tmpl]);
    expect(res.status).toBe(1);
    expect(res.out).toContain('orchestrator → t.md:3');
  });

  it('N-3: дубликат RU-термина среди approved-строк → exit 1', () => {
    const tmp = makeTmp();
    const tmpl = join(tmp, 'templates');
    write(tmpl, 'AGENTS.md', 'clean\n');
    const gl = write(
      tmp,
      'glossary.md',
      glossaryDoc({
        rows: ['| ведущий | lead | approved | lead wolf | |', '| ведущий | lead | approved | head wolf | |'],
      })
    );
    const res = run('check-glossary-consistency.mjs', ['--glossary', gl, '--root', tmpl]);
    expect(res.status).toBe(1);
    expect(res.out).toContain('ведущий');
    expect(res.out).toContain('duplicate');
  });

  it('N-3: дубликат EN-термина среди approved-строк → exit 1 (уникальны обе колонки)', () => {
    const tmp = makeTmp();
    const tmpl = join(tmp, 'templates');
    write(tmpl, 'AGENTS.md', 'clean\n');
    const gl = write(
      tmp,
      'glossary.md',
      glossaryDoc({
        rows: ['| ведущий | lead | approved | lead wolf | |', '| лидер | lead | approved | head wolf | |'],
      })
    );
    const res = run('check-glossary-consistency.mjs', ['--glossary', gl, '--root', tmpl]);
    expect(res.status).toBe(1);
    expect(res.out).toContain('duplicate');
  });

  it('формат волны (статус 4-я колонка, backticks): approved-alias в templates → exit 1, candidate игнорируется', () => {
    const tmp = makeTmp();
    const tmpl = join(tmp, 'templates');
    write(tmpl, 't.md', 'memory store vs хранилище\n');
    const gl = write(
      tmp,
      'glossary.md',
      glossaryDocWave(
        [
          '| память | memory | хранилище, база знаний | `approved` |',
          '| решение | decision | резолюция | `candidate` |',
        ],
        'approved'
      )
    );
    const res = run('check-glossary-consistency.mjs', ['--glossary', gl, '--root', tmpl]);
    expect(res.status).toBe(1);
    expect(res.out).toContain('хранилище → t.md:1');
    expect(res.out).not.toContain('резолюция');
  });

  it('формат волны: «Статус: approved» в теле, уникальные пары, aliases вне templates → exit 0', () => {
    const tmp = makeTmp();
    const tmpl = join(tmp, 'templates');
    write(tmpl, 'AGENTS.md', 'The lead routes work.\n');
    const gl = write(
      tmp,
      'glossary.md',
      glossaryDocWave(
        ['| ведущий | lead | lead wolf | `approved` |', '| решение | decision | резолюция | `candidate` |'],
        'approved'
      )
    );
    const res = run('check-glossary-consistency.mjs', ['--glossary', gl, '--root', tmpl]);
    expect(res.status).toBe(0);
    expect(res.out).toContain('OK');
  });

  it('файла глоссария нет → exit 1 с понятным сообщением (не crash)', () => {
    const tmp = makeTmp();
    const tmpl = join(tmp, 'templates');
    write(tmpl, 'AGENTS.md', 'clean\n');
    const res = run('check-glossary-consistency.mjs', ['--glossary', join(tmp, 'nope.md'), '--root', tmpl]);
    expect(res.status).toBe(1);
    expect(res.out).toMatch(/not found/i);
  });

  it('статус файла глоссария не approved → exit 1', () => {
    const tmp = makeTmp();
    const tmpl = join(tmp, 'templates');
    write(tmpl, 'AGENTS.md', 'clean\n');
    const gl = write(
      tmp,
      'glossary.md',
      glossaryDoc({
        status: 'draft',
        rows: ['| ведущий | lead | approved | lead wolf | |'],
      })
    );
    const res = run('check-glossary-consistency.mjs', ['--glossary', gl, '--root', tmpl]);
    expect(res.status).toBe(1);
    expect(res.out).toContain('not approved');
  });
});

describe('REQ-06 гейт 3: bench-file-tokens.mjs (ceil(chars/4), baseline §4.4)', () => {
  it('--file печатает ceil(chars/4) по каждому файлу', () => {
    const tmp = makeTmp();
    const a = write(tmp, 'a.md', 'abcdefghij'); // 10 chars → 3
    const b = write(tmp, 'b.md', 'abcdefgh'); // 8 chars → 2
    const res = run('bench-file-tokens.mjs', ['--file', a, '--file', b]);
    expect(res.status).toBe(0);
    expect(res.out).toContain(`${a}: 3`);
    expect(res.out).toContain(`${b}: 2`);
  });

  it('--baseline: EN ≤ baseline по каждому файлу → exit 0', () => {
    const tmp = makeTmp();
    const a = write(tmp, 'a.md', 'abcdefghij'); // 3 tokens
    const bp = write(
      tmp,
      'baseline.json',
      JSON.stringify({
        date: '2026-11-11',
        method: 'bench-file-tokens (chars/4, детерминированная оценка)',
        files: [{ path: a, tokens: 100 }],
      })
    );
    const res = run('bench-file-tokens.mjs', ['--file', a, '--baseline', bp]);
    expect(res.status).toBe(0);
  });

  it('--baseline: превышение → exit 1 с таблицей file/EN/baseline/дельта', () => {
    const tmp = makeTmp();
    const a = write(tmp, 'a.md', 'abcdefghij'); // 3 tokens > baseline 2
    const bp = write(
      tmp,
      'baseline.json',
      JSON.stringify({
        files: [{ path: a, tokens: 2 }],
      })
    );
    const res = run('bench-file-tokens.mjs', ['--file', a, '--baseline', bp]);
    expect(res.status).toBe(1);
    expect(res.out).toContain('exceed');
    expect(res.out).toContain('+1');
  });

  it('N-5: отсутствующий baseline → exit 1 с инструкцией «сначала зафиксируй baseline»', () => {
    const tmp = makeTmp();
    const a = write(tmp, 'a.md', 'abcdefghij');
    const res = run('bench-file-tokens.mjs', ['--file', a, '--baseline', join(tmp, 'missing.json')]);
    expect(res.status).toBe(1);
    expect(res.out).toMatch(/зафиксируй baseline/i);
  });

  it('файл без записи в baseline → exit 1 с инструкцией', () => {
    const tmp = makeTmp();
    const a = write(tmp, 'a.md', 'abcdefghij');
    const other = write(tmp, 'other.md', 'abcdefghij');
    const bp = write(tmp, 'baseline.json', JSON.stringify({ files: [{ path: other, tokens: 100 }] }));
    const res = run('bench-file-tokens.mjs', ['--file', a, '--baseline', bp]);
    expect(res.status).toBe(1);
    expect(res.out).toMatch(/записи baseline/i);
  });
});

// Уточнения контракта гейта 4 (design §4.5): совпадение целым словом и
// раздел «Исключения» глоссария (AC REQ-04: список исключений — в глоссарии).
describe('REQ-06 гейт 4: совпадение целым словом и исключения глоссария', () => {
  it('alias не ловится внутри другого слова: board ∉ onboarding, boot ∉ bootstrap', () => {
    const tmp = makeTmp();
    const tmpl = join(tmp, 'templates');
    write(tmpl, 'x.md', 'See onboarding, dashboard and bootstrap flow.\n');
    const gl = write(
      tmp,
      'glossary.md',
      glossaryDocWave(
        ['| консилиум | council | board | `approved` |', '| холодный старт | cold start | boot | `approved` |'],
        'approved'
      )
    );
    const res = run('check-glossary-consistency.mjs', ['--glossary', gl, '--root', tmpl]);
    expect(res.status).toBe(0);
    expect(res.out).toContain('OK');
  });

  it('alias целым словом → exit 1 (дрейф не пропускается)', () => {
    const tmp = makeTmp();
    const tmpl = join(tmp, 'templates');
    write(tmpl, 'x.md', 'The board decides.\n');
    const gl = write(tmp, 'glossary.md', glossaryDocWave(['| консилиум | council | board | `approved` |'], 'approved'));
    const res = run('check-glossary-consistency.mjs', ['--glossary', gl, '--root', tmpl]);
    expect(res.status).toBe(1);
    expect(res.out).toContain('board → x.md:1');
  });

  it('алиас из раздела «Исключения» не считается нарушением, счётчик печатается', () => {
    const tmp = makeTmp();
    const tmpl = join(tmp, 'templates');
    write(tmpl, 'x.md', 'Keep a log of the run.\n');
    const gl = write(
      tmp,
      'glossary.md',
      [
        '# Глоссарий',
        '',
        'Статус: approved',
        '',
        '| RU-термин | EN-термин | Запрещённые варианты (aliases) | Статус |',
        '| --- | --- | --- | --- |',
        '| след (размышления) | trace | log, trail | `approved` |',
        '',
        '## Исключения',
        '',
        '- `log` — имя каталога отчётов, не «trace».',
        '',
      ].join('\n')
    );
    const res = run('check-glossary-consistency.mjs', ['--glossary', gl, '--root', tmpl]);
    expect(res.status).toBe(0);
    expect(res.out).toContain('1 exceptions declared');
  });

  it('многословный алиас сохраняет силу (реальный маркер дрейфа)', () => {
    const tmp = makeTmp();
    const tmpl = join(tmp, 'templates');
    write(tmpl, 'x.md', 'Run a health check first.\n');
    const gl = write(
      tmp,
      'glossary.md',
      glossaryDocWave(['| доктор | doctor | health check | `approved` |'], 'approved')
    );
    const res = run('check-glossary-consistency.mjs', ['--glossary', gl, '--root', tmpl]);
    expect(res.status).toBe(1);
    expect(res.out).toContain('health check → x.md:1');
  });
});

describe('REQ-06 гейт 4: словоформы и покрытие строк (находки ревью F1/F2/F4)', () => {
  it('F1: дрейф во множественном числе ловится (orchestrators, health checks)', () => {
    const tmp = makeTmp();
    const tmpl = join(tmp, 'templates');
    write(tmpl, 'x.md', 'Two orchestrators route work.\n');
    const gl = write(
      tmp,
      'glossary.md',
      glossaryDocWave(['| ведущий | lead | orchestrator | `approved` |'], 'approved')
    );
    const res = run('check-glossary-consistency.mjs', ['--glossary', gl, '--root', tmpl]);
    expect(res.status).toBe(1);
    expect(res.out).toContain('orchestrator → x.md:1');
  });

  it('F2: строка без действующего EN-алиаса → exit 1 с указанием объявить waiver', () => {
    const tmp = makeTmp();
    const tmpl = join(tmp, 'templates');
    write(tmpl, 'x.md', 'clean text\n');
    const gl = write(
      tmp,
      'glossary.md',
      glossaryDocWave(['| правило | rule | политика, норма | `approved` |'], 'approved')
    );
    const res = run('check-glossary-consistency.mjs', ['--glossary', gl, '--root', tmpl]);
    expect(res.status).toBe(1);
    expect(res.out).toMatch(/без действующего EN-алиаса/i);
  });

  it('F2: объявленный waiver снимает требование EN-алиаса', () => {
    const tmp = makeTmp();
    const tmpl = join(tmp, 'templates');
    write(tmpl, 'x.md', 'clean text\n');
    const gl = write(
      tmp,
      'glossary.md',
      [
        '# Глоссарий',
        '',
        'Статус: approved',
        '',
        '| RU-термин | EN-термин | Запрещённые варианты (aliases) | Статус |',
        '| --- | --- | --- | --- |',
        '| правило | rule | политика, норма | `approved` |',
        '',
        '## Без машинного EN-контроля',
        '',
        '- `правило` — кандидаты заняты кодом.',
        '',
      ].join('\n')
    );
    const res = run('check-glossary-consistency.mjs', ['--glossary', gl, '--root', tmpl]);
    expect(res.status).toBe(0);
    expect(res.out).toContain('OK');
  });

  it('F4: исключение с опечаткой (нет такого алиаса) → exit 1', () => {
    const tmp = makeTmp();
    const tmpl = join(tmp, 'templates');
    write(tmpl, 'x.md', 'clean\n');
    const gl = write(
      tmp,
      'glossary.md',
      [
        '# Глоссарий',
        '',
        'Статус: approved',
        '',
        '| RU-термин | EN-термин | Запрещённые варианты (aliases) | Статус |',
        '| --- | --- | --- | --- |',
        '| след (размышления) | trace | log, trail | `approved` |',
        '',
        '## Исключения',
        '',
        '- `registr` — опечатка, такого алиаса нет.',
        '',
      ].join('\n')
    );
    const res = run('check-glossary-consistency.mjs', ['--glossary', gl, '--root', tmpl]);
    expect(res.status).toBe(1);
    expect(res.out).toContain('exception не соответствует');
  });
});

// G4-2: свойство «ноль ложных срабатываний на реалистичной английской прозе»
// обязано быть покрыто тестом — иначе регрессия невидима для CI.
describe('REQ-06 гейт 4: проза после перевода не даёт ложных срабатываний', () => {
  it('абзац технической прозы с общими словами → ни одного нарушения', () => {
    const tmp = makeTmp();
    const tmpl = join(tmp, 'templates');
    write(
      tmpl,
      'prose.md',
      [
        'The lead reviews each aspect of the work and records a memo.',
        'Checking the result, next iteration, milestone reached, round two.',
        'A worker pool needs visual inspection; a border case, border extent.',
        'Refresh the page, send authorization, apply this regulation.',
        'A manifest of images, a rollout plan, a boarding pass, logging setup.',
        'See the dashboard and the onboarding flow.',
      ].join('\n') + '\n'
    );
    const gl = write(
      tmp,
      'glossary.md',
      [
        '# Глоссарий',
        '',
        'Статус: approved',
        '',
        '| RU-термин | EN-термин | Запрещённые варианты (aliases) | Статус |',
        '| --- | --- | --- | --- |',
        '| ведущий | lead | orchestrator | `approved` |',
        '| правило | rule | policy, regulation-word | `approved` |',
        '',
        '## Исключения',
        '',
        '- `policy` — имя файла политики, не «rule».',
        '',
      ].join('\n')
    );
    const res = run('check-glossary-consistency.mjs', ['--glossary', gl, '--root', tmpl]);
    expect(res.status).toBe(0);
  });

  it('при этом реальный дрейф в той же прозе ловится', () => {
    const tmp = makeTmp();
    const tmpl = join(tmp, 'templates');
    write(tmpl, 'prose.md', 'See the knowledge base for details.\n');
    const gl = write(
      tmp,
      'glossary.md',
      [
        '# Глоссарий',
        '',
        'Статус: approved',
        '',
        '| RU-термин | EN-термин | Запрещённые варианты (aliases) | Статус |',
        '| --- | --- | --- | --- |',
        '| память | memory | knowledge base | `approved` |',
        '',
      ].join('\n')
    );
    const res = run('check-glossary-consistency.mjs', ['--glossary', gl, '--root', tmpl]);
    expect(res.status).toBe(1);
    expect(res.out).toContain('knowledge base → prose.md:1');
  });
});
