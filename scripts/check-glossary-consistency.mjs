#!/usr/bin/env node
// Гейт волны EN-базы (REQ-06, design §4.5, гейт 4): консистентность глоссария (§4.3).
// Парсит approved-строки glossary.md; проверки: (а) уникальность RU- и EN-колонок,
// (б) ни один alias не встречается ни в одном файле templates/**, (в) статус файла
// глоссария = approved. Строки candidate и шапки таблиц игнорируются.
// Нарушения: exit 1 с `term → file:line`. Подключение в npm run check — T-11 (после G0).
//
// Поддерживаемые форматы (машинальный разбор §4.3 «строки таблицы»):
// - колонки по заголовку таблицы: design-сэмпл (| RU термин | EN термин | Статус |
//   Aliases | Примечание |) и формат волны (| RU-термин | EN-термин |
//   Запрещённые варианты (aliases) | Статус |) — индексы берутся из заголовка;
// - значения статуса строк с backticks (`approved`) и без;
// - статус файла: front-matter `status:` или строка «Статус: <слово>» в теле.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const glossaryPath = resolve(repoRoot, argValue('--glossary') ?? 'docs/dev/2026-11-11-english-base-delivery/glossary.md');
const templatesRoot = resolve(repoRoot, argValue('--root') ?? 'templates');

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out.sort();
}

function fail(msg) {
  console.error(`glossary-consistency gate: ${msg}`);
  process.exit(1);
}

const violations = [];
const relGlossary = relative(repoRoot, glossaryPath);

let doc;
try {
  doc = readFileSync(glossaryPath, 'utf8');
} catch {
  fail(`glossary not found: ${relGlossary} — создай глоссарий по design §4.3 (docs/dev/2026-11-11-english-base-delivery/glossary.md)`);
}

