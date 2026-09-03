#!/usr/bin/env node
// Гейт English surface: кириллица в строковых ЛИТЕРАЛАХ src/adapters/** запрещена.
// Комментарии/докстринги (RU — внутренняя разработка) и regex-литералы не флагуются:
// конечный автомат по коду/комментарию/строке. Спека: бриф 2.2.1 English surface, критерий 2.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'src/adapters';
const CYR = /[\u0400-\u04FF]/;

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Возвращает 1-based номера строк, где кириллица оказалась внутри строкового литерала. */
function cyrillicInStringLiterals(source) {
  const flagged = new Set();
  let state = 'code'; // code | line | block | single | double | template
  let line = 1;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '\n') line++;
    switch (state) {
      case 'code':
        if (c === '/' && next === '/') state = 'line';
        else if (c === '/' && next === '*') state = 'block';
        else if (c === "'") state = 'single';
        else if (c === '"') state = 'double';
        else if (c === '`') state = 'template';
        break;
      case 'line':
        if (c === '\n') state = 'code';
        break;
      case 'block':
        if (c === '*' && next === '/') {
          state = 'code';
          i++;
        }
        break;
      case 'single':
        if (c === '\\') i++;
        else if (c === "'" || c === '\n') state = 'code';
        else if (CYR.test(c)) flagged.add(line);
        break;
      case 'double':
        if (c === '\\') i++;
        else if (c === '"' || c === '\n') state = 'code';
        else if (CYR.test(c)) flagged.add(line);
        break;
      case 'template':
        if (c === '\\') i++;
        else if (c === '`') state = 'code';
        else if (CYR.test(c)) flagged.add(line);
        break;
    }
  }
  return [...flagged].sort((a, b) => a - b);
}

const files = walk(ROOT);
const violations = [];
for (const f of files) {
  const lines = cyrillicInStringLiterals(readFileSync(f, 'utf-8'));
  if (lines.length > 0) violations.push(`${f}:${lines.join(',')}`);
}

if (violations.length > 0) {
  console.error('english-surface gate: Cyrillic in string literals of src/adapters/**');
  for (const v of violations) console.error(`  ${v}`);
  console.error('User-facing adapter output must be English (comments may stay RU).');
  process.exit(1);
}
console.log(`english-surface gate: OK (${files.length} files checked)`);
