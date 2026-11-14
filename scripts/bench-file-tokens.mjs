#!/usr/bin/env node
// Гейт волны EN-базы (REQ-06, design §4.5, гейт 3): токен-оценка ceil(chars/4).
// --file <path>...   печатает оценку по каждому файлу (это же команда фиксации
//                    RU-бейзлайна, §4.4).
// --baseline <path>  сравнивает с артефактом §4.4 {files: [{path, tokens}]}
//                    пофайлово: EN ≤ baseline для каждого файла → exit 0, иначе
//                    exit 1 + таблица превышений (file/EN/baseline/дельта).
// Один и тот же оценщик для RU и EN — сравнение честное, абсолютные значения —
// приближение (ADR-3). Подключение в npm run check — T-11 (после G0).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const fail = (msg) => {
  console.error(`bench-file-tokens: ${msg}`);
  process.exit(1);
};

const FIX_BASELINE = 'сначала зафиксируй baseline (JSON §4.4: {files: [{path, tokens}]})';

const files = [];
let baselinePath;
const argv = process.argv.slice(2);
for (let k = 0; k < argv.length; k++) {
  if (argv[k] === '--file') files.push(argv[++k]);
  else if (argv[k] === '--baseline') baselinePath = argv[++k];
  else fail(`unknown argument "${argv[k]}" (usage: --file <path>... [--baseline <path>])`);
}
if (files.length === 0) fail('no --file given (usage: --file <path>... [--baseline <path>])');

function tokensOf(p) {
  if (!existsSync(p) || !statSync(p).isFile()) fail(`not a file: ${p}`);
  return Math.ceil(readFileSync(p, 'utf8').length / 4);
}

// Без baseline — просто печать оценок.
if (!baselinePath) {
  for (const f of files) console.log(`${f}: ${tokensOf(f)}`);
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  fail(`baseline not found: ${baselinePath}\n  ${FIX_BASELINE}`);
}

let artifact;
try {
  artifact = JSON.parse(readFileSync(baselinePath, 'utf8'));
} catch (e) {
  fail(`baseline is not valid JSON: ${e.message}`);
}
const raw = Array.isArray(artifact?.files)
  ? artifact.files
  : artifact?.files && typeof artifact.files === 'object'
    ? Object.entries(artifact.files).map(([path, tokens]) => ({ path, tokens }))
    : null;
if (!raw) fail(`baseline format: expected {files: [{path, tokens}]} (§4.4)\n  ${FIX_BASELINE}`);
const baseline = new Map();
for (const e of raw) {
  if (typeof e?.path !== 'string' || typeof e?.tokens !== 'number') fail(`baseline entry malformed: ${JSON.stringify(e)}\n  ${FIX_BASELINE}`);
  baseline.set(e.path, e.tokens);
  baseline.set(resolve(e.path), e.tokens); // ключи артефакта могут быть относительными
}

const over = [];
for (const f of files) {
  const en = tokensOf(f);
  const base = baseline.get(f) ?? baseline.get(resolve(f));
  if (base === undefined) fail(`нет записи baseline для ${f} — ${FIX_BASELINE}`);
  if (en > base) over.push({ f, en, base });
}

if (over.length > 0) {
  console.error(`bench-file-tokens: ${over.length} file(s) exceed baseline:`);
  console.error('file\tEN\tbaseline\tdelta');
  for (const { f, en, base } of over) console.error(`${f}\t${en}\t${base}\t+${en - base}`);
  process.exit(1);
}
console.log(`bench-file-tokens: OK (${files.length} file(s) within baseline)`);
