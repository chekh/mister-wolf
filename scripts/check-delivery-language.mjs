#!/usr/bin/env node
// Гейт волны EN-базы (REQ-06, design §4.5, гейт 1): «0 кириллицы».
// Walk templates/** (все файлы, включая .ts/.js); байтовый тест [\u0400-\u04FF];
// 0 файлов с кириллицей → exit 0, иначе exit 1 + список path (+ номера строк
// для текстовых файлов). Исключений нет (ADR-2). Подключение в npm run check —
// после закрытия G0 (T-11), до того гейт транзиентно красный.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CYR = /[\u0400-\u04FF]/;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = process.argv[2] ? resolve(process.argv[2]) : join(repoRoot, 'templates');

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out.sort();
}

let files;
try {
  files = walk(root);
} catch {
  console.error(`delivery-language gate: cannot walk "${root}" (нет каталога; корень передаётся первым аргументом, по умолчанию templates/)`);
  process.exit(1);
}

const violations = [];
for (const f of files) {
  const buf = readFileSync(f);
  const text = buf.toString('utf8');
  if (!CYR.test(text)) continue;
  const rel = relative(root, f);
  if (buf.includes(0)) {
    // Бинарный файл: кириллица найдена по декодированным байтам, строки не считаем.
    violations.push(`${rel} (binary file, no line numbers)`);
    continue;
  }
  const lines = [];
  text.split('\n').forEach((line, i) => {
    if (CYR.test(line)) lines.push(i + 1);
  });
  violations.push(`${rel}:${lines.join(',')}`);
}

if (violations.length > 0) {
  console.error(`delivery-language gate: Cyrillic found in ${violations.length} file(s) under ${relative(repoRoot, root) || '.'}`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log(`delivery-language gate: OK (0 files with Cyrillic, ${files.length} files checked)`);
