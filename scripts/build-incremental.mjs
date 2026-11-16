#!/usr/bin/env node
// Инкрементальный `tsc` не проверяет наличие выходных файлов: если buildinfo
// считает вывод актуальным, а `dist` удалён, сборка молча завершается с кодом 0.
// Поэтому при отсутствии артефакта кэш сбрасывается и запускается полная сборка.
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const buildInfo = join(root, 'node_modules/.cache/tsconfig.tsbuildinfo');
const artifact = join(root, 'dist/bootstrap/cli.js');

if (!existsSync(artifact) && existsSync(buildInfo)) {
  rmSync(buildInfo);
}

const result = spawnSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc')], {
  cwd: root,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