// (в) статус файла глоссария — approved (утверждение владельцем). Маркеры:
// front-matter `status:` (§4.3) или строка «Статус: <слово>» в теле;
// отсутствие маркера = не approved (черновик).
const fmStatus = doc.match(/^status:\s*(\S+)/m);
const bodyStatus = doc.match(/^\s*(?:>\s*)?(?:\*\*)?Статус(?:\*\*)?\s*:\s*`?([A-Za-z]+)`?\s*(?:#.*)?$/im);
const fileStatus = fmStatus ? fmStatus[1].toLowerCase() : bodyStatus ? bodyStatus[1].toLowerCase() : null;
if (fileStatus !== 'approved') {
  fail(`glossary status is not approved (got: ${fileStatus ?? 'no status marker'}) — перевод группы не стартует без утверждённого глоссария (§4.3)`);
}

// Таблица: порядок колонок определяет заголовок; разделители и повторные шапки
// следующих секций пропускаются сами (их «статус» не approved).
const cleanCell = (c) => c.replace(/`/g, '').trim().toLowerCase();
let cols = null; // { ru, en, aliases, status } — индексы ячеек
const approvedRows = [];
doc.split('\n').forEach((raw, i) => {
  const line = raw.trim();
  if (!line.startsWith('|')) return;
  const cells = line.split('|').slice(1, -1).map((c) => c.trim());
  if (!cols) {
    const statusIdx = cells.findIndex((c) => cleanCell(c) === 'статус' || cleanCell(c) === 'status');
    if (statusIdx === -1) return; // ещё не строка заголовка глоссарной таблицы
    cols = { ru: 0, en: 1, aliases: cells.findIndex((c) => /alias|запрещ/i.test(c)), status: statusIdx };
    return;
  }
  if (cells.every((c) => /^[-–—:]*$/.test(c))) return; // разделитель |---|---|
  const rowStatus = cleanCell(cells[cols.status] ?? '');
  if (rowStatus === 'статус' || rowStatus === 'status') return; // шапка следующей секции
  if (cells.length <= Math.max(cols.ru, cols.en, cols.aliases, cols.status)) {
    violations.push(`broken table row → ${relGlossary}:${i + 1}`);
    return;
  }
  if (rowStatus !== 'approved') return; // candidate игнорируется, гейт учитывает только approved
  approvedRows.push({ ru: cells[cols.ru], en: cells[cols.en], aliases: cells[cols.aliases], line: i + 1 });
});
if (!cols) {
  fail(`no glossary table header (колонка «Статус» не найдена) → ${relGlossary} — таблица §4.3 обязательна`);
}

// (а) уникальность RU- и EN-колонок среди approved-строк (§4.3: один RU → один EN).
const seenRu = new Map();
const seenEn = new Map();
for (const row of approvedRows) {
  if (seenRu.has(row.ru)) {
    violations.push(`${row.ru} → ${relGlossary}:${row.line} (duplicate RU→EN mapping, first at line ${seenRu.get(row.ru)})`);
  } else {
    seenRu.set(row.ru, row.line);
  }
  if (seenEn.has(row.en)) {
    violations.push(`${row.en} → ${relGlossary}:${row.line} (duplicate EN mapping, first at line ${seenEn.get(row.en)})`);
  } else {
    seenEn.set(row.en, row.line);
  }
}

// (б) ни один alias не встречается ни в одном файле templates/**.
//
// Два уточнения к букве «ни один alias» (AC REQ-04 прямо допускает список
// исключений «в самом глоссарии»; design ADR-4 фиксирует границу честности):
// 1) совпадение — ЦЕЛОЕ слово (`\b`), не подстрока: иначе alias `board`
//    ловится внутри `onboarding`, `boot` — внутри `bootstrap`, `edge` —
//    внутри `knowledge`;
// 2) общие английские слова (`log`, `limit`, `version`, `target`…), которые
//    законно живут в коде, именах полей CLI и формате RESULT, перечисляются
//    в разделе «Исключения» глоссария с причиной и не считаются нарушением.
let files;
try {
  files = walk(templatesRoot);
} catch {
  fail(`templates root not found: ${templatesRoot}`);
}

// Раздел исключений: строки вида `- \`alias\` — причина` после заголовка
// «Исключения». Данные, а не зашитая в код магия: правится в глоссарии.
const exceptions = new Map();
const excHeader = /^#{1,6}\s*Исключени/i;
let inExceptions = false;
for (const raw of doc.split('\n')) {
  const line = raw.trim();
  if (/^#{1,6}\s/.test(line)) {
    inExceptions = excHeader.test(line);
    continue;
  }
  if (!inExceptions) continue;
  const m = line.match(/^[-*]\s+`?([^`—–:]+?)`?\s*[—–:]\s*(.+)$/);
  if (m) exceptions.set(m[1].trim().toLowerCase(), m[2].trim());
}

// Алиас из ячейки: пояснение в скобках означает УСЛОВНЫЙ запрет («валидация»
// нельзя переводить как `validation`, только если это перевод «проверки»).
// Машинно такой алиас проверить нельзя — без контекста он неотличим от канона
// соседней строки, поэтому условные алиасы в проверку не попадают; их дефицит
// закрывает правило покрытия строк ниже (waiver с причиной).
const isConditionalAlias = (a) => /\([^)]*\)\s*$/.test(a);
const normalizeAlias = (a) => a.replace(/\s*\([^)]*\)\s*$/, '').trim();

const aliases = [];
for (const row of approvedRows) {
  for (const raw of row.aliases.split(',')) {
    const value = raw.trim();
    if (!value) continue;
    if (isConditionalAlias(value)) continue;
    const a = normalizeAlias(value);
    if (!a) continue;
    if (exceptions.has(a.toLowerCase())) continue;
    // `\b` в JS опирается на ASCII-класс слов, поэтому границы задаются явно —
    // иначе алиас внутри кириллической фразы считался бы совпадением.
    // Словоформы: допускается только число/3-е лицо (`s`/`es`) — английский
    // перевод законно меняет число (`orchestrators`, `health checks`), и без
    // этого дрейф во множественном числе проходил бы незамеченным. Окончания
    // `ed`/`ing` НЕ допускаются: они порождают другие слова (`board`→`boarding`,
    // `log`→`logging`), то есть ложные срабатывания на обычной прозе.
    const escaped = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    aliases.push({
      alias: a,
      ru: row.ru,
      re: new RegExp(`(?<![A-Za-z0-9])${escaped}(?:s|es)?(?![A-Za-z0-9])`, 'i'),
    });
  }
}

// Покрытие строк: строка без действующего английского алиаса не ловится гейтом
// вовсе (остаются только русские маркеры, а они исчезнут с переводом). Такая
// строка обязана быть явно объявлена в разделе «Без машинного EN-контроля»
// глоссария с причиной — молчаливая потеря охвата запрещена (ревью F2).
const waivers = new Set();
const waiverHeader = /^#{1,6}\s*Без машинного EN-контроля/i;
let inWaivers = false;
for (const raw of doc.split('\n')) {
  const line = raw.trim();
  if (/^#{1,6}\s/.test(line)) {
    inWaivers = waiverHeader.test(line);
    continue;
  }
  if (!inWaivers) continue;
  const m = line.match(/^[-*]\s+`?([^`—–:]+?)`?\s*[—–:]/);
  if (m) waivers.add(m[1].trim().toLowerCase());
}
const rowsWithActiveEn = new Set(
  aliases.filter((a) => !/[А-Яа-яЁё]/.test(a.alias)).map((a) => a.ru.toLowerCase()),
);
for (const row of approvedRows) {
  const key = row.ru.toLowerCase();
  if (rowsWithActiveEn.has(key) || waivers.has(key)) continue;
  violations.push(
    `${row.ru} → ${relGlossary}:${row.line} (строка без действующего EN-алиаса: добавь точный алиас или объяви в разделе «Без машинного EN-контроля» с причиной)`,
  );
}

// Диагностика исключений: ключ, не совпавший ни с одним алиасом, — опечатка
// или устаревшая запись; молча принимать его нельзя (счётчик создавал бы
// видимость проверенного списка).
const declaredAliases = new Set();
for (const row of approvedRows) {
  for (const value of row.aliases.split(',').map((s) => s.trim())) {
    if (!value) continue;
    declaredAliases.add(normalizeAlias(value).toLowerCase());
  }
}
for (const key of exceptions.keys()) {
  if (!declaredAliases.has(key)) {
    violations.push(`${key} → ${relGlossary} (exception не соответствует ни одному aliases — опечатка или устаревшая запись)`);
  }
}
for (const f of files) {
  const buf = readFileSync(f);
  const text = buf.toString('utf8');
  const rel = relative(templatesRoot, f);
  if (buf.includes(0)) {
    // Бинарный файл: байтовый поиск без номера строки; регистр не нормализуем.
    for (const { alias } of aliases) {
      if (buf.includes(Buffer.from(alias, 'utf8'))) violations.push(`${alias} → ${rel} (binary file)`);
    }
    continue;
  }
  const lines = text.split('\n');
  for (const { alias, re } of aliases) {
    const lineNo = lines.findIndex((l) => re.test(l));
    if (lineNo !== -1) violations.push(`${alias} → ${rel}:${lineNo + 1}`);
  }
}

if (violations.length > 0) {
  console.error(`glossary-consistency gate: ${violations.length} violation(s)`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log(
  `glossary-consistency gate: OK (${approvedRows.length} approved terms, ${aliases.length} aliases checked across ${files.length} files, ${exceptions.size} exceptions declared in glossary)`,
);
