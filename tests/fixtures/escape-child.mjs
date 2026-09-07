// tests/fixtures/escape-child.mjs — F26 runner для integration-теста sandbox-escape.
// Глубина ≥2: test → этот runner → dist/bootstrap/cli.js. Runner передаёт CLI
// ЯВНО сконструированный env (без XDG), моделируя дочерний процесс, потерявший
// переменные песочницы. НИКОГДА не запускать с env без WOLF_SANDBOX/HOME-мока.
//
// Usage: escape-child.mjs <mode> <projectDir> <sandboxDir> <mockHome>
//   mode=sandbox     → WOLF_SANDBOX=sandboxDir (существует), HOME=mockHome, XDG нет
//   mode=bad-sandbox → WOLF_SANDBOX=<sandboxDir>/nonexistent, HOME=mockHome, XDG нет
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const [mode, projectDir, sandboxDir, mockHome] = process.argv.slice(2);
if (!mode || !projectDir || !sandboxDir || !mockHome) {
  console.error('escape-child.mjs: usage: <mode> <projectDir> <sandboxDir> <mockHome>');
  process.exit(64);
}

const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: mockHome };
if (mode === 'bad-sandbox') env.WOLF_SANDBOX = join(sandboxDir, 'nonexistent');
else if (mode === 'sandbox') env.WOLF_SANDBOX = sandboxDir;
else {
  console.error(`escape-child.mjs: unknown mode: ${mode}`);
  process.exit(64);
}

const cli = join(process.cwd(), 'dist/bootstrap/cli.js');
const r = spawnSync(process.execPath, [cli, 'init', '--model', 'zai-coding-plan/glm-5.3'], {
  cwd: projectDir,
  env,
  encoding: 'utf-8',
});
process.stdout.write(r.stdout ?? '');
process.stderr.write(r.stderr ?? '');
process.exit(r.status ?? 1);
